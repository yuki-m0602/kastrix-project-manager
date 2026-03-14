//! タスク同期（task_update Operation の broadcast / 適用）

use crate::db::DbState;
use crate::models::Task;
use bytes::Bytes;
use tauri::Emitter;

/// task_update の payload（JSON）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct TaskUpdatePayload {
    pub action: String, // "create" | "update" | "delete"
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task: Option<Task>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub task_id: Option<String>,
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

/// 受信した payload をローカル DB に適用
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
            db.execute(
                "INSERT INTO tasks (id, project_id, title, status, priority, due_date, assignee, description, created_at, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
                 ON CONFLICT(id) DO UPDATE SET
                   project_id=excluded.project_id,
                   title=excluded.title,
                   status=excluded.status,
                   priority=excluded.priority,
                   due_date=excluded.due_date,
                   assignee=excluded.assignee,
                   description=excluded.description,
                   updated_at=excluded.updated_at",
                rusqlite::params![
                    task.id,
                    task.project_id,
                    task.title,
                    task.status,
                    task.priority,
                    task.due_date,
                    task.assignee,
                    task.description,
                    task.created_at,
                    task.updated_at,
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
