//! トピックイベントのリッスン・処理

use futures::StreamExt;
use iroh_gossip::api::Event;
use iroh_gossip::api::Message;
use tauri::{AppHandle, Emitter, Manager};

use crate::db::DbState;
use crate::team::task_sync::{apply_task_update, TaskUpdatePayload};

use super::broadcast::{
    broadcast_blocked_notify, broadcast_join_request, broadcast_member_join,
    broadcast_member_roster, broadcast_permission_change, broadcast_team_disband,
};
use super::helpers::{
    apply_member_roster, can_approve_or_reject, clear_members_if_no_team,
    collect_active_member_roster, get_my_endpoint_id, normalize_endpoint_id,
    upsert_member_joined_active,
};
use super::pending_invite_preview::clear_pending_invite_preview;
use super::payloads::{
    JoinRequestPayload, MemberBlockedNotifyPayload, MemberDisplayNamePayload, MemberOpPayload,
    MemberRosterPayload, MemberSyncNeedPayload, PermissionChangePayload, TeamDisbandPayload,
    TeamNamePayload,
};
use super::pending::{PendingJoinInfo, PendingJoinsState};
use super::pending_db;
use super::IrohState;

#[inline]
fn gossip_topic_matches(message_topic: &str, listener_topic: &str) -> bool {
    message_topic.eq_ignore_ascii_case(listener_topic)
}

/// team_disband 受信時の処理（unsubscribe + DB クリア）
async fn handle_team_disband(app: &AppHandle, topic_id: &str, pending_joins: &PendingJoinsState) {
    if let Some(iroh) = app.try_state::<IrohState>() {
        let guard = iroh.read().await;
        if let Some(node) = guard.as_ref() {
            node.unsubscribe(topic_id).await;
        }
    }
    if let Some(state) = app.try_state::<DbState>() {
        let _ = state.0.lock().map(|db| {
            let _ = pending_db::delete_pending_for_topic(&db, topic_id);
            let _ = db.execute(
                "DELETE FROM team_subscriptions WHERE topic_id = ?1",
                rusqlite::params![topic_id],
            );
            let _ = db.execute("DELETE FROM members", []);
        });
    }
    {
        let mut guard = pending_joins.write().await;
        guard.retain(|p| p.topic_id != topic_id);
    }
    let _ = app.emit("team-disbanded", ());
}

/// トピックのイベントをリッスン（NeighborUp=参加申請[ホストのみ]、NeighborDown=離脱検知[全員]、Received=各種Operation）
pub async fn spawn_topic_listener(
    mut receiver: iroh_gossip::api::GossipReceiver,
    pending_joins: PendingJoinsState,
    app: AppHandle,
    topic_id: String,
    is_host: bool,
) {
    let topic_id = topic_id.to_ascii_lowercase();
    while let Some(event) = receiver.next().await {
        match event {
            Ok(Event::NeighborUp(node_id)) if is_host => {
                let endpoint_id = normalize_endpoint_id(&node_id.to_string());
                let (is_blocked, already_active) = if let Some(state) = app.try_state::<DbState>() {
                    state.0.lock().map_or((false, false), |db| {
                        let blocked = db
                            .query_row(
                                "SELECT 1 FROM members WHERE lower(endpoint_id) = lower(?1) AND status = 'blocked'",
                                [&endpoint_id],
                                |_| Ok(()),
                            )
                            .is_ok();
                        let active = db
                            .query_row(
                                "SELECT 1 FROM members WHERE lower(endpoint_id) = lower(?1) AND status = 'active'",
                                [&endpoint_id],
                                |_| Ok(()),
                            )
                            .is_ok();
                        (blocked, active)
                    })
                } else {
                    (false, false)
                };
                if is_blocked {
                    if let Some(iroh) = app.try_state::<IrohState>() {
                        let _ = broadcast_blocked_notify(&iroh, &endpoint_id).await;
                    }
                } else if already_active {
                    // 承認済みメンバーの再接続: 参加申請には載せない。
                    // NeighborUp で member_join を再送すると gossip が増え、iroh-gossip の
                    // Lagged で join_request 等が落ちることがあるため送らない（承認時の遅延再送に任せる）。
                } else {
                    let requested_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let info = PendingJoinInfo {
                        endpoint_id: endpoint_id.clone(),
                        topic_id: topic_id.clone(),
                        requested_at: requested_at.clone(),
                    };
                    {
                        let mut guard = pending_joins.write().await;
                        if !guard.iter().any(|p| {
                            normalize_endpoint_id(&p.endpoint_id) == endpoint_id
                                && p.topic_id == topic_id
                        }) {
                            guard.push(info.clone());
                            if let Some(state) = app.try_state::<DbState>() {
                                let _ = state
                                    .0
                                    .lock()
                                    .map(|db| pending_db::upsert_pending_join(&db, &info));
                            }
                        }
                    }
                    let _ = app.emit("team-pending-join", &info);
                    // CO-HOST が参加申請を見れるよう broadcast
                    if let Some(iroh) = app.try_state::<IrohState>() {
                        let payload = JoinRequestPayload {
                            r#type: "join_request".to_string(),
                            endpoint_id: endpoint_id.clone(),
                            topic_id: topic_id.clone(),
                            requested_at: requested_at.clone(),
                        };
                        let _ = broadcast_join_request(&iroh, &topic_id, &payload).await;
                    }
                }
            }
            Ok(Event::Received(Message { content, .. })) => {
                let slice = content.as_ref();
                // member_join は JSON の "type" で先に処理（task_update との取り違え防止）
                let mut member_join_handled = false;
                if let Ok(v) = serde_json::from_slice::<serde_json::Value>(slice) {
                    if v.get("type").and_then(|x| x.as_str()) == Some("member_join") {
                        member_join_handled = true;
                        // Value から直接取る（serde の struct 変換失敗で黙って捨てるのを防ぐ）
                        let tid_msg = v.get("topic_id").and_then(|x| x.as_str()).unwrap_or("");
                        if gossip_topic_matches(tid_msg, &topic_id) {
                            if let Some(ep_raw) = v.get("endpoint_id").and_then(|x| x.as_str()) {
                                let ep = normalize_endpoint_id(ep_raw);
                                let ver = v.get("version").and_then(|x| x.as_str()).unwrap_or("1.0");
                                if ver == "1.0" && !ep.is_empty() {
                                    // デッドロック防止: Mutex を解放してから emit する
                                    let upsert_ok = if let Some(state) = app.try_state::<DbState>() {
                                        match state.0.lock() {
                                            Ok(db) => {
                                                match upsert_member_joined_active(&db, &ep) {
                                                    Ok(()) => true,
                                                    Err(e) => {
                                                        eprintln!(
                                                            "member_join upsert failed (ep={}): {}",
                                                            ep, e
                                                        );
                                                        false
                                                    }
                                                }
                                            }
                                            Err(e) => {
                                                eprintln!("member_join db lock: {}", e);
                                                false
                                            }
                                        }
                                    } else {
                                        false
                                    };
                                    if upsert_ok {
                                        if let Some(iroh) = app.try_state::<IrohState>() {
                                            let my_id =
                                                get_my_endpoint_id(&iroh).await;
                                            if !my_id.is_empty()
                                                && normalize_endpoint_id(&my_id) == ep
                                            {
                                                if let Some(state) =
                                                    app.try_state::<DbState>()
                                                {
                                                    let _ = state.0.lock().map(|db| {
                                                        let _ =
                                                            clear_pending_invite_preview(&db);
                                                    });
                                                }
                                            }
                                        }
                                        let _ = app.emit("team-members-updated", ());
                                    }
                                }
                            }
                        }
                    }
                }
                if member_join_handled {
                    // 上で member_join として解釈済み（task_update に流さない）
                } else if let Ok(roster_p) = serde_json::from_slice::<MemberRosterPayload>(slice) {
                    if roster_p.r#type == "member_roster" {
                        let ver = roster_p.version.as_deref().unwrap_or("1.0");
                        if ver == "1.0" && gossip_topic_matches(&roster_p.topic_id, &topic_id) {
                            let mut applied = false;
                            if let Some(state) = app.try_state::<DbState>() {
                                if let Ok(db) = state.0.lock() {
                                    match apply_member_roster(
                                        &db,
                                        roster_p.topic_id.as_str(),
                                        &roster_p.members,
                                    ) {
                                        Ok(()) => applied = true,
                                        Err(e) => eprintln!("apply_member_roster: {}", e),
                                    }
                                }
                            }
                            if applied {
                                let _ = app.emit("team-members-updated", ());
                            }
                        }
                    }
                } else if let Ok(payload) = serde_json::from_slice::<TaskUpdatePayload>(slice) {
                    let version = payload.version.as_deref().unwrap_or("1.0");
                    if version != "1.0" {
                        let _ = app.emit("team-update-required", ());
                    } else if let Some(state) = app.try_state::<DbState>() {
                        let _ = apply_task_update(&state, &payload, Some(&app));
                    }
                } else if let Ok(join_req) = serde_json::from_slice::<JoinRequestPayload>(slice) {
                    if join_req.r#type == "join_request"
                        && gossip_topic_matches(&join_req.topic_id, &topic_id)
                    {
                        let my_id = if let Some(iroh) = app.try_state::<IrohState>() {
                            get_my_endpoint_id(&iroh).await
                        } else {
                            String::new()
                        };
                        let join_ep = normalize_endpoint_id(&join_req.endpoint_id);
                        // ゲストが自分でブロードキャストした join_request を自分の pending に入れない
                        if join_ep != my_id {
                            let tid = join_req.topic_id.to_ascii_lowercase();
                            let info = PendingJoinInfo {
                                endpoint_id: join_ep,
                                topic_id: tid,
                                requested_at: join_req.requested_at,
                            };
                            let mut guard = pending_joins.write().await;
                            if !guard.iter().any(|p| {
                                p.endpoint_id == info.endpoint_id && p.topic_id == info.topic_id
                            }) {
                                guard.push(info.clone());
                                if let Some(state) = app.try_state::<DbState>() {
                                    let _ = state
                                        .0
                                        .lock()
                                        .map(|db| pending_db::upsert_pending_join(&db, &info));
                                }
                            }
                            let _ = app.emit("team-pending-join", &info);
                        }
                    }
                } else if let Ok(sync) = serde_json::from_slice::<MemberSyncNeedPayload>(slice) {
                    if sync.r#type == "member_sync_need"
                        && gossip_topic_matches(&sync.topic_id, &topic_id)
                    {
                        let my_id = if let Some(iroh) = app.try_state::<IrohState>() {
                            get_my_endpoint_id(&iroh).await
                        } else {
                            String::new()
                        };
                        let need_ep = normalize_endpoint_id(&sync.endpoint_id);
                        let my_norm = normalize_endpoint_id(&my_id);
                        if need_ep.is_empty() || need_ep == my_norm {
                            // 送信者自身の echo は無視
                        } else if let Some(state) = app.try_state::<DbState>() {
                            let (should_resend, roster_opt) = state.0.lock().map_or((false, None), |db| {
                                if !can_approve_or_reject(&db, &topic_id, &my_id) {
                                    return (false, None);
                                }
                                let roster = collect_active_member_roster(&db).ok();
                                let guest_active_on_host = db
                                    .query_row(
                                        "SELECT 1 FROM members WHERE lower(endpoint_id) = lower(?1) AND status = 'active'",
                                        [&need_ep],
                                        |_| Ok(()),
                                    )
                                    .is_ok();
                                (guest_active_on_host, roster)
                            });
                            if let Some(roster) = roster_opt {
                                if !roster.is_empty() {
                                    if let Some(iroh) = app.try_state::<IrohState>() {
                                        let _ = broadcast_member_roster(
                                            &iroh, &topic_id, &roster,
                                        )
                                        .await;
                                    }
                                }
                            }
                            if should_resend {
                                if let Some(iroh) = app.try_state::<IrohState>() {
                                    let _ =
                                        broadcast_member_join(&iroh, &need_ep, &topic_id).await;
                                }
                            }
                        }
                    }
                } else if let Ok(mop) = serde_json::from_slice::<MemberOpPayload>(slice) {
                    let ver = mop.version.as_deref().unwrap_or("1.0");
                    if ver != "1.0" {
                        let _ = app.emit("team-update-required", ());
                    } else if mop.r#type == "member_cancel" && mop.target_id != "" {
                        let mut guard = pending_joins.write().await;
                        guard.retain(|p| p.endpoint_id != mop.target_id);
                        if let Some(state) = app.try_state::<DbState>() {
                            let _ = state.0.lock().map(|db| {
                                pending_db::delete_pending_for_endpoint(&db, &mop.target_id)
                            });
                        }
                        let _ = app.emit("team-pending-join-cancelled", ());
                    } else if (mop.r#type == "member_kick" || mop.r#type == "member_block")
                        && mop.target_id != ""
                    {
                        if let Some(state) = app.try_state::<DbState>() {
                            let status = if mop.r#type == "member_block" {
                                "blocked"
                            } else {
                                "kicked"
                            };
                            let _ = state.0.lock().map(|db| {
                                db.execute(
                                    "UPDATE members SET status = ?1 WHERE endpoint_id = ?2",
                                    rusqlite::params![status, mop.target_id],
                                )
                            });
                            let _ = app.emit("team-members-updated", ());
                        }
                        // 自分がキック/ブロックされたら、このトピックの team_subscriptions を外す（「申請中」幽霊状態の防止）
                        if let Some(iroh) = app.try_state::<IrohState>() {
                            let my_id = get_my_endpoint_id(&iroh).await;
                            if mop.target_id == my_id {
                                if let Some(state) = app.try_state::<DbState>() {
                                    let _ = state.0.lock().map(|db| {
                                        let _ = db.execute(
                                            "DELETE FROM team_subscriptions WHERE topic_id = ?1",
                                            rusqlite::params![topic_id],
                                        );
                                        let _ = clear_members_if_no_team(&db);
                                    });
                                }
                                let guard = iroh.read().await;
                                if let Some(node) = guard.as_ref() {
                                    node.unsubscribe(&topic_id).await;
                                }
                                let _ = app.emit("team-cancelled", ());
                            }
                        }
                        // ブロックされた本人に通知
                        if mop.r#type == "member_block" {
                            if let Some(iroh) = app.try_state::<IrohState>() {
                                let my_id = get_my_endpoint_id(&iroh).await;
                                if mop.target_id == my_id {
                                    let _ = app.emit("team-blocked", ());
                                }
                            }
                        }
                    }
                } else if let Ok(notify) =
                    serde_json::from_slice::<MemberBlockedNotifyPayload>(slice)
                {
                    if notify.r#type == "member_blocked_notify" {
                        if let Some(iroh) = app.try_state::<IrohState>() {
                            let my_id = get_my_endpoint_id(&iroh).await;
                            if notify.target_id == my_id {
                                let _ = app.emit("team-blocked", ());
                            }
                        }
                    }
                } else if let Ok(dn) = serde_json::from_slice::<MemberDisplayNamePayload>(slice) {
                    if dn.r#type == "member_display_name" && dn.endpoint_id != "" {
                        let ver = dn.version.as_deref().unwrap_or("1.0");
                        if ver == "1.0" {
                            if let Some(state) = app.try_state::<DbState>() {
                                let _ = state.0.lock().map(|db| {
                                    db.execute(
                                        "UPDATE members SET display_name = ?1 WHERE endpoint_id = ?2",
                                        rusqlite::params![dn.display_name, dn.endpoint_id],
                                    )
                                });
                                let _ = app.emit("team-members-updated", ());
                            }
                        }
                    }
                } else if let Ok(tn) = serde_json::from_slice::<TeamNamePayload>(slice) {
                    if tn.r#type == "team_name_update" {
                        let ver = tn.version.as_deref().unwrap_or("1.0");
                        if ver == "1.0" {
                            let name = tn.name.trim();
                            if !name.is_empty() && name.len() <= 50 {
                                if let Some(state) = app.try_state::<DbState>() {
                                    let _ = state.0.lock().map(|db| {
                                        db.execute(
                                            "INSERT INTO settings (key, value) VALUES ('team_name', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
                                            [name],
                                        )
                                    });
                                    let _ = app.emit("team-members-updated", ());
                                }
                            }
                        }
                    }
                } else if let Ok(pc) = serde_json::from_slice::<PermissionChangePayload>(slice) {
                    if pc.r#type == "permission_change"
                        && pc.old_host_endpoint_id != ""
                        && pc.new_host_endpoint_id != ""
                    {
                        let ver = pc.version.as_deref().unwrap_or("1.0");
                        if ver == "1.0" {
                            let my_id = if let Some(iroh) = app.try_state::<IrohState>() {
                                get_my_endpoint_id(&iroh).await
                            } else {
                                String::new()
                            };
                            if let Some(state) = app.try_state::<DbState>() {
                                let _ = state.0.lock().map(|db| {
                                    let _ = db.execute("DELETE FROM members WHERE endpoint_id = ?1", rusqlite::params![pc.old_host_endpoint_id]);
                                    let _ = db.execute("UPDATE members SET role = 'host' WHERE endpoint_id = ?1", rusqlite::params![pc.new_host_endpoint_id]);
                                    if my_id == pc.new_host_endpoint_id {
                                        let _ = db.execute("UPDATE team_subscriptions SET is_host = 1 WHERE topic_id = ?1", rusqlite::params![topic_id]);
                                    }
                                });
                                let _ = app.emit("team-members-updated", ());
                            }
                        }
                    }
                } else if let Ok(td) = serde_json::from_slice::<TeamDisbandPayload>(slice) {
                    if td.r#type == "team_disband" {
                        let ver = td.version.as_deref().unwrap_or("1.0");
                        if ver == "1.0" {
                            handle_team_disband(&app, &topic_id, &pending_joins).await;
                        }
                    }
                }
            }
            Ok(Event::NeighborDown(node_id)) => {
                let departed_id = node_id.to_string();
                let action: Option<(bool, String, String)> = if let Some(state) =
                    app.try_state::<DbState>()
                {
                    state.0.lock().map_or(None, |db| {
                        let is_host = db.query_row(
                            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND role = 'host'",
                            [&departed_id],
                            |_| Ok(()),
                        ).is_ok();
                        if is_host {
                            let oldest_co: Option<String> = db.query_row(
                                "SELECT endpoint_id FROM members WHERE role = 'co_host' AND status = 'active' ORDER BY joined_at ASC LIMIT 1",
                                [],
                                |r| r.get(0),
                            ).ok();
                            if let Some(co) = oldest_co {
                                Some((true, departed_id.clone(), co))
                            } else {
                                let oldest_m: Option<String> = db.query_row(
                                    "SELECT endpoint_id FROM members WHERE role = 'member' AND status = 'active' ORDER BY joined_at ASC LIMIT 1",
                                    [],
                                    |r| r.get(0),
                                ).ok();
                                oldest_m.map(|m| (false, departed_id.clone(), m))
                            }
                        } else {
                            None
                        }
                    })
                } else {
                    None
                };
                if let Some((is_pc, old_host, new_host)) = action {
                    if let Some(iroh) = app.try_state::<IrohState>() {
                        let my_id = get_my_endpoint_id(&iroh).await;
                        if my_id == new_host {
                            if is_pc {
                                let _ =
                                    broadcast_permission_change(&iroh, &old_host, &new_host).await;
                            } else {
                                let _ = broadcast_team_disband(&iroh).await;
                            }
                        }
                    }
                }
            }
            Ok(Event::Lagged) => {
                eprintln!(
                    "team gossip: 受信バッファが詰まり一部メッセージを取りこぼした可能性があります (topic {})",
                    topic_id
                );
                // Lagged リカバリ: フロントへ通知して再同期を促す
                let _ = app.emit("team-sync-check-needed", ());
            }
            _ => {}
        }
    }
}
