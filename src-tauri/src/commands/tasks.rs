use crate::db::DbState;
use crate::models::{CreateTaskInput, Task, UpdateTaskInput};
use crate::team::{broadcast_task_update, record_operation, IrohState, TaskUpdatePayload};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

fn record_activity(
    db: &rusqlite::Connection,
    task_id: &str,
    project_id: Option<&str>,
    action: &str,
    task_title: &str,
    project_name: Option<&str>,
) {
    let log_id = Uuid::new_v4().to_string();
    let _ = db.execute(
        "INSERT INTO activity_logs (id, task_id, project_id, action, task_title, project_name)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        rusqlite::params![
            log_id,
            task_id,
            project_id,
            action,
            task_title,
            project_name
        ],
    );
}

fn get_project_name(db: &rusqlite::Connection, project_id: Option<&str>) -> Option<String> {
    project_id.and_then(|pid| {
        db.query_row("SELECT name FROM projects WHERE id = ?1", [pid], |row| {
            row.get(0)
        })
        .ok()
    })
}

/// タスク更新を記録し、sync_mode に応じてブロードキャストまたは unsynced イベントを発火
async fn maybe_broadcast_task_update(
    state: &State<'_, DbState>,
    iroh: &IrohState,
    app: &AppHandle,
    mut payload: TaskUpdatePayload,
) -> Result<(), String> {
    let (timestamp, ts_source) = crate::ntp_util::get_timestamp_with_source().await;
    let should_broadcast = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let sync_mode: String = db
            .query_row("SELECT value FROM settings WHERE key = 'sync_mode'", [], |r| r.get(0))
            .unwrap_or_else(|_| "auto".to_string());
        let is_manual = sync_mode == "manual";
        record_operation(&db, &mut payload, &timestamp, &ts_source, !is_manual)?;
        !is_manual
    };
    if should_broadcast {
        let _ = broadcast_task_update(iroh, &payload).await;
    } else {
        let _ = app.emit("team-unsynced-updated", ());
    }
    Ok(())
}

fn query_task(db: &rusqlite::Connection, id: &str) -> Result<Task, String> {
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

/// DB からタスク一覧を取得（テスト用に Connection を直接受け取る）
pub fn get_tasks_from_db(
    db: &rusqlite::Connection,
    project_id: Option<&str>,
) -> Result<Vec<Task>, String> {
    let (sql, params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = match project_id {
        Some(pid) => (
            "SELECT id, project_id, title, status, priority, due_date, assignee, description, is_public, created_at, updated_at
             FROM tasks WHERE project_id = ?1 ORDER BY created_at DESC",
            vec![Box::new(pid.to_string())],
        ),
        None => (
            "SELECT id, project_id, title, status, priority, due_date, assignee, description, is_public, created_at, updated_at
             FROM tasks ORDER BY created_at DESC",
            vec![],
        ),
    };

    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let tasks = stmt
        .query_map(params_refs.as_slice(), |row| {
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
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(tasks)
}

#[tauri::command]
pub fn get_tasks(project_id: Option<String>, state: State<DbState>) -> Result<Vec<Task>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    get_tasks_from_db(&db, project_id.as_deref())
}

#[tauri::command]
pub async fn create_task(
    input: CreateTaskInput,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
) -> Result<Task, String> {
    let task = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let priority = input.priority.as_deref().unwrap_or("medium");
        let is_public = if input.is_public { 1 } else { 0 };

        db.execute(
            "INSERT INTO tasks (id, project_id, title, priority, due_date, assignee, description, is_public, last_update_source)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, 'local')",
            rusqlite::params![
                id,
                input.project_id,
                input.title,
                priority,
                input.due_date,
                input.assignee,
                input.description,
                is_public,
            ],
        )
        .map_err(|e| e.to_string())?;

        let project_name = get_project_name(&db, input.project_id.as_deref());
        record_activity(
            &db,
            &id,
            input.project_id.as_deref(),
            "created",
            &input.title,
            project_name.as_deref(),
        );

        query_task(&db, &id)?
    };
    if task.is_public {
        let payload = TaskUpdatePayload {
            version: None,
            action: "create".to_string(),
            task: Some(task.clone()),
            task_id: None,
            timestamp: None,
            ts_source: None,
            seq: None,
            prev_id: None,
        };
        maybe_broadcast_task_update(&state, &iroh, &app, payload).await?;
    }
    Ok(task)
}

#[tauri::command]
pub async fn update_task(
    id: String,
    input: UpdateTaskInput,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
) -> Result<Task, String> {
    let task = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let current = query_task(&db, &id)?;

        let title = input.title.as_deref().unwrap_or(&current.title);
        let project_id = input.project_id.as_ref().or(current.project_id.as_ref());
        let priority = input.priority.as_deref().unwrap_or(&current.priority);
        let due_date = input.due_date.as_ref().or(current.due_date.as_ref());
        let assignee = input.assignee.as_ref().or(current.assignee.as_ref());
        let description = input.description.as_ref().or(current.description.as_ref());
        let is_public = input.is_public.unwrap_or(current.is_public);
        let is_public_int = if is_public { 1 } else { 0 };

        db.execute(
            "UPDATE tasks SET title = ?1, project_id = ?2, priority = ?3,
             due_date = ?4, assignee = ?5, description = ?6, is_public = ?7, updated_at = datetime('now'), last_update_source = 'local'
             WHERE id = ?8",
            rusqlite::params![title, project_id, priority, due_date, assignee, description, is_public_int, id.clone()],
        )
        .map_err(|e| e.to_string())?;

        let project_name = get_project_name(&db, project_id.map(|s| s.as_str()));
        record_activity(
            &db,
            &id,
            project_id.map(|s| s.as_str()),
            "updated",
            title,
            project_name.as_deref(),
        );

        query_task(&db, &id)?
    };
    if task.is_public {
        let payload = TaskUpdatePayload {
            version: None,
            action: "update".to_string(),
            task: Some(task.clone()),
            task_id: None,
            timestamp: None,
            ts_source: None,
            seq: None,
            prev_id: None,
        };
        maybe_broadcast_task_update(&state, &iroh, &app, payload).await?;
    }
    Ok(task)
}

#[tauri::command]
pub async fn delete_task(
    id: String,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
) -> Result<(), String> {
    let was_public = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let task = query_task(&db, &id).ok();
        db.execute("DELETE FROM tasks WHERE id = ?1", [&id])
            .map_err(|e| e.to_string())?;
        task.map(|t| t.is_public).unwrap_or(false)
    };
    if was_public {
        let payload = TaskUpdatePayload {
            version: None,
            action: "delete".to_string(),
            task: None,
            task_id: Some(id),
            timestamp: None,
            ts_source: None,
            seq: None,
            prev_id: None,
        };
        maybe_broadcast_task_update(&state, &iroh, &app, payload).await?;
    }
    Ok(())
}

#[tauri::command]
pub async fn update_task_status(
    id: String,
    status: String,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
) -> Result<Task, String> {
    let valid_statuses = ["todo", "in-progress", "done"];
    if !valid_statuses.contains(&status.as_str()) {
        return Err(format!("Invalid status: {}", status));
    }

    let task = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let current = query_task(&db, &id)?;

        db.execute(
            "UPDATE tasks SET status = ?1, updated_at = datetime('now'), last_update_source = 'local' WHERE id = ?2",
            rusqlite::params![status, id],
        )
        .map_err(|e| e.to_string())?;

        let action = match status.as_str() {
            "in-progress" => "started",
            "done" => "completed",
            _ => "updated",
        };

        let project_name = get_project_name(&db, current.project_id.as_deref());
        record_activity(
            &db,
            &id,
            current.project_id.as_deref(),
            action,
            &current.title,
            project_name.as_deref(),
        );

        query_task(&db, &id)?
    };
    if task.is_public {
        let payload = TaskUpdatePayload {
            version: None,
            action: "update".to_string(),
            task: Some(task.clone()),
            task_id: None,
            timestamp: None,
            ts_source: None,
            seq: None,
            prev_id: None,
        };
        maybe_broadcast_task_update(&state, &iroh, &app, payload).await?;
    }
    Ok(task)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db;

    #[test]
    fn test_get_tasks_empty() {
        let conn = db::create_test_db().unwrap();
        let tasks = get_tasks_from_db(&conn, None).unwrap();
        assert!(tasks.is_empty());
    }

    #[test]
    fn test_get_tasks_with_data() {
        let conn = db::create_test_db().unwrap();
        conn.execute(
            "INSERT INTO projects (id, name, path) VALUES (?1, ?2, ?3)",
            rusqlite::params!["proj-1", "Test Project", "/path"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, status, priority) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["t1", "proj-1", "Task One", "todo", "high"],
        )
        .unwrap();
        conn.execute(
            "INSERT INTO tasks (id, project_id, title, status, priority) VALUES (?1, ?2, ?3, ?4, ?5)",
            rusqlite::params!["t2", "proj-1", "Task Two", "done", "medium"],
        )
        .unwrap();

        let tasks = get_tasks_from_db(&conn, None).unwrap();
        assert_eq!(tasks.len(), 2);
        assert_eq!(tasks[0].title, "Task One");
        assert_eq!(tasks[1].title, "Task Two");

        let filtered = get_tasks_from_db(&conn, Some("proj-1")).unwrap();
        assert_eq!(filtered.len(), 2);
    }
}
