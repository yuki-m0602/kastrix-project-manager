use crate::db::DbState;
use crate::models::ActivityLog;
use tauri::State;

#[tauri::command]
pub fn get_activity_logs(
    project_id: Option<String>,
    state: State<DbState>,
) -> Result<Vec<ActivityLog>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;

    let (sql, params): (&str, Vec<Box<dyn rusqlite::types::ToSql>>) = match &project_id {
        Some(pid) => (
            "SELECT id, task_id, project_id, action, task_title, project_name, modified_by, timestamp
             FROM activity_logs WHERE project_id = ?1 ORDER BY timestamp DESC",
            vec![Box::new(pid.clone())],
        ),
        None => (
            "SELECT id, task_id, project_id, action, task_title, project_name, modified_by, timestamp
             FROM activity_logs ORDER BY timestamp DESC",
            vec![],
        ),
    };

    let mut stmt = db.prepare(sql).map_err(|e| e.to_string())?;
    let params_refs: Vec<&dyn rusqlite::types::ToSql> = params.iter().map(|p| p.as_ref()).collect();

    let logs = stmt
        .query_map(params_refs.as_slice(), |row| {
            Ok(ActivityLog {
                id: row.get(0)?,
                task_id: row.get(1)?,
                project_id: row.get(2)?,
                action: row.get(3)?,
                task_title: row.get(4)?,
                project_name: row.get(5)?,
                modified_by: row.get(6)?,
                timestamp: row.get::<_, Option<String>>(7)?.unwrap_or_default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(logs)
}

#[tauri::command]
pub fn export_logs_csv(
    project_id: Option<String>,
    state: State<DbState>,
) -> Result<String, String> {
    let logs = get_activity_logs(project_id, state)?;

    let mut csv = String::from("id,task_id,project_id,action,task_title,project_name,modified_by,timestamp\n");
    for log in &logs {
        csv.push_str(&format!(
            "{},{},{},{},{},{},{},{}\n",
            escape_csv(&log.id),
            escape_csv_opt(&log.task_id),
            escape_csv_opt(&log.project_id),
            escape_csv(&log.action),
            escape_csv_opt(&log.task_title),
            escape_csv_opt(&log.project_name),
            escape_csv_opt(&log.modified_by),
            escape_csv(&log.timestamp),
        ));
    }

    Ok(csv)
}

fn escape_csv(s: &str) -> String {
    if s.contains(',') || s.contains('"') || s.contains('\n') {
        format!("\"{}\"", s.replace('"', "\"\""))
    } else {
        s.to_string()
    }
}

fn escape_csv_opt(s: &Option<String>) -> String {
    match s {
        Some(v) => escape_csv(v),
        None => String::new(),
    }
}
