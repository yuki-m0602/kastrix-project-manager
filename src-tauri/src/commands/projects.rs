use crate::db::DbState;
use crate::git_util;
use crate::lang_detect;
use crate::models::Project;
use std::fs;
use std::path::Path;
use tauri::State;
use uuid::Uuid;

#[tauri::command]
pub fn scan_directory(path: String, state: State<DbState>) -> Result<Vec<Project>, String> {
    let root = Path::new(&path);
    if !root.is_dir() {
        return Err(format!("Not a directory: {}", path));
    }

    let entries = fs::read_dir(root).map_err(|e| e.to_string())?;
    let mut projects = Vec::new();

    for entry in entries.flatten() {
        let entry_path = entry.path();
        if !entry_path.is_dir() {
            continue;
        }
        if !entry_path.join(".git").is_dir() {
            continue;
        }

        let name = entry_path
            .file_name()
            .and_then(|n| n.to_str())
            .unwrap_or("unknown")
            .to_string();

        let language = lang_detect::detect_language(&entry_path);
        let has_readme = entry_path.join("README.md").exists();

        let git_info = git_util::get_git_info(&entry_path);
        let git_modified = git_info.as_ref().and_then(|g| g.last_commit_date.clone());
        let last_commit = git_info.as_ref().and_then(|g| g.last_commit_message.clone());

        let local_modified = fs::metadata(&entry_path)
            .and_then(|m| m.modified())
            .ok()
            .and_then(|t| {
                let dt: chrono::DateTime<chrono::Utc> = t.into();
                Some(dt.format("%Y-%m-%dT%H:%M:%S").to_string())
            });

        let path_str = entry_path.to_string_lossy().to_string();

        let db = state.0.lock().map_err(|e| e.to_string())?;

        // UPSERT: 既存ならUPDATE、なければINSERT
        let existing_id: Option<String> = db
            .query_row(
                "SELECT id FROM projects WHERE path = ?1",
                [&path_str],
                |row| row.get(0),
            )
            .ok();

        let id = existing_id.unwrap_or_else(|| Uuid::new_v4().to_string());

        db.execute(
            "INSERT INTO projects (id, name, path, language, local_modified, git_modified, last_commit, has_readme)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)
             ON CONFLICT(path) DO UPDATE SET
               name = excluded.name,
               language = excluded.language,
               local_modified = excluded.local_modified,
               git_modified = excluded.git_modified,
               last_commit = excluded.last_commit,
               has_readme = excluded.has_readme",
            rusqlite::params![
                id,
                name,
                path_str,
                language,
                local_modified,
                git_modified,
                last_commit,
                has_readme as i32
            ],
        )
        .map_err(|e| e.to_string())?;

        let project = Project {
            id,
            name,
            path: path_str,
            language,
            local_modified,
            git_modified,
            last_commit,
            has_readme,
            created_at: String::new(),
        };
        projects.push(project);
    }

    Ok(projects)
}

#[tauri::command]
pub fn get_projects(state: State<DbState>) -> Result<Vec<Project>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare(
            "SELECT id, name, path, language, local_modified, git_modified, last_commit, has_readme, created_at
             FROM projects ORDER BY name",
        )
        .map_err(|e| e.to_string())?;

    let projects = stmt
        .query_map([], |row| {
            let has_readme_int: i32 = row.get(7)?;
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                language: row.get(3)?,
                local_modified: row.get(4)?,
                git_modified: row.get(5)?,
                last_commit: row.get(6)?,
                has_readme: has_readme_int != 0,
                created_at: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;

    Ok(projects)
}

#[tauri::command]
pub fn get_project(id: String, state: State<DbState>) -> Result<Project, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    db.query_row(
        "SELECT id, name, path, language, local_modified, git_modified, last_commit, has_readme, created_at
         FROM projects WHERE id = ?1",
        [&id],
        |row| {
            let has_readme_int: i32 = row.get(7)?;
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                path: row.get(2)?,
                language: row.get(3)?,
                local_modified: row.get(4)?,
                git_modified: row.get(5)?,
                last_commit: row.get(6)?,
                has_readme: has_readme_int != 0,
                created_at: row.get::<_, Option<String>>(8)?.unwrap_or_default(),
            })
        },
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn get_readme(path: String) -> Result<String, String> {
    let readme_path = Path::new(&path).join("README.md");
    fs::read_to_string(&readme_path).map_err(|e| format!("README not found: {}", e))
}

#[tauri::command]
pub fn scan_all_watched_dirs(state: State<DbState>) -> Result<Vec<Project>, String> {
    let dirs: Vec<String> = {
        let conn = state.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = conn
            .prepare("SELECT path FROM watched_directories ORDER BY path")
            .map_err(|e| e.to_string())?;
        let rows: Vec<String> = stmt.query_map([], |row| row.get(0))
            .map_err(|e| e.to_string())?
            .filter_map(|r| r.ok())
            .collect();
        rows
    };

    let mut all_projects = Vec::new();
    for dir in dirs {
        match scan_directory(dir, state.clone()) {
            Ok(projects) => all_projects.extend(projects),
            Err(_) => continue,
        }
    }
    Ok(all_projects)
}

#[tauri::command]
pub fn remove_project(id: String, state: State<DbState>) -> Result<(), String> {
    let conn = state.0.lock().map_err(|e| e.to_string())?;
    conn.execute("DELETE FROM projects WHERE id = ?1", [&id])
        .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn open_in_ide(
    app: tauri::AppHandle,
    ide: String,
    path: String,
) -> Result<(), String> {
    use tauri_plugin_shell::ShellExt;

    let cmd = match ide.as_str() {
        "vscode" => "code",
        "cursor" => "cursor",
        "opencode" => "opencode",
        _ => return Err("Unsupported IDE".into()),
    };

    app.shell()
        .command(cmd)
        .arg(&path)
        .spawn()
        .map_err(|e| e.to_string())?;

    Ok(())
}
