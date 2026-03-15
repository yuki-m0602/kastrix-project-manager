use crate::db::DbState;
use crate::models::{CreateTaskInput, Task, UpdateTaskInput};
use crate::team::{broadcast_task_update, IrohState, TaskUpdatePayload};
use tauri::State;
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
        rusqlite::params![log_id, task_id, project_id, action, task_title, project_name],
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

#[tauri::command]
pub fn get_tasks(
    project_id: Option<String>,
    state: State<DbState>,
) -> Result<Vec<Task>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;

    let (sql, params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = match &project_id {
        Some(pid) => (
            "SELECT id, project_id, title, status, priority, due_date, assignee, description, is_public, created_at, updated_at
             FROM tasks WHERE project_id = ?1 ORDER BY created_at DESC",
            vec![Box::new(pid.clone())],
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
pub async fn create_task(
    input: CreateTaskInput,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<Task, String> {
    let task = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let id = Uuid::new_v4().to_string();
        let priority = input.priority.as_deref().unwrap_or("medium");
        let is_public = if input.is_public { 1 } else { 0 };

        db.execute(
            "INSERT INTO tasks (id, project_id, title, priority, due_date, assignee, description, is_public)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
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
            action: "create".to_string(),
            task: Some(task.clone()),
            task_id: None,
        };
        let _ = broadcast_task_update(&iroh, &payload).await;
    }
    Ok(task)
}

#[tauri::command]
pub async fn update_task(
    id: String,
    input: UpdateTaskInput,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
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
             due_date = ?4, assignee = ?5, description = ?6, is_public = ?7, updated_at = datetime('now')
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
            action: "update".to_string(),
            task: Some(task.clone()),
            task_id: None,
        };
        let _ = broadcast_task_update(&iroh, &payload).await;
    }
    Ok(task)
}

#[tauri::command]
pub async fn delete_task(
    id: String,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
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
            action: "delete".to_string(),
            task: None,
            task_id: Some(id),
        };
        let _ = broadcast_task_update(&iroh, &payload).await;
    }
    Ok(())
}

#[tauri::command]
pub async fn update_task_status(
    id: String,
    status: String,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<Task, String> {
    let valid_statuses = ["todo", "in-progress", "done"];
    if !valid_statuses.contains(&status.as_str()) {
        return Err(format!("Invalid status: {}", status));
    }

    let task = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let current = query_task(&db, &id)?;

        db.execute(
            "UPDATE tasks SET status = ?1, updated_at = datetime('now') WHERE id = ?2",
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
            action: "update".to_string(),
            task: Some(task.clone()),
            task_id: None,
        };
        let _ = broadcast_task_update(&iroh, &payload).await;
    }
    Ok(task)
}
