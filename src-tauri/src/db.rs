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
            project_id  TEXT REFERENCES projects(id) ON DELETE SET NULL,
            title       TEXT NOT NULL,
            status      TEXT CHECK(status IN ('todo','in-progress','done')) DEFAULT 'todo',
            priority    TEXT CHECK(priority IN ('high','medium','low')) DEFAULT 'medium',
            due_date    TEXT,
            assignee    TEXT,
            description TEXT,
            is_public   INTEGER DEFAULT 1,
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
        );

        CREATE TABLE IF NOT EXISTS operations (
            id          TEXT PRIMARY KEY,
            seq         INTEGER NOT NULL,
            prev_id     TEXT,
            type        TEXT NOT NULL,
            payload     TEXT NOT NULL,
            member_id   TEXT,
            signature   TEXT,
            timestamp   TEXT NOT NULL,
            ts_source   TEXT DEFAULT 'local',
            synced      INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS members (
            id          TEXT PRIMARY KEY,
            endpoint_id TEXT NOT NULL UNIQUE,
            role        TEXT CHECK(role IN ('host','co_host','member')) DEFAULT 'member',
            status      TEXT CHECK(status IN ('active','pending','kicked','blocked')) DEFAULT 'pending',
            joined_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS sync_state (
            member_id     TEXT PRIMARY KEY,
            last_seq      INTEGER DEFAULT 0,
            last_synced_at TEXT
        );

        CREATE TABLE IF NOT EXISTS invite_codes (
            id          TEXT PRIMARY KEY,
            code        TEXT NOT NULL UNIQUE,
            topic_id    TEXT NOT NULL,
            host_ticket  TEXT,
            expires_at  TEXT,
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS team_subscriptions (
            topic_id    TEXT PRIMARY KEY,
            host_ticket  TEXT,
            is_host     INTEGER NOT NULL DEFAULT 0,
            created_at  TEXT DEFAULT (datetime('now'))
        );
        ",
    )?;

    // マイグレーション: 既存の invite_codes に host_ticket を追加
    let _ = conn.execute("ALTER TABLE invite_codes ADD COLUMN host_ticket TEXT", []);
    // マイグレーション: tasks に is_public を追加
    let _ = conn.execute("ALTER TABLE tasks ADD COLUMN is_public INTEGER DEFAULT 1", []);

    Ok(conn)
}
