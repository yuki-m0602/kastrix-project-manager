//! チーム機能の共通ヘルパー（DRY）

use crate::models::Task;

use super::IrohState;

/// 自分の EndpointID を取得（iroh 未初期化時は空文字）
pub async fn get_my_endpoint_id(iroh: &IrohState) -> String {
    let guard = iroh.read().await;
    guard
        .as_ref()
        .map(|n| n.node_id().to_string())
        .unwrap_or_default()
}

/// 現在のユーザーが HOST かどうか
pub fn is_current_user_host(db: &rusqlite::Connection) -> bool {
    db.query_row(
        "SELECT 1 FROM team_subscriptions WHERE is_host = 1 LIMIT 1",
        [],
        |r| r.get(0),
    )
    .unwrap_or(false)
}

/// 参加申請の承認/拒否権限があるか（HOST または CO-HOST）
pub fn can_approve_or_reject(
    db: &rusqlite::Connection,
    topic_id: &str,
    my_endpoint_id: &str,
) -> bool {
    let is_host: bool = db
        .query_row(
            "SELECT 1 FROM team_subscriptions WHERE topic_id = ?1 AND is_host = 1",
            [topic_id],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if is_host {
        true
    } else {
        db.query_row(
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND role IN ('host','co_host') AND status = 'active'",
            [my_endpoint_id],
            |r| r.get(0),
        )
        .unwrap_or(false)
    }
}

/// TopicID バイト列を hex 文字列に変換
pub fn topic_id_to_hex(id: &[u8; 32]) -> String {
    id.iter().map(|b| format!("{:02x}", b)).collect()
}

/// チームに参加中か（team_subscriptions に行があるか）
pub fn in_team(conn: &rusqlite::Connection) -> bool {
    conn.query_row("SELECT 1 FROM team_subscriptions LIMIT 1", [], |_| Ok(()))
        .is_ok()
}

/// `team_subscriptions` が 0 件のとき `members` を全削除する。
/// 退出・キック後に他メンバーの行だけ残り「参加中」の UI になるのを防ぐ。
pub fn clear_members_if_no_team(conn: &rusqlite::Connection) -> rusqlite::Result<()> {
    let n: i64 = conn.query_row("SELECT COUNT(*) FROM team_subscriptions", [], |r| r.get(0))?;
    if n == 0 {
        conn.execute("DELETE FROM members", [])?;
    }
    Ok(())
}

/// ゲストとしてチームに未承認参加（ホストの承認待ち）か。
/// `my_endpoint_id` が空のときは false。キック/ブロック済みの行があるときも false（誤って「申請中」と出さない）。
pub fn am_i_pending_guest(conn: &rusqlite::Connection, my_endpoint_id: &str) -> bool {
    if my_endpoint_id.is_empty() {
        return false;
    }
    let has_guest = conn
        .query_row(
            "SELECT 1 FROM team_subscriptions WHERE is_host = 0 LIMIT 1",
            [],
            |_| Ok(()),
        )
        .is_ok();
    if !has_guest {
        return false;
    }
    if conn
        .query_row(
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'active'",
            [my_endpoint_id],
            |_| Ok(()),
        )
        .is_ok()
    {
        return false;
    }
    if conn
        .query_row(
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status IN ('kicked','blocked')",
            [my_endpoint_id],
            |_| Ok(()),
        )
        .is_ok()
    {
        return false;
    }
    true
}

/// ローカル削除を許可するか: チーム未参加なら常に可。参加中はホスト端末、または作成者本人。
pub fn can_delete_task_for_user(
    conn: &rusqlite::Connection,
    task: &Task,
    my_endpoint_id: &str,
) -> bool {
    if !in_team(conn) {
        return true;
    }
    if is_current_user_host(conn) {
        return true;
    }
    if my_endpoint_id.is_empty() {
        return false;
    }
    task.created_by.as_deref() == Some(my_endpoint_id)
}

/// 同期で受信した task_update delete を適用してよいか。actor_endpoint_id 必須。
/// ホスト（members.role = host）またはタスク作成者のみ。
pub fn can_apply_remote_task_delete(
    conn: &rusqlite::Connection,
    task: &Task,
    actor: Option<&str>,
) -> bool {
    let Some(actor) = actor else {
        return false;
    };
    if actor.is_empty() {
        return false;
    }
    if conn
        .query_row(
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND role = 'host' AND status = 'active'",
            [actor],
            |_| Ok(()),
        )
        .is_ok()
    {
        return true;
    }
    task.created_by.as_deref() == Some(actor)
}
