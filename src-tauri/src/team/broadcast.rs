//! チームへの JSON ブロードキャスト

use bytes::Bytes;

use super::payloads::{
    MemberBlockedNotifyPayload, MemberDisplayNamePayload, MemberJoinPayload, MemberOpPayload,
    PermissionChangePayload, TeamDisbandPayload,
};
use super::IrohState;

/// JSON ペイロードをチーム全員にブロードキャスト（共通ヘルパー）
pub async fn broadcast_json_payload<T: serde::Serialize>(
    iroh: &IrohState,
    payload: &T,
) -> Result<(), String> {
    let guard = iroh.read().await;
    let node = match guard.as_ref() {
        Some(n) => n,
        None => return Ok(()),
    };
    let senders = node.get_all_senders().await;
    if senders.is_empty() {
        return Ok(());
    }
    let json = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let bytes = Bytes::from(json.into_bytes());
    for sender in senders {
        let _ = sender.broadcast(bytes.clone()).await;
    }
    Ok(())
}

/// 承認済みメンバーをチーム全員のローカル DB に反映するためブロードキャスト
///
/// 該当トピックの sender を優先し、`broadcast` に加え `broadcast_neighbors` も送って
/// 1 ホップの相手にも届きやすくする（topic_id の大小文字差で受信側が無視するのも防ぐため payload は小文字化）。
pub async fn broadcast_member_join(
    iroh: &IrohState,
    endpoint_id: &str,
    topic_id: &str,
) -> Result<(), String> {
    let topic_norm = topic_id.to_ascii_lowercase();
    let payload = MemberJoinPayload {
        r#type: "member_join".to_string(),
        version: Some("1.0".to_string()),
        endpoint_id: endpoint_id.to_string(),
        topic_id: topic_norm,
    };
    let json = serde_json::to_string(&payload).map_err(|e| e.to_string())?;
    let bytes = Bytes::from(json.into_bytes());

    let guard = iroh.read().await;
    let node = match guard.as_ref() {
        Some(n) => n,
        None => return Ok(()),
    };

    let mut senders = node.get_senders_for_topic_hex(topic_id).await;
    if senders.is_empty() {
        senders = node.get_all_senders().await;
    }
    if senders.is_empty() {
        return Ok(());
    }
    for sender in senders {
        let _ = sender.broadcast(bytes.clone()).await;
        let _ = sender.broadcast_neighbors(bytes.clone()).await;
    }
    Ok(())
}

/// メンバー操作をブロードキャスト
pub async fn broadcast_member_op(
    iroh: &IrohState,
    op_type: &str,
    target_id: &str,
    priority: Option<&str>,
) -> Result<(), String> {
    let payload = MemberOpPayload {
        version: Some("1.0".to_string()),
        r#type: op_type.to_string(),
        priority: priority.map(String::from),
        target_id: target_id.to_string(),
    };
    broadcast_json_payload(iroh, &payload).await
}

/// member_display_name をブロードキャスト（表示名をチーム全員に同期）
pub async fn broadcast_member_display_name(
    iroh: &IrohState,
    endpoint_id: &str,
    display_name: &str,
) -> Result<(), String> {
    let payload = MemberDisplayNamePayload {
        version: Some("1.0".to_string()),
        r#type: "member_display_name".to_string(),
        endpoint_id: endpoint_id.to_string(),
        display_name: display_name.to_string(),
    };
    broadcast_json_payload(iroh, &payload).await
}

/// member_blocked_notify をブロードキャスト（ブロックされた参加者に通知）
pub async fn broadcast_blocked_notify(iroh: &IrohState, target_id: &str) -> Result<(), String> {
    let payload = MemberBlockedNotifyPayload {
        r#type: "member_blocked_notify".to_string(),
        target_id: target_id.to_string(),
    };
    broadcast_json_payload(iroh, &payload).await
}

/// permission_change をブロードキャスト（ホスト退出時のCO-HOST昇格）
pub async fn broadcast_permission_change(
    iroh: &IrohState,
    old_host_endpoint_id: &str,
    new_host_endpoint_id: &str,
) -> Result<(), String> {
    let payload = PermissionChangePayload {
        r#type: "permission_change".to_string(),
        version: Some("1.0".to_string()),
        old_host_endpoint_id: old_host_endpoint_id.to_string(),
        new_host_endpoint_id: new_host_endpoint_id.to_string(),
    };
    broadcast_json_payload(iroh, &payload).await
}

/// team_disband をブロードキャスト（チーム解散通知）
pub async fn broadcast_team_disband(iroh: &IrohState) -> Result<(), String> {
    let payload = TeamDisbandPayload {
        r#type: "team_disband".to_string(),
        version: Some("1.0".to_string()),
    };
    broadcast_json_payload(iroh, &payload).await
}
