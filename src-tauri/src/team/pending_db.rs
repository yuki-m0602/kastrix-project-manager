//! 参加申請キューの SQLite 永続化（再起動後もホスト側の承認待ち一覧を復元）

use rusqlite::{params, Connection, Result as SqlResult};

use super::pending::PendingJoinInfo;

pub fn upsert_pending_join(conn: &Connection, info: &PendingJoinInfo) -> SqlResult<()> {
    conn.execute(
        "INSERT INTO team_pending_joins (endpoint_id, topic_id, requested_at) VALUES (?1, ?2, ?3)
         ON CONFLICT(endpoint_id, topic_id) DO UPDATE SET requested_at = excluded.requested_at",
        params![&info.endpoint_id, &info.topic_id, &info.requested_at],
    )?;
    Ok(())
}

pub fn delete_pending_join(conn: &Connection, endpoint_id: &str, topic_id: &str) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM team_pending_joins WHERE endpoint_id = ?1 AND topic_id = ?2",
        [endpoint_id, topic_id],
    )?;
    Ok(())
}

pub fn delete_pending_for_endpoint(conn: &Connection, endpoint_id: &str) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM team_pending_joins WHERE endpoint_id = ?1",
        [endpoint_id],
    )?;
    Ok(())
}

pub fn delete_pending_for_topic(conn: &Connection, topic_id: &str) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM team_pending_joins WHERE topic_id = ?1",
        [topic_id],
    )?;
    Ok(())
}

pub fn delete_all_pending_joins(conn: &Connection) -> SqlResult<()> {
    conn.execute("DELETE FROM team_pending_joins", [])?;
    Ok(())
}

/// 購読のないトピックの行を削除（残骸防止）
pub fn purge_orphan_pending_joins(conn: &Connection) -> SqlResult<()> {
    conn.execute(
        "DELETE FROM team_pending_joins WHERE topic_id NOT IN (SELECT topic_id FROM team_subscriptions)",
        [],
    )?;
    Ok(())
}

pub fn load_all_pending_joins(conn: &Connection) -> SqlResult<Vec<PendingJoinInfo>> {
    let mut stmt = conn.prepare(
        "SELECT endpoint_id, topic_id, requested_at FROM team_pending_joins ORDER BY requested_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(PendingJoinInfo {
            endpoint_id: row.get(0)?,
            topic_id: row.get(1)?,
            requested_at: row.get(2)?,
        })
    })?;
    rows.collect()
}

pub fn restore_pending_joins_from_db(conn: &Connection) -> SqlResult<Vec<PendingJoinInfo>> {
    purge_orphan_pending_joins(conn)?;
    load_all_pending_joins(conn)
}
