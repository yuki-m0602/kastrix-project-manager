use crate::ai;
use crate::db::DbState;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn save_api_key(provider: String, key: String) -> Result<(), String> {
    ai::save_api_key(&provider, &key)
}

#[tauri::command]
pub fn get_api_key_status(provider: String) -> Result<bool, String> {
    // Returns whether an API key exists — never returns the key itself
    Ok(ai::get_api_key(&provider)?.is_some())
}

#[tauri::command]
pub fn delete_api_key(provider: String) -> Result<(), String> {
    ai::delete_api_key(&provider)
}

#[tauri::command]
pub async fn list_ai_models(provider: String) -> Result<Vec<String>, String> {
    let api_key = ai::get_api_key(&provider)?
        .ok_or_else(|| format!("No API key configured for {provider}"))?;
    ai::list_models(&provider, &api_key).await
}

#[tauri::command]
pub async fn list_ai_models_extended(provider: String) -> Result<Vec<ai::AiModelInfo>, String> {
    let api_key = ai::get_api_key(&provider)?
        .ok_or_else(|| format!("No API key configured for {provider}"))?;
    ai::list_models_extended(&provider, &api_key).await
}

#[tauri::command]
pub async fn analyze_logs(
    prompt: String,
    provider: String,
    db: State<'_, DbState>,
) -> Result<String, String> {
    let api_key = ai::get_api_key(&provider)?
        .ok_or_else(|| format!("No API key configured for {provider}"))?;

    let model: Option<String> = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let key = format!("ai_model_{}", provider);
        conn.query_row("SELECT value FROM settings WHERE key = ?1", [&key], |row| {
            row.get::<_, String>(0)
        })
        .ok()
    };

    // Collect recent logs as context
    let context = {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare(
                "SELECT action, task_title, project_name, modified_by, timestamp
                 FROM activity_logs ORDER BY timestamp DESC LIMIT 50",
            )
            .map_err(|e| e.to_string())?;
        let rows: Vec<String> = stmt
            .query_map([], |row| {
                let action: String = row.get(0)?;
                let task: String = row.get::<_, Option<String>>(1)?.unwrap_or_default();
                let project: String = row.get::<_, Option<String>>(2)?.unwrap_or_default();
                let by: String = row.get::<_, Option<String>>(3)?.unwrap_or_default();
                let ts: String = row.get::<_, Option<String>>(4)?.unwrap_or_default();
                Ok(format!("[{ts}] {action}: {task} ({project}) by {by}"))
            })
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows.join("\n")
    };

    ai::chat(&provider, &api_key, model.as_deref(), &prompt, &context).await
}

// ── AI Chat Logs (永続化・複数チャット) ────────────────────

#[tauri::command]
pub fn ai_create_chat(db: State<'_, DbState>) -> Result<serde_json::Value, String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO ai_chats (id, title) VALUES (?1, ?2)",
        [&id, "New Chat"],
    )
    .map_err(|e| e.to_string())?;
    let created_at: String = conn
        .query_row(
            "SELECT created_at FROM ai_chats WHERE id = ?1",
            [&id],
            |r| r.get(0),
        )
        .map_err(|e| e.to_string())?;
    Ok(serde_json::json!({ "id": id, "title": "New Chat", "created_at": created_at }))
}

#[tauri::command]
pub fn ai_list_chats(db: State<'_, DbState>) -> Result<Vec<serde_json::Value>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare("SELECT id, title, created_at FROM ai_chats ORDER BY created_at DESC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, String>(0)?,
                "title": row.get::<_, String>(1)?,
                "created_at": row.get::<_, String>(2)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_get_chat_messages(
    chat_id: String,
    db: State<'_, DbState>,
) -> Result<Vec<serde_json::Value>, String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = conn
        .prepare(
            "SELECT role, content FROM ai_chat_messages WHERE chat_id = ?1 ORDER BY created_at ASC",
        )
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([&chat_id], |row| {
            Ok(serde_json::json!({
                "role": row.get::<_, String>(0)?,
                "content": row.get::<_, String>(1)?,
            }))
        })
        .map_err(|e| e.to_string())?;
    rows.collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_add_chat_message(
    chat_id: String,
    role: String,
    content: String,
    db: State<'_, DbState>,
) -> Result<(), String> {
    let id = Uuid::new_v4().to_string();
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO ai_chat_messages (id, chat_id, role, content) VALUES (?1, ?2, ?3, ?4)",
        rusqlite::params![&id, &chat_id, &role, &content],
    )
    .map_err(|e| e.to_string())?;
    if role == "user" {
        let title = if content.len() > 30 {
            format!("{}...", &content[..30])
        } else {
            content.clone()
        };
        conn.execute(
            "UPDATE ai_chats SET title = ?1 WHERE id = ?2 AND title = 'New Chat'",
            [&title, &chat_id],
        )
        .map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub fn ai_delete_chat(chat_id: String, db: State<'_, DbState>) -> Result<(), String> {
    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM ai_chats WHERE id = ?1", [&chat_id])
        .map_err(|e| e.to_string())?;
    Ok(())
}
