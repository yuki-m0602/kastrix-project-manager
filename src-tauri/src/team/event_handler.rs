//! トピックイベントのリッスン・処理

use futures::StreamExt;
use iroh_gossip::api::Event;
use iroh_gossip::api::Message;
use tauri::{AppHandle, Emitter, Manager};

use crate::db::DbState;
use crate::team::task_sync::{apply_task_update, TaskUpdatePayload};

use super::broadcast::{
    broadcast_blocked_notify, broadcast_json_payload, broadcast_permission_change,
    broadcast_team_disband,
};
use super::helpers::get_my_endpoint_id;
use super::payloads::{
    JoinRequestPayload, MemberBlockedNotifyPayload, MemberDisplayNamePayload, MemberOpPayload,
    PermissionChangePayload, TeamDisbandPayload,
};
use super::pending::{PendingJoinInfo, PendingJoinsState};
use super::IrohState;

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
            let _ = db.execute("DELETE FROM team_subscriptions WHERE topic_id = ?1", rusqlite::params![topic_id]);
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
    while let Some(event) = receiver.next().await {
        match event {
            Ok(Event::NeighborUp(node_id)) if is_host => {
                let endpoint_id = node_id.to_string();
                let is_blocked = if let Some(state) = app.try_state::<DbState>() {
                    state.0.lock().map_or(false, |db| {
                        db.query_row(
                            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'blocked'",
                            [&endpoint_id],
                            |_| Ok(()),
                        )
                        .is_ok()
                    })
                } else {
                    false
                };
                if is_blocked {
                    if let Some(iroh) = app.try_state::<IrohState>() {
                        let _ = broadcast_blocked_notify(&iroh, &endpoint_id).await;
                    }
                } else {
                    let requested_at =
                        chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let info = PendingJoinInfo {
                        endpoint_id: endpoint_id.clone(),
                        topic_id: topic_id.clone(),
                        requested_at: requested_at.clone(),
                    };
                    {
                        let mut guard = pending_joins.write().await;
                        if !guard
                            .iter()
                            .any(|p| p.endpoint_id == endpoint_id && p.topic_id == topic_id)
                        {
                            guard.push(info.clone());
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
                        let _ = broadcast_json_payload(&iroh, &payload).await;
                    }
                }
            }
            Ok(Event::Received(Message { content, .. })) => {
                let slice = content.as_ref();
                if let Ok(payload) = serde_json::from_slice::<TaskUpdatePayload>(slice) {
                    let version = payload.version.as_deref().unwrap_or("1.0");
                    if version != "1.0" {
                        let _ = app.emit("team-update-required", ());
                    } else if let Some(state) = app.try_state::<DbState>() {
                        let _ = apply_task_update(&state, &payload, Some(&app));
                    }
                } else if let Ok(join_req) = serde_json::from_slice::<JoinRequestPayload>(slice) {
                    if join_req.r#type == "join_request" && join_req.topic_id == topic_id {
                        let info = PendingJoinInfo {
                            endpoint_id: join_req.endpoint_id,
                            topic_id: join_req.topic_id,
                            requested_at: join_req.requested_at,
                        };
                        let mut guard = pending_joins.write().await;
                        if !guard.iter().any(|p| {
                            p.endpoint_id == info.endpoint_id && p.topic_id == info.topic_id
                        }) {
                            guard.push(info.clone());
                        }
                        let _ = app.emit("team-pending-join", &info);
                    }
                } else if let Ok(mop) = serde_json::from_slice::<MemberOpPayload>(slice) {
                    let ver = mop.version.as_deref().unwrap_or("1.0");
                    if ver != "1.0" {
                        let _ = app.emit("team-update-required", ());
                    } else if mop.r#type == "member_cancel" && mop.target_id != "" {
                        let mut guard = pending_joins.write().await;
                        guard.retain(|p| p.endpoint_id != mop.target_id);
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
                } else if let Ok(pc) = serde_json::from_slice::<PermissionChangePayload>(slice) {
                    if pc.r#type == "permission_change" && pc.old_host_endpoint_id != "" && pc.new_host_endpoint_id != "" {
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
                let action: Option<(bool, String, String)> = if let Some(state) = app.try_state::<DbState>() {
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
                                let _ = broadcast_permission_change(&iroh, &old_host, &new_host).await;
                            } else {
                                let _ = broadcast_team_disband(&iroh).await;
                            }
                        }
                    }
                }
            }
            _ => {}
        }
    }
}
