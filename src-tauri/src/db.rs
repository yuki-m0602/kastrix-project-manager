use rusqlite::{Connection, Result as SqlResult};
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

pub fn init_db(app_data_dir: &std::path::Path) -> SqlResult<Connection> {
    std::fs::create_dir_all(app_data_dir).expect("Failed to create app data directory");
    let db_path = app_data_dir.join("kastrix.db");
    let conn = Connection::open(db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS projects (
            id              TEXT PRIMARY KEY,
            name            TEXT NOT NULL,
            path            TEXT NOT NULL UNIQUE,
            language        TEXT,
            local_modified  TEXT,
            git_modified    TEXT,
            last_commit     TEXT,
            has_readme      INTEGER DEFAULT 0,
            created_at      TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS tasks (
            id          TEXT PRIMARY KEY,
            project_id  TEXT REFERENCES projects(id) ON DELETE CASCADE,
            title       TEXT NOT NULL,
            status      TEXT CHECK(status IN ('todo','in-progress','done')) DEFAULT 'todo',
            priority    TEXT CHECK(priority IN ('high','medium','low')) DEFAULT 'medium',
            due_date    TEXT,
            assignee    TEXT,
            description TEXT,
            created_at  TEXT DEFAULT (datetime('now')),
            updated_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS activity_logs (
            id            TEXT PRIMARY KEY,
            task_id       TEXT REFERENCES tasks(id) ON DELETE SET NULL,
            project_id    TEXT REFERENCES projects(id) ON DELETE SET NULL,
            action        TEXT CHECK(action IN ('created','started','completed','updated')),
            task_title    TEXT,
            project_name  TEXT,
            modified_by   TEXT,
            timestamp     TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS watched_directories (
            id   TEXT PRIMARY KEY,
            path TEXT NOT NULL UNIQUE
        );

        CREATE TABLE IF NOT EXISTS settings (
            key   TEXT PRIMARY KEY,
            value TEXT NOT NULL
        );",
    )?;

    Ok(conn)
}
