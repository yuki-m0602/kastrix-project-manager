use rusqlite::{Connection, Result as SqlResult};
use std::sync::Mutex;

pub struct DbState(pub Mutex<Connection>);

/// カラムが存在しなければ ALTER TABLE ADD COLUMN を実行する
fn ensure_column(conn: &Connection, table: &str, column: &str, col_def: &str) -> SqlResult<()> {
    let sql = format!("PRAGMA table_info({})", table);
    let mut stmt = conn.prepare(&sql)?;
    let has = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .any(|name| name.as_deref() == Ok(column));
    if !has {
        let alter = format!("ALTER TABLE {} ADD COLUMN {} {}", table, column, col_def);
        conn.execute_batch(&alter)?;
    }
    Ok(())
}

pub fn init_db(app_data_dir: &std::path::Path) -> SqlResult<Connection> {
    std::fs::create_dir_all(app_data_dir).expect("Failed to create app data directory");
    let db_path = app_data_dir.join("kastrix.db");
    let conn = Connection::open(db_path)?;

    conn.execute_batch("PRAGMA journal_mode=WAL;")?;
    conn.execute_batch("PRAGMA foreign_keys=ON;")?;

    // ── 基本テーブル ──
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

    // ── チーム機能テーブル ──
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS team_subscriptions (
            topic_id    TEXT PRIMARY KEY,
            host_ticket TEXT,
            is_host     INTEGER NOT NULL DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS members (
            id           TEXT PRIMARY KEY,
            endpoint_id  TEXT NOT NULL,
            role         TEXT NOT NULL DEFAULT 'member',
            status       TEXT NOT NULL DEFAULT 'pending',
            display_name TEXT,
            joined_at    TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS operations (
            id        TEXT PRIMARY KEY,
            seq       INTEGER NOT NULL,
            prev_id   TEXT,
            type      TEXT NOT NULL,
            payload   TEXT NOT NULL,
            timestamp TEXT,
            ts_source TEXT,
            synced    INTEGER DEFAULT 0
        );

        CREATE TABLE IF NOT EXISTS invite_codes (
            id           TEXT PRIMARY KEY,
            code         TEXT NOT NULL UNIQUE,
            topic_id     TEXT NOT NULL,
            host_ticket  TEXT,
            expires_at   TEXT,
            created_at   TEXT DEFAULT (datetime('now'))
        );

        CREATE TABLE IF NOT EXISTS team_pending_joins (
            endpoint_id  TEXT NOT NULL,
            topic_id     TEXT NOT NULL,
            requested_at TEXT NOT NULL,
            PRIMARY KEY (endpoint_id, topic_id)
        );

        CREATE TABLE IF NOT EXISTS team_conflict_skip_seq (
            task_id TEXT NOT NULL,
            seq     INTEGER NOT NULL,
            PRIMARY KEY (task_id, seq)
        );",
    )?;

    // ── tasks テーブルのマイグレーション（チーム機能で必要なカラムが既存DBに無い場合に追加） ──
    ensure_column(&conn, "tasks", "is_public", "INTEGER DEFAULT 1")?;
    ensure_column(&conn, "tasks", "last_update_source", "TEXT")?;
    ensure_column(&conn, "tasks", "created_by", "TEXT")?;

    Ok(conn)
}

/// テスト用: インメモリDBを初期化して返す
#[cfg(test)]
pub fn create_test_db() -> SqlResult<Connection> {
    let conn = Connection::open_in_memory()?;
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
            id                 TEXT PRIMARY KEY,
            project_id         TEXT REFERENCES projects(id) ON DELETE CASCADE,
            title              TEXT NOT NULL,
            status             TEXT CHECK(status IN ('todo','in-progress','done')) DEFAULT 'todo',
            priority           TEXT CHECK(priority IN ('high','medium','low')) DEFAULT 'medium',
            due_date           TEXT,
            assignee           TEXT,
            description        TEXT,
            created_at         TEXT DEFAULT (datetime('now')),
            updated_at         TEXT DEFAULT (datetime('now')),
            is_public          INTEGER DEFAULT 1,
            last_update_source TEXT,
            created_by         TEXT
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
