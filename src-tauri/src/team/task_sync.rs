//! タスク同期（task_update Operation の broadcast / 適用）

use crate::db::DbState;
use crate::models::Task;
use crate::team::can_apply_remote_task_delete;
use bytes::Bytes;
use tauri::Emitter;
use uuid::Uuid;

/// task_update の payload（JSON）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct TaskUpdatePayload {
    #[serde(default)]
    pub version: Option<String>, // "1.0" = サポート対象、それ以外はスキップ
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
    /// delete 時: 削除操作を行ったノードの EndpointID（受信側で権限検証）
    #[serde(default, skip_serializing_if = "Option::is_none")]
    pub actor_endpoint_id: Option<String>,
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

    payload.version = Some("1.0".to_string());
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
        rusqlite::params![
            id,
            next_seq,
            prev_id,
            payload_json,
            timestamp,
            ts_source,
            synced_int
        ],
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
        "SELECT id, project_id, title, status, priority, due_date, assignee, description, is_public, created_at, updated_at, created_by
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
                created_by: row.get(11)?,
            })
        },
    )
    .map_err(|e| e.to_string())
}

/// project_id が存在しない場合、仮プロジェクトを挿入（同期タスク用）
fn ensure_project_exists(db: &rusqlite::Connection, project_id: &str) -> Result<(), String> {
    let exists: bool = db
        .query_row("SELECT 1 FROM projects WHERE id = ?1", [project_id], |_| {
            Ok(())
        })
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
#[serde(rename_all = "camelCase")]
pub struct ConflictInfo {
    pub task_id: String,
    pub incoming: Task,
    pub local: Task,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub conflict_seq: Option<i64>,
}

fn task_equal_for_conflict(a: &Task, b: &Task) -> bool {
    a.id == b.id
        && a.project_id == b.project_id
        && a.title == b.title
        && a.status == b.status
        && a.priority == b.priority
        && a.due_date == b.due_date
        && a.assignee == b.assignee
        && a.description == b.description
        && a.is_public == b.is_public
        && a.created_at == b.created_at
        && a.updated_at == b.updated_at
        && a.created_by == b.created_by
}

fn is_conflict_seq_skipped(db: &rusqlite::Connection, task_id: &str, seq: i64) -> Result<bool, String> {
    let n: i32 = db
        .query_row(
            "SELECT COUNT(*) FROM team_conflict_skip_seq WHERE task_id = ?1 AND seq = ?2",
            rusqlite::params![task_id, seq],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(n > 0)
}

/// 受信した payload をローカル DB に適用
/// local vs local の衝突時は適用せず team-conflict イベントを発火
///
/// **重要**: `Mutex` を握ったまま `app.emit` すると、WebView 側の `invoke` が同じ DB を待ってデッドロックする
/// （例: 競合解決ボタン → team_resolve_conflict 内でここが emit しつつロック保持 → loadData が詰まる）。
/// 必ずロック解放後にのみ emit する。
pub fn apply_task_update(
    state: &DbState,
    payload: &TaskUpdatePayload,
    app: Option<&tauri::AppHandle>,
) -> Result<(), String> {
    let mut emit_conflict: Option<ConflictInfo> = None;
    let mut emit_task_updated = false;
    {
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
                let is_local_vs_local = incoming_ts_local && local_source.as_deref() == Some("local");
                if is_local_vs_local {
                    if let Some(seq) = payload.seq {
                        if is_conflict_seq_skipped(&db, &task.id, seq)? {
                            return Ok(());
                        }
                    }
                    if let Ok(local) = query_local_task(&db, &task.id) {
                        if task_equal_for_conflict(&local, task) {
                            return Ok(());
                        }
                        emit_conflict = Some(ConflictInfo {
                            task_id: task.id.clone(),
                            incoming: task.clone(),
                            local,
                            conflict_seq: payload.seq,
                        });
                    }
                } else {
                    if let Some(ref pid) = task.project_id {
                        ensure_project_exists(&db, pid)?;
                    }
                    let is_public = if task.is_public { 1 } else { 0 };
                    let ts_src = payload.ts_source.as_deref().unwrap_or("local");
                    db.execute(
                        "INSERT INTO tasks (id, project_id, title, status, priority, due_date, assignee, description, is_public, created_at, updated_at, last_update_source, created_by)
                         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13)
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
                           last_update_source=excluded.last_update_source,
                           created_by=COALESCE(excluded.created_by, tasks.created_by)",
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
                            task.created_by,
                        ],
                    )
                    .map_err(|e| e.to_string())?;
                    emit_task_updated = true;
                }
            }
            "delete" => {
                let id = payload
                    .task_id
                    .as_ref()
                    .ok_or_else(|| "task_update: task_id is required for delete".to_string())?;
                if let Ok(task) = query_local_task(&db, id) {
                    if !can_apply_remote_task_delete(&db, &task, payload.actor_endpoint_id.as_deref()) {
                        return Ok(());
                    }
                }
                db.execute("DELETE FROM tasks WHERE id = ?1", [id])
                    .map_err(|e| e.to_string())?;
                emit_task_updated = true;
            }
            _ => return Err(format!("unknown task_update action: {}", payload.action)),
        }
    }
    if let Some(app) = app {
        if let Some(info) = emit_conflict {
            let _ = app.emit("team-conflict", &info);
        } else if emit_task_updated {
            let _ = app.emit("team-task-updated", ());
        }
    }
    Ok(())
}
