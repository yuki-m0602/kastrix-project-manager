//! タスク同期（task_update Operation の broadcast / 適用）

use crate::db::DbState;
use crate::models::Task;
use bytes::Bytes;
use tauri::Emitter;
use uuid::Uuid;

/// task_update の payload（JSON）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct TaskUpdatePayload {
    pub action: String, // "create" | "update" | "delete"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<Task>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub timestamp: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub ts_source: Option<String>, // "ntp" | "local"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub seq: Option<i64>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub prev_id: Option<String>,
}

/// operations テーブルに記録し、payload に seq / prev_id を設定
/// synced: true=即配信済み, false=手動同期待ち
pub fn record_operation(
    db: &rusqlite::Connection,
    payload: &mut TaskUpdatePayload,
    timestamp: &str,
    ts_source: &str,
    synced: bool,
) -> Result<(), String> {
    let (prev_id, next_seq): (Option<String>, i64) = db
        .query_row(
            "SELECT id, seq FROM operations ORDER BY seq DESC LIMIT 1",
            [],
            |row| Ok((row.get::<_, Option<String>>(0)?, row.get::<_, i64>(1)?)),
        )
        .map(|(id, seq)| (id, seq + 1))
        .unwrap_or((None, 1));

    payload.seq = Some(next_seq);
    payload.prev_id = prev_id.clone();
    payload.timestamp = Some(timestamp.to_string());
    payload.ts_source = Some(ts_source.to_string());

    let payload_json = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let id = Uuid::new_v4().to_string();
    let synced_int = if synced { 1 } else { 0 };
    db.execute(
        "INSERT INTO operations (id, seq, prev_id, type, payload, timestamp, ts_source, synced)
         VALUES (?1, ?2, ?3, 'task_update', ?4, ?5, ?6, ?7)",
        rusqlite::params![id, next_seq, prev_id, payload_json, timestamp, ts_source, synced_int],
    )
    .map_err(|e| e.to_string())?;

    Ok(())
}

/// 全トピックに task_update を broadcast
pub async fn broadcast_task_update(
    iroh: &crate::team::IrohState,
    payload: &TaskUpdatePayload,
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
    let json = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let bytes = Bytes::from(json.into_bytes());
    for sender in senders {
        let _ = sender.broadcast(bytes.clone()).await;
    }
    Ok(())
}

/// 衝突用にローカルタスクを取得
fn query_local_task(db: &rusqlite::Connection, id: &str) -> Result<Task, String> {
    db.query_row(
        "SELECT id, project_id, title, status, priority, due_date, assignee, description, is_public, created_at, updated_at
         FROM tasks WHERE id = ?1",
        [id],
        |row| {
            Ok(Task {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                status: row.get(3)?,
                priority: row.get(4)?,
                due_date: row.get(5)?,
                assignee: row.get(6)?,
                description: row.get(7)?,
                is_public: row.get::<_, Option<i32>>(8)?.unwrap_or(1) != 0,
                created_at: row.get::<_, Option<String>>(9)?.unwrap_or_default(),
                updated_at: row.get::<_, Option<String>>(10)?.unwrap_or_default(),
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// project_id が存在しない場合、仮プロジェクトを挿入（同期タスク用）
fn ensure_project_exists(db: &rusqlite::Connection, project_id: &str) -> Result<(), String> {
    let exists: bool = db
        .query_row("SELECT 1 FROM projects WHERE id = ?1", [project_id], |_| Ok(()))
        .is_ok();
    if exists {
        return Ok(());
    }
    let path = format!("synced:{}", project_id);
    db.execute(
        "INSERT OR IGNORE INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
        rusqlite::params![project_id, "同期プロジェクト", path],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

/// 衝突情報（local vs local 時にフロントへ送る）
#[derive(serde::Serialize)]
pub struct ConflictInfo {
    pub task_id: String,
    pub incoming: Task,
    pub local: Task,
}

/// 受信した payload をローカル DB に適用
/// local vs local の衝突時は適用せず team-conflict イベントを発火
pub fn apply_task_update(
    state: &DbState,
    payload: &TaskUpdatePayload,
    app: Option<&tauri::AppHandle>,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    match payload.action.as_str() {
        "create" | "update" => {
            let task = payload
                .task
                .as_ref()
                .ok_or_else(|| "task_update: task is required for create/update".to_string())?;
            let incoming_ts_local = payload.ts_source.as_deref() == Some("local");
            let local_source: Option<String> = db
                .query_row(
                    "SELECT last_update_source FROM tasks WHERE id = ?1",
                    [&task.id],
                    |r| r.get(0),
                )
                .ok();
            let is_local_vs_local =
                incoming_ts_local && local_source.as_deref() == Some("local");
            if is_local_vs_local {
                if let Some(app) = app {
                    let local_task = query_local_task(&db, &task.id);
                    if let Ok(local) = local_task {
                        let info = ConflictInfo {
                            task_id: task.id.clone(),
                            incoming: task.clone(),
                            local,
                        };
                        let _ = app.emit("team-conflict", &info);
                    }
                }
                return Ok(());
            }
            if let Some(ref pid) = task.project_id {
                ensure_project_exists(&db, pid)?;
            }
            let is_public = if task.is_public { 1 } else { 0 };
            let ts_src = payload.ts_source.as_deref().unwrap_or("local");
            db.execute(
                "INSERT INTO tasks (id, project_id, title, status, priority, due_date, assignee, description, is_public, created_at, updated_at, last_update_source)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)
                 ON CONFLICT(id) DO UPDATE SET
                   project_id=excluded.project_id,
                   title=excluded.title,
                   status=excluded.status,
                   priority=excluded.priority,
                   due_date=excluded.due_date,
                   assignee=excluded.assignee,
                   description=excluded.description,
                   is_public=excluded.is_public,
                   updated_at=excluded.updated_at,
                   last_update_source=excluded.last_update_source",
                rusqlite::params![
                    task.id,
                    task.project_id,
                    task.title,
                    task.status,
                    task.priority,
                    task.due_date,
                    task.assignee,
                    task.description,
                    is_public,
                    task.created_at,
                    task.updated_at,
                    ts_src,
                ],
            )
            .map_err(|e| e.to_string())?;
        }
        "delete" => {
            let id = payload
                .task_id
                .as_ref()
                .ok_or_else(|| "task_update: task_id is required for delete".to_string())?;
            db.execute("DELETE FROM tasks WHERE id = ?1", [id]).map_err(|e| e.to_string())?;
        }
        _ => return Err(format!("unknown task_update action: {}", payload.action)),
    }
    if let Some(app) = app {
        let _ = app.emit("team-task-updated", ());
    }
    Ok(())
}
