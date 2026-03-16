//! チーム機能 Tauri コマンド

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use crate::db::DbState;
use crate::team::{
    apply_task_update, broadcast_task_update, generate_invite_code, normalize_code, IrohState,
    TaskUpdatePayload,
};
use crate::models::Task;
use bytes::Bytes;
use futures::StreamExt;
use iroh_gossip::api::Event;
use iroh_gossip::api::Message;
use std::sync::Arc;
use tauri::{AppHandle, Emitter, Manager, State};
use tokio::sync::RwLock;
use uuid::Uuid;

/// 参加申請（NeighborUp で受信）
#[derive(Clone, serde::Serialize)]
pub struct PendingJoinInfo {
    pub endpoint_id: String,
    pub topic_id: String,
    pub requested_at: String,
}

pub type PendingJoinsState = Arc<RwLock<Vec<PendingJoinInfo>>>;

/// チーム機能（iroh）が利用可能か
#[tauri::command]
pub async fn team_is_ready(iroh: State<'_, IrohState>) -> Result<bool, String> {
    let guard = iroh.read().await;
    Ok(guard.as_ref().is_some())
}

/// デバッグ用: チーム機能の各ステップの状態
#[derive(serde::Serialize)]
pub struct TeamDebugStatus {
    pub step1_iroh_node: String,   // "OK" | "待機中" | "失敗"
    pub step2_node_ticket: String, // "OK" | "待機中" | "失敗"
    pub step2_error: Option<String>,
    pub endpoint_id: Option<String>,
}

#[tauri::command]
pub async fn team_debug_status(iroh: State<'_, IrohState>) -> Result<TeamDebugStatus, String> {
    let guard = iroh.read().await;
    let node = guard.as_ref();

    let (step1, endpoint_id) = match node {
        Some(n) => ("OK".to_string(), Some(n.node_id().to_string())),
        None => ("待機中".to_string(), None),
    };

    let (step2, step2_error) = if let Some(n) = node {
        match tokio::time::timeout(
            std::time::Duration::from_secs(5),
            n.node_ticket(),
        )
        .await
        {
            Ok(Ok(_)) => ("OK".to_string(), None),
            Ok(Err(e)) => ("失敗".to_string(), Some(e)),
            Err(_) => ("失敗".to_string(), Some("タイムアウト(5秒)".to_string())),
        }
    } else {
        ("待機中".to_string(), None)
    };

    Ok(TeamDebugStatus {
        step1_iroh_node: step1,
        step2_node_ticket: step2,
        step2_error,
        endpoint_id,
    })
}

/// EndpointID（NodeId）を取得。iroh 未初期化時はエラー
#[tauri::command]
pub async fn team_get_endpoint_id(iroh: State<'_, IrohState>) -> Result<String, String> {
    let guard = iroh.read().await;
    let node = guard
        .as_ref()
        .ok_or_else(|| "iroh が初期化されていません".to_string())?;
    Ok(node.node_id().to_string())
}

/// 現在のルーム情報と同期状態を取得（サイドバー表示用）
#[derive(serde::Serialize)]
pub struct TeamRoomInfo {
    pub room_name: String,
    pub status: String, // "同期中" | "接続中" | "未参加"
}

#[tauri::command]
pub async fn team_get_current_room(
    iroh: State<'_, IrohState>,
    db: State<'_, DbState>,
) -> Result<TeamRoomInfo, String> {
    let guard = iroh.read().await;
    let topic_ids = match guard.as_ref() {
        Some(node) => node.get_subscription_topic_ids().await,
        None => Vec::new(),
    };
    let topic_id = topic_ids.first();
    let (room_name, status) = match topic_id {
        Some(tid) => {
            let short = tid.chars().take(8).collect::<String>();
            (format!("ルーム {}", short), "同期中".to_string())
        }
        None => {
            // iroh 未初期化 or 復元前: DB から参加情報を取得して表示
            let conn = db.0.lock().map_err(|e| e.to_string())?;
            let stored: Option<String> = conn
                .query_row(
                    "SELECT topic_id FROM team_subscriptions ORDER BY topic_id LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .ok();
            match stored {
                Some(tid) => {
                    let short = tid.chars().take(8).collect::<String>();
                    (format!("ルーム {}", short), "接続中".to_string())
                }
                None => ("未参加".to_string(), "未参加".to_string()),
            }
        }
    };
    Ok(TeamRoomInfo { room_name, status })
}

/// 同期モードを取得（"auto" | "manual"、デフォルト "auto"）
#[tauri::command]
pub fn team_get_sync_mode(db: State<'_, DbState>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mode: String = conn
        .query_row("SELECT value FROM settings WHERE key = 'sync_mode'", [], |r| r.get(0))
        .unwrap_or_else(|_| "auto".to_string());
    Ok(mode)
}

/// 同期モードを設定（"auto" | "manual"）
#[tauri::command]
pub fn team_set_sync_mode(mode: String, db: State<'_, DbState>) -> Result<(), String> {
    if mode != "auto" && mode != "manual" {
        return Err("sync_mode must be 'auto' or 'manual'".to_string());
    }
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('sync_mode', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
        [&mode],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 未配信の Operation 数を取得（手動同期モード時用）
#[tauri::command]
pub fn team_get_unsynced_count(db: State<'_, DbState>) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row("SELECT COUNT(*) FROM operations WHERE synced = 0 AND type = 'task_update'", [], |r| r.get(0))
        .map_err(|e| e.to_string())?;
    Ok(count)
}

/// 未配信の Operation を一括送信
#[tauri::command]
pub async fn team_push_unsynced(
    db: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
) -> Result<i64, String> {
    let rows: Vec<(String, String)> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT id, payload FROM operations WHERE synced = 0 AND type = 'task_update' ORDER BY seq")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;
        rows
    };
    let count = rows.len() as i64;
    for (id, payload_json) in rows {
        if let Ok(payload) = serde_json::from_str::<TaskUpdatePayload>(&payload_json) {
            let _ = broadcast_task_update(&iroh, &payload).await;
        }
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        conn.execute("UPDATE operations SET synced = 1 WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
    }
    let _ = app.emit("team-unsynced-updated", ());
    Ok(count)
}

fn topic_id_to_hex(id: &[u8; 32]) -> String {
    id.iter().map(|b| format!("{:02x}", b)).collect()
}

/// join_request ブロードキャスト用（CO-HOST が参加申請を見れるようにする）
#[derive(serde::Serialize, serde::Deserialize)]
struct JoinRequestPayload {
    r#type: String,
    endpoint_id: String,
    topic_id: String,
    requested_at: String,
}

/// member_kick / member_block / member_cancel のペイロード
#[derive(serde::Serialize, serde::Deserialize)]
struct MemberOpPayload {
    #[serde(default)]
    pub version: Option<String>,
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    pub target_id: String,
}

/// member_blocked_notify（ブロックされた参加者に通知）
#[derive(serde::Serialize, serde::Deserialize)]
struct MemberBlockedNotifyPayload {
    pub r#type: String,
    pub target_id: String,
}

/// member_display_name（表示名の同期）
#[derive(serde::Serialize, serde::Deserialize)]
struct MemberDisplayNamePayload {
    #[serde(default)]
    pub version: Option<String>,
    pub r#type: String,
    pub endpoint_id: String,
    pub display_name: String,
}

/// メンバー操作をブロードキャスト
async fn broadcast_member_op(
    iroh: &IrohState,
    op_type: &str,
    target_id: &str,
    priority: Option<&str>,
) -> Result<(), String> {
    let guard = iroh.read().await;
    let node = match guard.as_ref() {
        Some(n) => n,
        None => return Ok(()),
    };
    let senders = node.get_all_senders().await;
    if senders.is_empty() {
        return Ok(());
    }
    let payload = MemberOpPayload {
        version: Some("1.0".to_string()),
        r#type: op_type.to_string(),
        priority: priority.map(String::from),
        target_id: target_id.to_string(),
    };
    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let bytes = Bytes::from(json.into_bytes());
    for sender in senders {
        let _ = sender.broadcast(bytes.clone()).await;
    }
    Ok(())
}

/// member_display_name をブロードキャスト（表示名をチーム全員に同期）
async fn broadcast_member_display_name(
    iroh: &IrohState,
    endpoint_id: &str,
    display_name: &str,
) -> Result<(), String> {
    let guard = iroh.read().await;
    let node = match guard.as_ref() {
        Some(n) => n,
        None => return Ok(()),
    };
    let senders = node.get_all_senders().await;
    if senders.is_empty() {
        return Ok(());
    }
    let payload = MemberDisplayNamePayload {
        version: Some("1.0".to_string()),
        r#type: "member_display_name".to_string(),
        endpoint_id: endpoint_id.to_string(),
        display_name: display_name.to_string(),
    };
    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let bytes = Bytes::from(json.into_bytes());
    for sender in senders {
        let _ = sender.broadcast(bytes.clone()).await;
    }
    Ok(())
}

/// member_blocked_notify をブロードキャスト（ブロックされた参加者に通知）
async fn broadcast_blocked_notify(iroh: &IrohState, target_id: &str) -> Result<(), String> {
    let guard = iroh.read().await;
    let node = match guard.as_ref() {
        Some(n) => n,
        None => return Ok(()),
    };
    let senders = node.get_all_senders().await;
    if senders.is_empty() {
        return Ok(());
    }
    let payload = MemberBlockedNotifyPayload {
        r#type: "member_blocked_notify".to_string(),
        target_id: target_id.to_string(),
    };
    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let bytes = Bytes::from(json.into_bytes());
    for sender in senders {
        let _ = sender.broadcast(bytes.clone()).await;
    }
    Ok(())
}

/// トピックのイベントをリッスン（NeighborUp=参加申請[ホストのみ]、Received=task_update/join_request）
async fn spawn_topic_listener(
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
                    let requested_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                    let info = PendingJoinInfo {
                        endpoint_id: endpoint_id.clone(),
                        topic_id: topic_id.clone(),
                        requested_at: requested_at.clone(),
                    };
                    {
                        let mut guard = pending_joins.write().await;
                        if !guard.iter().any(|p| p.endpoint_id == endpoint_id && p.topic_id == topic_id) {
                            guard.push(info.clone());
                        }
                    }
                    let _ = app.emit("team-pending-join", &info);
                    // CO-HOST が参加申請を見れるよう broadcast
                    if let Some(iroh) = app.try_state::<IrohState>() {
                        let guard = iroh.read().await;
                        if let Some(node) = guard.as_ref() {
                            let senders = node.get_all_senders().await;
                            if !senders.is_empty() {
                                let payload = JoinRequestPayload {
                                    r#type: "join_request".to_string(),
                                    endpoint_id: endpoint_id.clone(),
                                    topic_id: topic_id.clone(),
                                    requested_at: requested_at.clone(),
                                };
                                if let Ok(json) = serde_json::to_string(&payload) {
                                    let bytes = Bytes::from(json.into_bytes());
                                    for sender in senders {
                                        let _ = sender.broadcast(bytes.clone()).await;
                                    }
                                }
                            }
                        }
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
                        if !guard.iter().any(|p| p.endpoint_id == info.endpoint_id && p.topic_id == info.topic_id) {
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
                    } else if (mop.r#type == "member_kick" || mop.r#type == "member_block") && mop.target_id != "" {
                        if let Some(state) = app.try_state::<DbState>() {
                            let status = if mop.r#type == "member_block" { "blocked" } else { "kicked" };
                            let _ = state.0.lock().map(|db| {
                                db.execute(
                                    "UPDATE members SET status = ?1 WHERE endpoint_id = ?2",
                                    rusqlite::params![status, mop.target_id],
                                )
                            });
                            let _ = app.emit("team-members-updated", ());
                        }
                        // ブロックされた本人に通知
                        if mop.r#type == "member_block" {
                            if let Some(iroh) = app.try_state::<IrohState>() {
                                let my_id = iroh.read().await.as_ref().map(|n| n.node_id().to_string()).unwrap_or_default();
                                if mop.target_id == my_id {
                                    let _ = app.emit("team-blocked", ());
                                }
                            }
                        }
                    }
                } else if let Ok(notify) = serde_json::from_slice::<MemberBlockedNotifyPayload>(slice) {
                    if notify.r#type == "member_blocked_notify" {
                        if let Some(iroh) = app.try_state::<IrohState>() {
                            let my_id = iroh.read().await.as_ref().map(|n| n.node_id().to_string()).unwrap_or_default();
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
                }
            }
            _ => {}
        }
    }
}

/// チームを作成し、招待コードを発行
#[tauri::command]
pub async fn team_create(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    expires_minutes: Option<u32>,
) -> Result<TeamCreateResult, String> {
    let (code, topic_id) = generate_invite_code();
    let topic_id_hex = topic_id_to_hex(&topic_id);
    let id = Uuid::new_v4().to_string();

    let host_ticket = {
        let guard = iroh.read().await;
        let node = guard
            .as_ref()
            .ok_or_else(|| "iroh が初期化されていません。チーム機能を利用できません。".to_string())?;
        let topic_id_iroh = iroh_gossip::proto::TopicId::from_bytes(topic_id);
        let receiver = node
            .subscribe(topic_id_iroh, &topic_id_hex, vec![])
            .await
            .map_err(|e| format!("トピック参加に失敗: {}", e))?;
        let ticket = node.node_ticket().await.map_err(|e| e.to_string())?;

        // ホスト: NeighborUp をリッスンして参加申請を受信
        let pending_joins = pending_joins.inner().clone();
        let topic_id_for_listener = topic_id_hex.clone();
        tauri::async_runtime::spawn(async move {
            spawn_topic_listener(receiver, pending_joins, app, topic_id_for_listener, true).await;
        });

        ticket.to_string()
    };

    let mins = expires_minutes.unwrap_or(60);
    let host_endpoint_id = {
        let guard = iroh.read().await;
        guard
            .as_ref()
            .map(|n| n.node_id().to_string())
            .unwrap_or_default()
    };

    let db = state.0.lock().map_err(|e| e.to_string())?;
    if mins == 0 {
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, host_ticket, expires_at) VALUES (?1, ?2, ?3, ?4, NULL)",
            rusqlite::params![id, code, topic_id_hex, host_ticket],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let modifier = format!("+{} minutes", mins);
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, host_ticket, expires_at) VALUES (?1, ?2, ?3, ?4, datetime('now', 'localtime', ?5))",
            rusqlite::params![id, code, topic_id_hex, host_ticket, modifier],
        )
        .map_err(|e| e.to_string())?;
    }
    db.execute(
        "INSERT OR REPLACE INTO team_subscriptions (topic_id, host_ticket, is_host) VALUES (?1, NULL, 1)",
        rusqlite::params![topic_id_hex],
    )
    .map_err(|e| e.to_string())?;

    // ホストを members に登録（CO-HOST 権限チェック用）
    if !host_endpoint_id.is_empty() {
        let _ = db.execute(
            "INSERT OR REPLACE INTO members (id, endpoint_id, role, status) VALUES (?1, ?2, 'host', 'active')",
            rusqlite::params![Uuid::new_v4().to_string(), host_endpoint_id],
        );
    }

    let expires_at_str = if mins == 0 {
        "9999-12-31 23:59:59".to_string()
    } else {
        let expires_at = chrono::Local::now() + chrono::Duration::minutes(mins as i64);
        expires_at.format("%Y-%m-%d %H:%M:%S").to_string()
    };
    let invite_payload = format!("{}::{}::{}", topic_id_hex, host_ticket, expires_at_str);
    let invite_string = format!("KASTRIX-{}", URL_SAFE_NO_PAD.encode(invite_payload.as_bytes()));

    Ok(TeamCreateResult {
        code: code.clone(),
        topic_id: topic_id_hex,
        expires_in_minutes: mins,
        invite_string: invite_string.clone(),
    })
}

/// 招待コードを発行（既存チームに追加。チームがなければ新規作成）
#[tauri::command]
pub async fn team_issue_invite(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    expires_minutes: Option<u32>,
) -> Result<TeamInviteResult, String> {
    let mins = expires_minutes.unwrap_or(60);

    let topic_id_hex: Option<String> = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT topic_id FROM team_subscriptions WHERE is_host = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )
        .ok()
    };

    // チームがなければ team_create と同様に新規作成
    if topic_id_hex.is_none() {
        let create_result = team_create(app, state, iroh, pending_joins, Some(mins)).await?;
        return Ok(TeamInviteResult {
            code: create_result.code,
            expires_in_minutes: create_result.expires_in_minutes,
            invite_string: Some(create_result.invite_string),
        });
    }

    let topic_id_hex = topic_id_hex.unwrap();
    let (code, _) = generate_invite_code();
    let id = Uuid::new_v4().to_string();

    let host_ticket_str = {
        let guard = iroh.read().await;
        let node = guard
            .as_ref()
            .ok_or_else(|| "iroh が初期化されていません。少々お待ちください。".to_string())?;
        node.node_ticket().await.map_err(|e| e.to_string())?.to_string()
    };

    let db = state.0.lock().map_err(|e| e.to_string())?;
    if mins == 0 {
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, host_ticket, expires_at) VALUES (?1, ?2, ?3, ?4, NULL)",
            rusqlite::params![id, code, topic_id_hex, host_ticket_str],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let expires_modifier = format!("+{} minutes", mins);
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, host_ticket, expires_at) VALUES (?1, ?2, ?3, ?4, datetime('now', 'localtime', ?5))",
            rusqlite::params![id, code, topic_id_hex, host_ticket_str, expires_modifier],
        )
        .map_err(|e| e.to_string())?;
    }

    let expires_at_str = if mins == 0 {
        "9999-12-31 23:59:59".to_string()
    } else {
        let expires_at = chrono::Local::now() + chrono::Duration::minutes(mins as i64);
        expires_at.format("%Y-%m-%d %H:%M:%S").to_string()
    };
    let invite_payload = format!("{}::{}::{}", topic_id_hex, host_ticket_str, expires_at_str);
    let invite_string = format!("KASTRIX-{}", URL_SAFE_NO_PAD.encode(invite_payload.as_bytes()));

    Ok(TeamInviteResult {
        code: code.clone(),
        expires_in_minutes: mins,
        invite_string: Some(invite_string),
    })
}

/// 招待コードでチームに参加申請
/// 入力: フル招待文字列（KASTRIX-<base64>）または短いコード（KASTRIX-XXXX-XXXX、ホストのDB照合用）
#[tauri::command]
pub async fn team_join(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    code: String,
) -> Result<TeamJoinResult, String> {
    let code = code.trim();
    if !code.to_uppercase().starts_with("KASTRIX-") {
        return Err("招待コードは KASTRIX- で始まる必要があります".to_string());
    }

    let (topic_id, host_ticket_str) = if let Some(payload) = code.strip_prefix("KASTRIX-").or_else(|| code.strip_prefix("kastrix-")) {
        let payload = payload.trim();
        if payload.len() > 80 {
            // フル招待形式: KASTRIX-<base64(topic_id::host_ticket::expires_at)>
            match URL_SAFE_NO_PAD.decode(payload) {
                Ok(decoded) => {
                    let s = String::from_utf8(decoded).map_err(|_| "招待データの形式が不正です".to_string())?;
                    let parts: Vec<&str> = s.splitn(3, "::").collect();
                    if parts.len() != 3 {
                        return Err("招待データの形式が不正です".to_string());
                    }
                    let topic_id = parts[0].to_string();
                    let host_ticket = parts[1].to_string();
                    let expires_at = parts[2];
                    if !is_expired(expires_at) {
                        (topic_id, Some(host_ticket))
                    } else {
                        return Err("招待コードの有効期限が切れています".to_string());
                    }
                }
                Err(_) => try_db_lookup(&state, &normalize_code(code))?,
            }
        } else {
            try_db_lookup(&state, &normalize_code(code))?
        }
    } else {
        return Err("招待コードは KASTRIX- で始まる必要があります".to_string());
    };

    let host_ticket_str = host_ticket_str
        .ok_or_else(|| "この招待コードでは参加できません。ホストから共有された招待リンクを貼り付けてください。".to_string())?;

    let guard = iroh.read().await;
    let node = guard
        .as_ref()
        .ok_or_else(|| "iroh が初期化されていません".to_string())?;
    let ticket: iroh_base::ticket::NodeTicket = host_ticket_str
        .parse()
        .map_err(|e| format!("ホスト情報の解析に失敗: {}", e))?;
    node.add_node_addr(&ticket)
        .map_err(|e| format!("ホストへの接続設定に失敗: {}", e))?;
    let topic_id_bytes = hex_to_topic_id(&topic_id)?;
    let topic_id_iroh = iroh_gossip::proto::TopicId::from_bytes(topic_id_bytes);
    let host_node_id = ticket.node_addr().node_id;
    let receiver = node
        .subscribe(topic_id_iroh, &topic_id, vec![host_node_id])
        .await
        .map_err(|e| format!("トピック参加に失敗: {}", e))?;

    // メンバー: 参加情報をDBに保存（再起動時復元用）
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT OR REPLACE INTO team_subscriptions (topic_id, host_ticket, is_host) VALUES (?1, ?2, 0)",
        rusqlite::params![topic_id, host_ticket_str],
    )
    .map_err(|e| e.to_string())?;

    // メンバー: task_update を受信してローカル DB に適用
    let pending_joins = pending_joins.inner().clone();
    let topic_id_for_listener = topic_id.clone();
    tauri::async_runtime::spawn(async move {
        spawn_topic_listener(receiver, pending_joins, app, topic_id_for_listener, false).await;
    });

    Ok(TeamJoinResult {
        topic_id: topic_id.clone(),
        status: "pending".to_string(),
        message: "参加申請を送信しました。ホストの承認をお待ちください。".to_string(),
    })
}

fn is_expired(expires_at: &str) -> bool {
    chrono::NaiveDateTime::parse_from_str(expires_at, "%Y-%m-%d %H:%M:%S")
        .ok()
        .map(|exp_naive| exp_naive < chrono::Local::now().naive_local())
        .unwrap_or(true)
}

fn try_db_lookup(
    state: &State<'_, DbState>,
    code: &str,
) -> Result<(String, Option<String>), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT topic_id, host_ticket FROM invite_codes WHERE code = ?1 AND (expires_at IS NULL OR expires_at > datetime('now', 'localtime'))",
        [code],
        |row| Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?)),
    )
    .map_err(|_| "招待コードが無効または期限切れです".to_string())
}

fn hex_to_topic_id(hex: &str) -> Result<[u8; 32], String> {
    let bytes = hex::decode(hex).map_err(|e| format!("TopicID の解析に失敗: {}", e))?;
    if bytes.len() != 32 {
        return Err("TopicID は32バイトである必要があります".to_string());
    }
    let mut arr = [0u8; 32];
    arr.copy_from_slice(&bytes);
    Ok(arr)
}

/// 起動時に DB から参加情報を復元し、subscribe を再開
pub async fn restore_team_subscriptions(app: &tauri::AppHandle) -> Result<(), String> {
    let db_state = app
        .try_state::<DbState>()
        .ok_or_else(|| "DbState not found".to_string())?;
    let iroh = app
        .try_state::<IrohState>()
        .ok_or_else(|| "IrohState not found".to_string())?;
    let pending_joins = app
        .try_state::<PendingJoinsState>()
        .ok_or_else(|| "PendingJoinsState not found".to_string())?;

    let subs: Vec<(String, Option<String>, i32)> = {
        let db = db_state.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT topic_id, host_ticket, is_host FROM team_subscriptions")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, Option<String>>(1)?, row.get::<_, i32>(2)?))
            })
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
    };

    if subs.is_empty() {
        return Ok(());
    }

    let guard = iroh.read().await;
    let node = guard
        .as_ref()
        .ok_or_else(|| "iroh が初期化されていません".to_string())?;

    for (topic_id, host_ticket, is_host) in subs {
        let topic_id_bytes = hex_to_topic_id(&topic_id)?;
        let topic_id_iroh = iroh_gossip::proto::TopicId::from_bytes(topic_id_bytes);
        let bootstrap: Vec<iroh::NodeId> = if is_host != 0 {
            vec![]
        } else {
            let ht = host_ticket
                .as_ref()
                .ok_or_else(|| format!("メンバーとして topic {} の host_ticket がありません", topic_id))?;
            let ticket: iroh_base::ticket::NodeTicket = ht
                .parse()
                .map_err(|e| format!("host_ticket 解析失敗: {}", e))?;
            node.add_node_addr(&ticket)
                .map_err(|e| format!("ホスト接続設定失敗: {}", e))?;
            vec![ticket.node_addr().node_id]
        };

        let receiver = node
            .subscribe(topic_id_iroh, &topic_id, bootstrap)
            .await
            .map_err(|e| format!("topic {} の subscribe 復元失敗: {}", topic_id, e))?;

        let pending_joins = pending_joins.inner().clone();
        let app = app.clone();
        let topic_id_for_listener = topic_id.clone();
        let is_host_bool = is_host != 0;
        tauri::async_runtime::spawn(async move {
            spawn_topic_listener(receiver, pending_joins, app, topic_id_for_listener, is_host_bool).await;
        });
    }

    let _ = app.emit("team-subscriptions-restored", ());
    Ok(())
}

/// 発行済み招待コード一覧を取得
#[tauri::command]
pub async fn team_list_invite_codes(
    state: State<'_, DbState>,
) -> Result<Vec<InviteCodeInfo>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, code, topic_id, host_ticket, expires_at, created_at FROM invite_codes ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            let id: String = row.get(0)?;
            let code: String = row.get(1)?;
            let topic_id: String = row.get(2)?;
            let host_ticket: Option<String> = row.get(3)?;
            let expires_at: Option<String> = row.get(4)?;
            let created_at: Option<String> = row.get(5)?;
            let invite_string = host_ticket.as_ref().and_then(|ht| {
                let exp = expires_at.as_deref().unwrap_or("");
                let payload = format!("{}::{}::{}", topic_id, ht, exp);
                Some(format!("KASTRIX-{}", URL_SAFE_NO_PAD.encode(payload.as_bytes())))
            });
            Ok(InviteCodeInfo {
                id,
                code,
                topic_id,
                expires_at,
                created_at,
                invite_string,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
}

/// 現在のユーザーのロール（"host" | "co_host" | "member"）
#[tauri::command]
pub async fn team_get_my_role(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<String, String> {
    let my_id = {
        let guard = iroh.read().await;
        guard.as_ref().map(|n| n.node_id().to_string()).unwrap_or_default()
    };
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let role: Option<String> = db
        .query_row(
            "SELECT role FROM members WHERE endpoint_id = ?1 AND status = 'active'",
            [&my_id],
            |r| r.get(0),
        )
        .ok();
    Ok(role.unwrap_or_else(|| "member".to_string()))
}

/// 現在のユーザーが HOST かどうか
#[tauri::command]
pub fn team_am_i_host(state: State<'_, DbState>) -> Result<bool, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let is_host: bool = db
        .query_row(
            "SELECT 1 FROM team_subscriptions WHERE is_host = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(false);
    Ok(is_host)
}

/// 自分の表示名を設定（チーム内で同期）
#[tauri::command]
pub async fn team_set_my_display_name(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
    display_name: String,
) -> Result<(), String> {
    let name = display_name.trim().to_string();
    if name.len() > 64 {
        return Err("表示名は64文字以内で入力してください".to_string());
    }
    let my_id = {
        let guard = iroh.read().await;
        guard.as_ref().map(|n| n.node_id().to_string()).unwrap_or_default()
    };
    if my_id.is_empty() {
        return Err("ノードIDを取得できません".to_string());
    }
    let n = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.execute(
            "UPDATE members SET display_name = ?1 WHERE endpoint_id = ?2 AND status = 'active'",
            rusqlite::params![&name, &my_id],
        )
        .map_err(|e| e.to_string())?
    };
    if n == 0 {
        return Err("チームに参加していないため、表示名を設定できません".to_string());
    }
    broadcast_member_display_name(&iroh, &my_id, &name).await?;
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

/// 自分の表示名を取得
#[tauri::command]
pub async fn team_get_my_display_name(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<Option<String>, String> {
    let my_id = {
        let guard = iroh.read().await;
        guard.as_ref().map(|n| n.node_id().to_string()).unwrap_or_default()
    };
    if my_id.is_empty() {
        return Ok(None);
    }
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let name: Option<String> = db
        .query_row(
            "SELECT display_name FROM members WHERE endpoint_id = ?1",
            [&my_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    Ok(name)
}

/// メンバー一覧を取得（HOST/CO-HOST 用）
#[derive(serde::Serialize)]
pub struct MemberInfo {
    pub id: String,
    pub endpoint_id: String,
    pub role: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

/// ブロック済みメンバー一覧（HOST 用、ブロック解除用）
#[tauri::command]
pub fn team_list_blocked(state: State<'_, DbState>) -> Result<Vec<MemberInfo>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, endpoint_id, role, status, display_name FROM members WHERE status = 'blocked' ORDER BY endpoint_id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MemberInfo {
                id: row.get(0)?,
                endpoint_id: row.get(1)?,
                role: row.get(2)?,
                status: row.get(3)?,
                display_name: row.get::<_, Option<String>>(4).ok().flatten(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn team_list_members(state: State<'_, DbState>) -> Result<Vec<MemberInfo>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, endpoint_id, role, status, display_name FROM members WHERE status = 'active' ORDER BY role DESC, joined_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MemberInfo {
                id: row.get(0)?,
                endpoint_id: row.get(1)?,
                role: row.get(2)?,
                status: row.get(3)?,
                display_name: row.get::<_, Option<String>>(4).ok().flatten(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// 参加申請一覧を取得（ホスト用）
#[tauri::command]
pub async fn team_list_pending_joins(
    pending_joins: State<'_, PendingJoinsState>,
) -> Result<Vec<PendingJoinInfo>, String> {
    let guard = pending_joins.read().await;
    Ok(guard.clone())
}

/// 参加申請中かどうか（申請者がキャンセル可能か）
#[tauri::command]
pub async fn team_am_i_pending(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<bool, String> {
    let has_sub = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row("SELECT 1 FROM team_subscriptions LIMIT 1", [], |_| Ok(()))
            .is_ok()
    };
    if !has_sub {
        return Ok(false);
    }
    let my_id = {
        let guard = iroh.read().await;
        guard.as_ref().map(|n| n.node_id().to_string()).unwrap_or_default()
    };
    if my_id.is_empty() {
        return Ok(false);
    }
    let is_active = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'active'",
            [&my_id],
            |_| Ok(()),
        )
        .is_ok()
    };
    Ok(!is_active)
}

/// 参加申請をキャンセル（承認前のみ）
#[tauri::command]
pub async fn team_cancel_join(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
) -> Result<(), String> {
    let topic_id: Option<String> = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row("SELECT topic_id FROM team_subscriptions WHERE is_host = 0 LIMIT 1", [], |r| r.get(0))
            .ok()
    };
    let topic_id = topic_id.ok_or_else(|| "参加申請中のチームがありません".to_string())?;
    let my_id = {
        let guard = iroh.read().await;
        guard.as_ref().map(|n| n.node_id().to_string()).unwrap_or_default()
    };
    if my_id.is_empty() {
        return Err("ノードIDを取得できません".to_string());
    }
    let is_active = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'active'",
            [&my_id],
            |_| Ok(()),
        )
        .is_ok()
    };
    if is_active {
        return Err("すでに承認済みです。キャンセルできません。".to_string());
    }
    broadcast_member_op(&iroh, "member_cancel", &my_id, None).await?;
    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM team_subscriptions WHERE topic_id = ?1 AND is_host = 0", [&topic_id])
            .map_err(|e| e.to_string())?;
    }
    {
        let guard = iroh.read().await;
        if let Some(node) = guard.as_ref() {
            node.unsubscribe(&topic_id).await;
        }
    }
    let _ = app.emit("team-cancelled", ());
    Ok(())
}

/// 参加申請を承認（HOST または CO-HOST 用）
#[tauri::command]
pub async fn team_approve_join(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    endpoint_id: String,
    topic_id: String,
) -> Result<(), String> {
    let my_endpoint_id = {
        let guard = iroh.read().await;
        guard
            .as_ref()
            .map(|n| n.node_id().to_string())
            .unwrap_or_default()
    };
    let can_approve = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let is_host: bool = db
            .query_row(
                "SELECT 1 FROM team_subscriptions WHERE topic_id = ?1 AND is_host = 1",
                [&topic_id],
                |r| r.get(0),
            )
            .unwrap_or(false);
        let is_co_host_or_host: bool = if is_host {
            true
        } else {
            db.query_row(
                "SELECT 1 FROM members WHERE endpoint_id = ?1 AND role IN ('host','co_host') AND status = 'active'",
                [&my_endpoint_id],
                |r| r.get(0),
            )
            .unwrap_or(false)
        };
        is_co_host_or_host
    };
    if !can_approve {
        return Err("承認する権限がありません（HOST または CO-HOST のみ）".to_string());
    }
    let is_blocked = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'blocked'",
            [&endpoint_id],
            |_| Ok(true),
        )
        .unwrap_or(false)
    };
    if is_blocked {
        return Err("このメンバーはブロックされています。ブロック解除後に再招待してください。".to_string());
    }
    {
        let mut guard = pending_joins.write().await;
        guard.retain(|p| !(p.endpoint_id == endpoint_id && p.topic_id == topic_id));
    }
    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.execute(
            "INSERT OR IGNORE INTO members (id, endpoint_id, role, status) VALUES (?1, ?2, 'member', 'active')",
            rusqlite::params![Uuid::new_v4().to_string(), endpoint_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

/// 参加申請を拒否（HOST または CO-HOST 用）
#[tauri::command]
pub async fn team_reject_join(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    endpoint_id: String,
    topic_id: String,
) -> Result<(), String> {
    let my_endpoint_id = {
        let guard = iroh.read().await;
        guard
            .as_ref()
            .map(|n| n.node_id().to_string())
            .unwrap_or_default()
    };
    let can_reject = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let is_host: bool = db
            .query_row(
                "SELECT 1 FROM team_subscriptions WHERE topic_id = ?1 AND is_host = 1",
                [&topic_id],
                |r| r.get(0),
            )
            .unwrap_or(false);
        let is_co_host_or_host: bool = if is_host {
            true
        } else {
            db.query_row(
                "SELECT 1 FROM members WHERE endpoint_id = ?1 AND role IN ('host','co_host') AND status = 'active'",
                [&my_endpoint_id],
                |r| r.get(0),
            )
            .unwrap_or(false)
        };
        is_co_host_or_host
    };
    if !can_reject {
        return Err("拒否する権限がありません（HOST または CO-HOST のみ）".to_string());
    }
    let mut guard = pending_joins.write().await;
    guard.retain(|p| !(p.endpoint_id == endpoint_id && p.topic_id == topic_id));
    Ok(())
}

/// メンバーをキック（CO-HOST 以上）
#[tauri::command]
pub async fn team_kick(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    app: AppHandle,
    endpoint_id: String,
) -> Result<(), String> {
    let my_endpoint_id = {
        let guard = iroh.read().await;
        guard.as_ref().map(|n| n.node_id().to_string()).unwrap_or_default()
    };
    let n = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let is_host: bool = db
            .query_row("SELECT 1 FROM team_subscriptions WHERE is_host = 1 LIMIT 1", [], |r| r.get(0))
            .unwrap_or(false);
        let is_co_host: bool = db
            .query_row(
                "SELECT 1 FROM members WHERE endpoint_id = ?1 AND role IN ('host','co_host') AND status = 'active'",
                [&my_endpoint_id],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if !is_host && !is_co_host {
            return Err("キックする権限がありません（HOST または CO-HOST のみ）".to_string());
        }
        db.execute("UPDATE members SET status = 'kicked' WHERE endpoint_id = ?1 AND status = 'active'", [&endpoint_id])
            .map_err(|e| e.to_string())?
    };
    if n == 0 {
        return Err("キック対象のメンバーが見つかりません".to_string());
    }
    {
        let mut guard = pending_joins.write().await;
        guard.retain(|p| p.endpoint_id != endpoint_id);
    }
    broadcast_member_op(&iroh, "member_kick", &endpoint_id, None).await?;
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

/// メンバーをブロック（HOST 限定）
#[tauri::command]
pub async fn team_block(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    app: AppHandle,
    endpoint_id: String,
) -> Result<(), String> {
    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let is_host: bool = db
            .query_row("SELECT 1 FROM team_subscriptions WHERE is_host = 1 LIMIT 1", [], |r| r.get(0))
            .unwrap_or(false);
        if !is_host {
            return Err("ブロックする権限がありません（HOST のみ）".to_string());
        }
        let n = db
            .execute("UPDATE members SET status = 'blocked' WHERE endpoint_id = ?1", [&endpoint_id])
            .map_err(|e| e.to_string())?;
        if n == 0 {
            db.execute(
                "INSERT INTO members (id, endpoint_id, role, status) VALUES (?1, ?2, 'member', 'blocked')",
                rusqlite::params![Uuid::new_v4().to_string(), endpoint_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    {
        let mut guard = pending_joins.write().await;
        guard.retain(|p| p.endpoint_id != endpoint_id);
    }
    broadcast_member_op(&iroh, "member_block", &endpoint_id, Some("high")).await?;
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

/// ブロック解除（HOST 限定。status を kicked に変更し、新コードで再参加可能に）
#[tauri::command]
pub async fn team_unblock(
    state: State<'_, DbState>,
    app: AppHandle,
    endpoint_id: String,
) -> Result<(), String> {
    let n = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let is_host: bool = db
            .query_row("SELECT 1 FROM team_subscriptions WHERE is_host = 1 LIMIT 1", [], |r| r.get(0))
            .unwrap_or(false);
        if !is_host {
            return Err("ブロック解除する権限がありません（HOST のみ）".to_string());
        }
        db.execute("UPDATE members SET status = 'kicked' WHERE endpoint_id = ?1 AND status = 'blocked'", [&endpoint_id])
            .map_err(|e| e.to_string())?
    };
    if n == 0 {
        return Err("ブロックされているメンバーが見つかりません".to_string());
    }
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

/// メンバーを CO-HOST に昇格（HOST のみ）
#[tauri::command]
pub async fn team_promote_to_co_host(
    state: State<'_, DbState>,
    endpoint_id: String,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let is_host: bool = db
        .query_row(
            "SELECT 1 FROM team_subscriptions WHERE is_host = 1 LIMIT 1",
            [],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if !is_host {
        return Err("CO-HOST の昇格は HOST のみ可能です".to_string());
    }
    db.execute(
        "UPDATE members SET role = 'co_host' WHERE endpoint_id = ?1 AND status = 'active'",
        [&endpoint_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 衝突解決（local vs local 時にユーザーが選択）
#[tauri::command]
pub async fn team_resolve_conflict(
    state: State<'_, DbState>,
    app: AppHandle,
    choice: String,
    incoming: Task,
) -> Result<(), String> {
    if choice != "incoming" && choice != "local" {
        return Err("choice must be 'incoming' or 'local'".to_string());
    }
    if choice == "local" {
        return Ok(());
    }
    let payload = TaskUpdatePayload {
        version: Some("1.0".to_string()),
        action: "update".to_string(),
        task: Some(incoming),
        task_id: None,
        timestamp: None,
        ts_source: None,
        seq: None,
        prev_id: None,
    };
    let _ = apply_task_update(&state, &payload, Some(&app));
    Ok(())
}

/// 招待コードを無効化
#[tauri::command]
pub async fn team_revoke_invite_code(
    state: State<'_, DbState>,
    code: String,
) -> Result<(), String> {
    let code = normalize_code(&code);

    let db = state.0.lock().map_err(|e| e.to_string())?;
    let n = db
        .execute("DELETE FROM invite_codes WHERE code = ?1", [&code])
        .map_err(|e| e.to_string())?;

    if n == 0 {
        return Err("招待コードが見つかりません".to_string());
    }
    Ok(())
}

#[derive(serde::Serialize)]
pub struct TeamCreateResult {
    code: String,
    topic_id: String,
    expires_in_minutes: u32,
    /// 参加側が貼り付けるフル招待文字列（topic_id + host_ticket をエンコード）
    invite_string: String,
}

#[derive(serde::Serialize)]
pub struct TeamInviteResult {
    code: String,
    expires_in_minutes: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    invite_string: Option<String>,
}

#[derive(serde::Serialize)]
pub struct TeamJoinResult {
    topic_id: String,
    status: String,
    message: String,
}

#[derive(serde::Serialize)]
pub struct InviteCodeInfo {
    id: String,
    code: String,
    topic_id: String,
    expires_at: Option<String>,
    created_at: Option<String>,
    /// 参加側が貼り付けるフル招待文字列（host_ticket がある場合のみ）
    invite_string: Option<String>,
}
