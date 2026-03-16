//! チーム機能 Tauri コマンド

use base64::{engine::general_purpose::URL_SAFE_NO_PAD, Engine};
use crate::db::DbState;
use crate::team::{
    apply_task_update, broadcast_task_update, generate_invite_code, normalize_code, IrohState,
    TaskUpdatePayload,
};
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
    pub status: String, // "同期中" | "未参加"
}

#[tauri::command]
pub async fn team_get_current_room(iroh: State<'_, IrohState>) -> Result<TeamRoomInfo, String> {
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
        None => ("未参加".to_string(), "未参加".to_string()),
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

/// トピックのイベントをリッスン（NeighborUp=参加申請[ホストのみ]、Received=task_update）
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
                let requested_at = chrono::Local::now().format("%Y-%m-%d %H:%M:%S").to_string();
                let info = PendingJoinInfo {
                    endpoint_id: endpoint_id.clone(),
                    topic_id: topic_id.clone(),
                    requested_at,
                };
                {
                    let mut guard = pending_joins.write().await;
                    if !guard.iter().any(|p| p.endpoint_id == endpoint_id && p.topic_id == topic_id) {
                        guard.push(info.clone());
                    }
                }
                let _ = app.emit("team-pending-join", &info);
            }
            Ok(Event::Received(Message { content, .. })) => {
                if let Ok(payload) = serde_json::from_slice::<TaskUpdatePayload>(content.as_ref()) {
                    if let Some(state) = app.try_state::<DbState>() {
                        let _ = apply_task_update(&state, &payload, Some(&app));
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

/// 招待コードを発行（既存チームに追加）
#[tauri::command]
pub async fn team_issue_invite(
    state: State<'_, DbState>,
    expires_minutes: Option<u32>,
) -> Result<TeamInviteResult, String> {
    let (code, topic_id) = generate_invite_code();
    let topic_id_hex = topic_id_to_hex(&topic_id);
    let id = Uuid::new_v4().to_string();
    let mins = expires_minutes.unwrap_or(60);

    let db = state.0.lock().map_err(|e| e.to_string())?;
    if mins == 0 {
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, expires_at) VALUES (?1, ?2, ?3, NULL)",
            rusqlite::params![id, code, topic_id_hex],
        )
        .map_err(|e| e.to_string())?;
    } else {
        let expires_modifier = format!("+{} minutes", mins);
        db.execute(
            "INSERT INTO invite_codes (id, code, topic_id, expires_at) VALUES (?1, ?2, ?3, datetime('now', 'localtime', ?4))",
            rusqlite::params![id, code, topic_id_hex, expires_modifier],
        )
        .map_err(|e| e.to_string())?;
    }

    Ok(TeamInviteResult {
        code: code.clone(),
        expires_in_minutes: mins,
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

/// 参加申請一覧を取得（ホスト用）
#[tauri::command]
pub async fn team_list_pending_joins(
    pending_joins: State<'_, PendingJoinsState>,
) -> Result<Vec<PendingJoinInfo>, String> {
    let guard = pending_joins.read().await;
    Ok(guard.clone())
}

/// 参加申請を承認（ホスト用）
#[tauri::command]
pub async fn team_approve_join(
    state: State<'_, DbState>,
    pending_joins: State<'_, PendingJoinsState>,
    endpoint_id: String,
    topic_id: String,
) -> Result<(), String> {
    {
        let mut guard = pending_joins.write().await;
        guard.retain(|p| !(p.endpoint_id == endpoint_id && p.topic_id == topic_id));
    }
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT OR IGNORE INTO members (id, endpoint_id, role, status) VALUES (?1, ?2, 'member', 'active')",
        rusqlite::params![Uuid::new_v4().to_string(), endpoint_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 参加申請を拒否（ホスト用）
#[tauri::command]
pub async fn team_reject_join(
    pending_joins: State<'_, PendingJoinsState>,
    endpoint_id: String,
    topic_id: String,
) -> Result<(), String> {
    let mut guard = pending_joins.write().await;
    guard.retain(|p| !(p.endpoint_id == endpoint_id && p.topic_id == topic_id));
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
