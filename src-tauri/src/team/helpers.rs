//! チーム機能の共通ヘルパー（DRY）

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
