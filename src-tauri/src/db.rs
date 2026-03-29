use rusqlite::Connection;
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

type DbInitError = Box<dyn std::error::Error + Send + Sync>;

fn map_io_err(e: std::io::Error) -> DbInitError {
    Box::new(e)
}

fn map_sql_err(e: rusqlite::Error) -> DbInitError {
    Box::new(e)
}

/// スキーマを実行（init_db とテストで共用）
fn run_schema(conn: &Connection) -> Result<(), rusqlite::Error> {
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

        CREATE TABLE IF NOT EXISTS team_conflict_skip_seq (
            task_id TEXT NOT NULL,
            seq     INTEGER NOT NULL,
            PRIMARY KEY (task_id, seq)
        );

        CREATE TABLE IF NOT EXISTS team_pending_joins (
            endpoint_id  TEXT NOT NULL,
            topic_id     TEXT NOT NULL,
            requested_at TEXT NOT NULL,
            PRIMARY KEY (endpoint_id, topic_id)
        );

        CREATE TABLE IF NOT EXISTS ai_chats (
            id          TEXT PRIMARY KEY,
            title       TEXT NOT NULL DEFAULT 'New Chat',
            created_at  TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS ai_chat_messages (
            id          TEXT PRIMARY KEY,
            chat_id     TEXT NOT NULL REFERENCES ai_chats(id) ON DELETE CASCADE,
            role        TEXT NOT NULL CHECK(role IN ('user','assistant')),
            content     TEXT NOT NULL,
            created_at  TEXT DEFAULT (datetime('now'))
        );
        ",
    )?;

    run_migrations(conn)?;

    Ok(())
}

/// カラム存在チェック（SQLite pragma_table_info）
fn column_exists(conn: &Connection, table: &str, column: &str) -> Result<bool, rusqlite::Error> {
    let count: i32 = conn.query_row(
        "SELECT COUNT(*) FROM pragma_table_info(?) WHERE name=?",
        [table, column],
        |r| r.get(0),
    )?;
    Ok(count > 0)
}

/// マイグレーション定義: (テーブル, カラム, SQL)
const MIGRATIONS: &[(&str, &str, &str)] = &[
    (
        "invite_codes",
        "host_ticket",
        "ALTER TABLE invite_codes ADD COLUMN host_ticket TEXT",
    ),
    (
        "tasks",
        "is_public",
        "ALTER TABLE tasks ADD COLUMN is_public INTEGER DEFAULT 1",
    ),
    (
        "tasks",
        "last_update_source",
        "ALTER TABLE tasks ADD COLUMN last_update_source TEXT DEFAULT 'local'",
    ),
    (
        "members",
        "display_name",
        "ALTER TABLE members ADD COLUMN display_name TEXT",
    ),
    (
        "tasks",
        "created_by",
        "ALTER TABLE tasks ADD COLUMN created_by TEXT",
    ),
];

fn run_migrations(conn: &Connection) -> Result<(), rusqlite::Error> {
    for (table, column, sql) in MIGRATIONS {
        if !column_exists(conn, table, column)? {
            conn.execute(sql, [])?;
        }
    }
    // 退出後に他メンバー行だけ残ると UI が「参加中」のままになるため、購読 0 件なら members を掃除
    let n_subs: i64 =
        conn.query_row("SELECT COUNT(*) FROM team_subscriptions", [], |r| r.get(0))?;
    if n_subs == 0 {
        conn.execute("DELETE FROM members", [])?;
        let _ = conn.execute("DELETE FROM team_pending_joins", []);
    }
    Ok(())
}

pub fn init_db(app_data_dir: &std::path::Path) -> Result<Connection, DbInitError> {
    std::fs::create_dir_all(app_data_dir).map_err(map_io_err)?;
    let db_path = app_data_dir.join("kastrix.db");
    let conn = Connection::open(db_path).map_err(map_sql_err)?;
    run_schema(&conn).map_err(map_sql_err)?;
    Ok(conn)
}

#[cfg(test)]
pub fn create_test_db() -> Result<Connection, rusqlite::Error> {
    let conn = Connection::open_in_memory()?;
    run_schema(&conn)?;
    Ok(conn)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_init_db() {
        let dir = std::env::temp_dir().join("kastrix_test_db");
        let _ = std::fs::remove_dir_all(&dir);
        let conn = init_db(&dir).unwrap();
        conn.execute("SELECT 1 FROM projects LIMIT 1", []).unwrap();
        conn.execute("SELECT 1 FROM tasks LIMIT 1", []).unwrap();
        let _ = std::fs::remove_dir_all(&dir);
    }
}
