//! チーム機能 Tauri コマンド

use crate::db::DbState;
use crate::team::{generate_invite_code, normalize_code, validate_code_format, IrohState};
use tauri::State;
use uuid::Uuid;

/// EndpointID（NodeId）を取得。iroh 未初期化時はエラー
#[tauri::command]
pub async fn team_get_endpoint_id(iroh: State<'_, IrohState>) -> Result<String, String> {
    let guard = iroh.read().await;
    let node = guard
        .as_ref()
        .ok_or_else(|| "iroh が初期化されていません".to_string())?;
    Ok(node.node_id().to_string())
}

fn topic_id_to_hex(id: &[u8; 32]) -> String {
    id.iter().map(|b| format!("{:02x}", b)).collect()
}

/// チームを作成し、招待コードを発行
#[tauri::command]
pub async fn team_create(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
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
        node.subscribe(topic_id_iroh, &topic_id_hex, vec![])
            .await
            .map_err(|e| format!("トピック参加に失敗: {}", e))?;
        let ticket = node.node_ticket().await.map_err(|e| e.to_string())?;
        ticket.to_string()
    };

    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.execute(
        "INSERT INTO invite_codes (id, code, topic_id, host_ticket, expires_at) VALUES (?1, ?2, ?3, ?4, datetime('now', '+1 hour'))",
        rusqlite::params![id, code, topic_id_hex, host_ticket],
    )
    .map_err(|e| e.to_string())?;

    Ok(TeamCreateResult {
        code: code.clone(),
        topic_id: topic_id_hex,
        expires_in_minutes: 60,
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
    let expires_modifier = format!("+{} minutes", mins);
    db.execute(
        "INSERT INTO invite_codes (id, code, topic_id, expires_at) VALUES (?1, ?2, ?3, datetime('now', ?4))",
        rusqlite::params![id, code, topic_id_hex, expires_modifier],
    )
    .map_err(|e| e.to_string())?;

    Ok(TeamInviteResult {
        code: code.clone(),
        expires_in_minutes: mins,
    })
}

/// 招待コードでチームに参加申請
#[tauri::command]
pub async fn team_join(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    code: String,
) -> Result<TeamJoinResult, String> {
    validate_code_format(&code)?;
    let code = normalize_code(&code);

    let (topic_id, host_ticket_opt): (String, Option<String>) = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT topic_id, host_ticket FROM invite_codes WHERE code = ?1 AND (expires_at IS NULL OR expires_at > datetime('now'))",
            [&code],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .map_err(|_| "招待コードが無効または期限切れです".to_string())?
    };

    if let Some(host_ticket_str) = host_ticket_opt {
        let guard = iroh.read().await;
        if let Some(node) = guard.as_ref() {
            let ticket: iroh_base::ticket::NodeTicket = host_ticket_str
                .parse()
                .map_err(|e| format!("ホスト情報の解析に失敗: {}", e))?;
            node.add_node_addr(&ticket)
                .map_err(|e| format!("ホストへの接続設定に失敗: {}", e))?;
            let topic_id_bytes = hex_to_topic_id(&topic_id)?;
            let topic_id_iroh = iroh_gossip::proto::TopicId::from_bytes(topic_id_bytes);
            let host_node_id = ticket.node_addr().node_id;
            node.subscribe(topic_id_iroh, &topic_id, vec![host_node_id])
                .await
                .map_err(|e| format!("トピック参加に失敗: {}", e))?;
        }
    }

    Ok(TeamJoinResult {
        topic_id: topic_id.clone(),
        status: "pending".to_string(),
        message: "参加申請を送信しました。ホストの承認をお待ちください。".to_string(),
    })
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

/// 発行済み招待コード一覧を取得
#[tauri::command]
pub async fn team_list_invite_codes(
    state: State<'_, DbState>,
) -> Result<Vec<InviteCodeInfo>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, code, topic_id, expires_at, created_at FROM invite_codes ORDER BY created_at DESC",
        )
        .map_err(|e| e.to_string())?;

    let rows = stmt
        .query_map([], |row| {
            Ok(InviteCodeInfo {
                id: row.get(0)?,
                code: row.get(1)?,
                topic_id: row.get(2)?,
                expires_at: row.get(3)?,
                created_at: row.get(4)?,
            })
        })
        .map_err(|e| e.to_string())?;

    let mut result = Vec::new();
    for row in rows {
        result.push(row.map_err(|e| e.to_string())?);
    }
    Ok(result)
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
}
