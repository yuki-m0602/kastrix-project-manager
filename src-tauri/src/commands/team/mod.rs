//! チーム機能 Tauri コマンド

pub mod invite;
pub mod leave;
pub mod members;

use crate::db::DbState;
use crate::models::Task;
use crate::team::{
    am_i_pending_guest, apply_task_update, broadcast_task_update, IrohState, TaskUpdatePayload,
};
use serde::Deserialize;
use tauri::{AppHandle, Emitter, State};

#[derive(Debug, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct TeamResolveConflictInput {
    pub choice: String,
    pub incoming: Task,
    #[serde(default)]
    pub seq: Option<i64>,
}

pub use crate::team::{PendingJoinInfo, PendingJoinsState};


#[derive(serde::Serialize)]
pub struct TeamCreateResult {
    pub code: String,
    pub topic_id: String,
    pub expires_in_minutes: u32,
    pub invite_string: String,
}

#[derive(serde::Serialize)]
pub struct TeamInviteResult {
    pub code: String,
    pub expires_in_minutes: u32,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub invite_string: Option<String>,
}

#[derive(serde::Serialize)]
pub struct TeamJoinResult {
    pub topic_id: String,
    pub status: String,
    pub message: String,
}

#[derive(serde::Serialize)]
pub struct InviteCodeInfo {
    pub id: String,
    pub code: String,
    pub topic_id: String,
    pub expires_at: Option<String>,
    pub created_at: Option<String>,
    pub invite_string: Option<String>,
}

#[tauri::command]
pub async fn team_is_ready(iroh: State<'_, IrohState>) -> Result<bool, String> {
    let guard = iroh.read().await;
    Ok(guard.as_ref().is_some())
}

#[derive(serde::Serialize)]
pub struct TeamDebugSubscription {
    pub topic_id: String,
    pub is_host: bool,
}

#[derive(serde::Serialize)]
pub struct TeamDebugStatus {
    pub step1_iroh_node: String,
    pub step2_node_ticket: String,
    pub step2_error: Option<String>,
    pub endpoint_id: Option<String>,
    pub team_subscriptions: Vec<TeamDebugSubscription>,
    pub am_i_pending: bool,
}

#[tauri::command]
pub async fn team_debug_status(
    iroh: State<'_, IrohState>,
    db: State<'_, DbState>,
) -> Result<TeamDebugStatus, String> {
    let guard = iroh.read().await;
    let node = guard.as_ref();

    let (step1, endpoint_id) = match node {
        Some(n) => ("OK".to_string(), Some(n.node_id().to_string())),
        None => ("待機中".to_string(), None),
    };

    let (step2, step2_error) = if let Some(n) = node {
        match tokio::time::timeout(std::time::Duration::from_secs(5), n.node_ticket()).await {
            Ok(Ok(_)) => ("OK".to_string(), None),
            Ok(Err(e)) => ("失敗".to_string(), Some(e)),
            Err(_) => ("失敗".to_string(), Some("タイムアウト(5秒)".to_string())),
        }
    } else {
        ("待機中".to_string(), None)
    };

    let (team_subscriptions, am_i_pending) = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let subs: Vec<TeamDebugSubscription> = conn
            .prepare("SELECT topic_id, is_host FROM team_subscriptions")
            .map_err(|e| e.to_string())?
            .query_map([], |row| {
                Ok(TeamDebugSubscription {
                    topic_id: row.get(0)?,
                    is_host: row.get::<_, i32>(1)? != 0,
                })
            })
            .map_err(|e| e.to_string())?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?;

        let my_id = endpoint_id.as_deref().unwrap_or("");
        let am_i_pending = am_i_pending_guest(&conn, my_id);

        (subs, am_i_pending)
    };

    Ok(TeamDebugStatus {
        step1_iroh_node: step1,
        step2_node_ticket: step2,
        step2_error,
        endpoint_id,
        team_subscriptions,
        am_i_pending,
    })
}

#[tauri::command]
pub async fn team_get_endpoint_id(iroh: State<'_, IrohState>) -> Result<String, String> {
    let guard = iroh.read().await;
    let node = guard
        .as_ref()
        .ok_or_else(|| "iroh が初期化されていません".to_string())?;
    Ok(node.node_id().to_string())
}

#[derive(serde::Serialize)]
pub struct TeamRoomInfo {
    pub room_name: String,
    pub status: String,
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

#[tauri::command]
pub fn team_get_sync_mode(db: State<'_, DbState>) -> Result<String, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mode: String = conn
        .query_row(
            "SELECT value FROM settings WHERE key = 'sync_mode'",
            [],
            |r| r.get(0),
        )
        .unwrap_or_else(|_| "auto".to_string());
    Ok(mode)
}

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

#[tauri::command]
pub fn team_get_unsynced_count(db: State<'_, DbState>) -> Result<i64, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM operations WHERE synced = 0 AND type = 'task_update'",
            [],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(count)
}

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
            .query_map([], |row| {
                Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?))
            })
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

#[tauri::command]
pub async fn team_resolve_conflict(
    state: State<'_, DbState>,
    app: AppHandle,
    input: TeamResolveConflictInput,
) -> Result<(), String> {
    let TeamResolveConflictInput {
        choice,
        incoming,
        seq,
    } = input;
    if choice != "incoming" && choice != "local" {
        return Err("choice must be 'incoming' or 'local'".to_string());
    }
    if choice == "local" {
        if let Some(s) = seq {
            let conn = state.0.lock().map_err(|e| e.to_string())?;
            conn.execute(
                "INSERT OR IGNORE INTO team_conflict_skip_seq (task_id, seq) VALUES (?1, ?2)",
                rusqlite::params![incoming.id, s],
            )
            .map_err(|e| e.to_string())?;
        }
        return Ok(());
    }
    let payload = TaskUpdatePayload {
        version: Some("1.0".to_string()),
        action: "update".to_string(),
        task: Some(incoming),
        task_id: None,
        timestamp: None,
        ts_source: Some("resolved".to_string()),
        seq: None,
        prev_id: None,
        actor_endpoint_id: None,
    };
    let _ = apply_task_update(&state, &payload, Some(&app));
    Ok(())
}
