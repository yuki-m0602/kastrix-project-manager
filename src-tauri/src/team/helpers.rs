//! チーム機能の共通ヘルパー（DRY）

use crate::models::Task;
use uuid::Uuid;

use super::payloads::MemberRosterEntry;
use super::IrohState;

/// iroh NodeId 文字列の表記を揃える（DB 比較・gossip 受信の取り違え防止）
#[inline]
pub fn normalize_endpoint_id(s: &str) -> String {
    s.trim().to_ascii_lowercase()
}

/// 自分の EndpointID を取得（iroh 未初期化時は空文字）
pub async fn get_my_endpoint_id(iroh: &IrohState) -> String {
    let guard = iroh.read().await;
    guard
        .as_ref()
        .map(|n| normalize_endpoint_id(&n.node_id().to_string()))
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
            "SELECT 1 FROM team_subscriptions WHERE lower(topic_id) = lower(?1) AND is_host = 1",
            [topic_id],
            |r| r.get(0),
        )
        .unwrap_or(false);
    if is_host {
        true
    } else {
        db.query_row(
            "SELECT 1 FROM members WHERE lower(endpoint_id) = lower(?1) AND role IN ('host','co_host') AND status = 'active'",
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

/// `member_join` 受信またはホスト側承認時: メンバーを active に追加・更新（ブロック済みは変更しない）
pub fn upsert_member_joined_active(
    conn: &rusqlite::Connection,
    endpoint_id: &str,
) -> rusqlite::Result<()> {
    let ep = normalize_endpoint_id(endpoint_id);
    if ep.is_empty() {
        return Ok(());
    }
    if conn
        .query_row(
            "SELECT 1 FROM members WHERE lower(endpoint_id) = lower(?1) AND status = 'blocked'",
            [&ep],
            |_| Ok(()),
        )
        .is_ok()
    {
        return Ok(());
    }
    let n = conn.execute(
        "UPDATE members SET
           endpoint_id = ?1,
           status = CASE WHEN status = 'blocked' THEN status ELSE 'active' END
         WHERE lower(endpoint_id) = lower(?1)",
        [&ep],
    )?;
    if n > 0 {
        return Ok(());
    }
    let id = Uuid::new_v4().to_string();
    conn.execute(
        "INSERT INTO members (id, endpoint_id, role, status) VALUES (?1, ?2, 'member', 'active')",
        rusqlite::params![id, ep],
    )?;
    Ok(())
}

/// ローカル DB の active メンバーを収集（`member_roster` 送信用）
pub fn collect_active_member_roster(
    conn: &rusqlite::Connection,
) -> rusqlite::Result<Vec<MemberRosterEntry>> {
    let mut stmt = conn.prepare(
        "SELECT endpoint_id, role, display_name FROM members WHERE status = 'active' \
         ORDER BY (CASE role WHEN 'host' THEN 0 WHEN 'co_host' THEN 1 ELSE 2 END), joined_at ASC",
    )?;
    let rows = stmt.query_map([], |row| {
        let endpoint_id: String = row.get(0)?;
        let role: String = row.get(1)?;
        let dn: Option<String> = row.get(2)?;
        Ok(MemberRosterEntry {
            endpoint_id: normalize_endpoint_id(&endpoint_id),
            role,
            display_name: dn.filter(|s| !s.trim().is_empty()),
        })
    })?;
    rows.collect()
}

/// gossip `member_roster` を適用。該当 `topic_id` を購読中の端末だけ更新する。
pub fn apply_member_roster(
    conn: &rusqlite::Connection,
    topic_id_msg: &str,
    entries: &[MemberRosterEntry],
) -> rusqlite::Result<()> {
    let tid = topic_id_msg.to_ascii_lowercase();
    if tid.is_empty() || entries.is_empty() {
        return Ok(());
    }
    let subscribed = conn
        .query_row(
            "SELECT 1 FROM team_subscriptions WHERE lower(topic_id) = lower(?1) LIMIT 1",
            [&tid],
            |_| Ok(()),
        )
        .is_ok();
    if !subscribed {
        return Ok(());
    }

    let tx = conn.unchecked_transaction()?;
    let mut norm_ids: Vec<String> = Vec::new();

    for e in entries {
        let ep = normalize_endpoint_id(&e.endpoint_id);
        if ep.is_empty() {
            continue;
        }
        let role = e.role.trim();
        if role != "host" && role != "co_host" && role != "member" {
            continue;
        }
        if tx
            .query_row(
                "SELECT status FROM members WHERE lower(endpoint_id) = lower(?1)",
                [&ep],
                |r| r.get::<_, String>(0),
            )
            .unwrap_or_default()
            == "blocked"
        {
            continue;
        }
        let disp: Option<String> = e
            .display_name
            .as_ref()
            .map(|s| s.trim().to_string())
            .filter(|s| !s.is_empty());

        let n = tx.execute(
            "UPDATE members SET role = ?1, status = 'active', display_name = COALESCE(?2, display_name) \
             WHERE lower(endpoint_id) = lower(?3)",
            rusqlite::params![role, disp, ep],
        )?;
        if n == 0 {
            let id = Uuid::new_v4().to_string();
            tx.execute(
                "INSERT INTO members (id, endpoint_id, role, status, display_name) VALUES (?1, ?2, ?3, 'active', ?4)",
                rusqlite::params![id, ep, role, disp],
            )?;
        }
        norm_ids.push(ep);
    }

    if norm_ids.is_empty() {
        tx.commit()?;
        return Ok(());
    }

    let placeholders = norm_ids.iter().map(|_| "?").collect::<Vec<_>>().join(",");
    let sql = format!(
        "DELETE FROM members WHERE status = 'active' AND lower(endpoint_id) NOT IN ({})",
        placeholders
    );
    tx.execute(
        &sql,
        rusqlite::params_from_iter(norm_ids.iter().map(|s| s.as_str())),
    )?;
    tx.commit()?;
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
            "SELECT 1 FROM members WHERE lower(endpoint_id) = lower(?1) AND status = 'active'",
            [my_endpoint_id],
            |_| Ok(()),
        )
        .is_ok()
    {
        return false;
    }
    if conn
        .query_row(
            "SELECT 1 FROM members WHERE lower(endpoint_id) = lower(?1) AND status IN ('kicked','blocked')",
            [my_endpoint_id],
            |_| Ok(()),
        )
        .is_ok()
    {
        return false;
    }
    true
}

/// ローカル削除を許可するか: チーム未参加なら常に可。参加中はホスト・CO-HOST端末、または作成者本人。
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
    // CO-HOST もタスク削除可
    if !my_endpoint_id.is_empty()
        && conn
            .query_row(
                "SELECT 1 FROM members WHERE lower(endpoint_id) = lower(?1) AND role = 'co_host' AND status = 'active'",
                [my_endpoint_id],
                |_| Ok(()),
            )
            .is_ok()
    {
        return true;
    }
    if my_endpoint_id.is_empty() {
        return false;
    }
    task.created_by.as_deref() == Some(my_endpoint_id)
}

/// 同期で受信した task_update delete を適用してよいか。actor_endpoint_id 必須。
/// ホスト・CO-HOST（members.role IN host, co_host）またはタスク作成者のみ。
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
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND role IN ('host','co_host') AND status = 'active'",
            [actor],
            |_| Ok(()),
        )
        .is_ok()
    {
        return true;
    }
    task.created_by.as_deref() == Some(actor)
}
