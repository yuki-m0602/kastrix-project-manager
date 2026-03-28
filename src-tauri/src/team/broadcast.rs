//! チームへの JSON ブロードキャスト

use bytes::Bytes;

use super::payloads::{
    JoinRequestPayload, MemberBlockedNotifyPayload, MemberDisplayNamePayload, MemberJoinPayload,
    MemberOpPayload, PermissionChangePayload, TeamDisbandPayload,
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
/// 該当トピックの sender を優先し、近傍優先で `broadcast_neighbors` のあと `broadcast`。
/// メッシュの一時不安定に備え数回再試行する（iroh 購読が空ならエラー）。
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

    async fn send_once(iroh: &IrohState, topic_id: &str, bytes: &Bytes) -> Result<(), String> {
        let guard = iroh.read().await;
        let node = guard
            .as_ref()
            .ok_or_else(|| "iroh が初期化されていません".to_string())?;

        let mut senders = node.get_senders_for_topic_hex(topic_id).await;
        if senders.is_empty() {
            senders = node.get_all_senders().await;
        }
        if senders.is_empty() {
            return Err(
                "gossip の購読がありません（チームに接続してから再度お試しください）".to_string(),
            );
        }

        let mut any_ok = false;
        let mut last_err: Option<String> = None;
        for sender in senders {
            // 2ノード構成では Neighbors の方が届きやすいことがあるため先に送る
            match sender.broadcast_neighbors(bytes.clone()).await {
                Ok(()) => any_ok = true,
                Err(e) => last_err = Some(format!("broadcast_neighbors: {:?}", e)),
            }
            match sender.broadcast(bytes.clone()).await {
                Ok(()) => any_ok = true,
                Err(e) => last_err = Some(format!("broadcast: {:?}", e)),
            }
        }
        if !any_ok {
            return Err(last_err.unwrap_or_else(|| "gossip 送信に失敗".to_string()));
        }
        Ok(())
    }

    const ATTEMPTS: u32 = 6;
    const PAUSE_MS: u64 = 450;
    for attempt in 0..ATTEMPTS {
        match send_once(iroh, topic_id, &bytes).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                // 購読ゼロは待っても改善しない
                if e.contains("購読がありません") {
                    return Err(e);
                }
                if attempt + 1 == ATTEMPTS {
                    return Err(e);
                }
                tokio::time::sleep(std::time::Duration::from_millis(PAUSE_MS)).await;
            }
        }
    }
    Err("member_join の gossip 送信が繰り返し失敗しました".to_string())
}

/// 参加申請を該当トピックへ送信（`broadcast_member_join` と同様に neighbor 優先・再試行）
pub async fn broadcast_join_request(
    iroh: &IrohState,
    topic_id: &str,
    payload: &JoinRequestPayload,
) -> Result<(), String> {
    let topic_norm = topic_id.to_ascii_lowercase();
    let json = serde_json::to_string(payload).map_err(|e| e.to_string())?;
    let bytes = Bytes::from(json.into_bytes());

    async fn send_once(iroh: &IrohState, topic_id: &str, bytes: &Bytes) -> Result<(), String> {
        let guard = iroh.read().await;
        let node = guard
            .as_ref()
            .ok_or_else(|| "iroh が初期化されていません".to_string())?;

        let mut senders = node.get_senders_for_topic_hex(topic_id).await;
        if senders.is_empty() {
            senders = node.get_all_senders().await;
        }
        if senders.is_empty() {
            return Err(
                "gossip の購読がありません（チームに接続してから再度お試しください）".to_string(),
            );
        }

        let mut any_ok = false;
        let mut last_err: Option<String> = None;
        for sender in senders {
            match sender.broadcast_neighbors(bytes.clone()).await {
                Ok(()) => any_ok = true,
                Err(e) => last_err = Some(format!("broadcast_neighbors: {:?}", e)),
            }
            match sender.broadcast(bytes.clone()).await {
                Ok(()) => any_ok = true,
                Err(e) => last_err = Some(format!("broadcast: {:?}", e)),
            }
        }
        if !any_ok {
            return Err(last_err.unwrap_or_else(|| "gossip 送信に失敗".to_string()));
        }
        Ok(())
    }

    const ATTEMPTS: u32 = 6;
    const PAUSE_MS: u64 = 450;
    for attempt in 0..ATTEMPTS {
        match send_once(iroh, &topic_norm, &bytes).await {
            Ok(()) => return Ok(()),
            Err(e) => {
                if e.contains("購読がありません") {
                    return Err(e);
                }
                if attempt + 1 == ATTEMPTS {
                    return Err(e);
                }
                tokio::time::sleep(std::time::Duration::from_millis(PAUSE_MS)).await;
            }
        }
    }
    Err("join_request の gossip 送信が繰り返し失敗しました".to_string())
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
