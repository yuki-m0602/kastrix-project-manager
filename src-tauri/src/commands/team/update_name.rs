use crate::db::DbState;
use tauri::State;

#[tauri::command]
pub fn team_update_name(
    new_name: String,
    db: State<'_, DbState>,
) -> Result<(), String> {
    if new_name.trim().is_empty() {
        return Err("チーム名は空にできません".to_string());
    }
    if new_name.len() > 50 {
        return Err("チーム名は50文字以内にしてください".to_string());
    }

    let conn = db.0.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO settings (key, value) VALUES ('team_name', ?1) ON CONFLICT(key) DO UPDATE SET value = ?1",
        [&new_name],
    )
    .map_err(|e| e.to_string())?;

    println!("Team name updated to: {}", new_name);
    Ok(())
}