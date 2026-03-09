use crate::ai;
use crate::db::DbState;
use tauri::State;

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
pub async fn analyze_logs(
    prompt: String,
    provider: String,
    db: State<'_, DbState>,
) -> Result<String, String> {
    let api_key = ai::get_api_key(&provider)?
        .ok_or_else(|| format!("No API key configured for {provider}"))?;

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

    ai::chat(&provider, &api_key, &prompt, &context).await
}
