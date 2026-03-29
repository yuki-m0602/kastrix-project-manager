use crate::db::DbState;
use crate::team::{broadcast_json_payload, is_current_user_host, IrohState, TeamNamePayload};
use tauri::{AppHandle, Emitter, State};

#[tauri::command]
pub async fn team_update_name(
    new_name: String,
    db: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
) -> Result<(), String> {
    let trimmed = new_name.trim();
    if trimmed.is_empty() {
        return Err("チーム名は空にできません".to_string());
    }
    if trimmed.len() > 50 {
        return Err("チーム名は50文字以内にしてください".to_string());
    }

    {
        let conn = db.0.lock().map_err(|e| e.to_string())?;
        if !is_current_user_host(&conn) {
            return Err("チーム名を変更できるのはホストのみです".to_string());
        }
        conn.execute(
            "INSERT INTO settings (key, value) VALUES ('team_name', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
            [trimmed],
        )
        .map_err(|e| e.to_string())?;
    }

    let payload = TeamNamePayload {
        r#type: "team_name_update".to_string(),
        version: Some("1.0".to_string()),
        name: trimmed.to_string(),
    };
    let _ = broadcast_json_payload(&iroh, &payload).await;

    let _ = app.emit("team-members-updated", ());
    Ok(())
}
