//! チーム機能で使用するペイロード定義（gossip 送受信用）

/// 承認後に全員がローカル members を揃えるための gossip ペイロード
#[derive(serde::Serialize, serde::Deserialize)]
pub struct MemberJoinPayload {
    pub r#type: String,
    #[serde(default)]
    pub version: Option<String>,
    pub endpoint_id: String,
    pub topic_id: String,
}

/// join_request ブロードキャスト用（CO-HOST が参加申請を見れるようにする）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct JoinRequestPayload {
    pub r#type: String,
    pub endpoint_id: String,
    pub topic_id: String,
    pub requested_at: String,
}

/// member_kick / member_block / member_cancel のペイロード
#[derive(serde::Serialize, serde::Deserialize)]
pub struct MemberOpPayload {
    #[serde(default)]
    pub version: Option<String>,
    pub r#type: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub priority: Option<String>,
    pub target_id: String,
}

/// member_blocked_notify（ブロックされた参加者に通知）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct MemberBlockedNotifyPayload {
    pub r#type: String,
    pub target_id: String,
}

/// member_display_name（表示名の同期）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct MemberDisplayNamePayload {
    #[serde(default)]
    pub version: Option<String>,
    pub r#type: String,
    pub endpoint_id: String,
    pub display_name: String,
}

/// permission_change（ホスト退出時のCO-HOST昇格）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct PermissionChangePayload {
    pub r#type: String,
    #[serde(default)]
    pub version: Option<String>,
    pub old_host_endpoint_id: String,
    pub new_host_endpoint_id: String,
}

/// team_disband（チーム解散通知）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct TeamDisbandPayload {
    pub r#type: String,
    #[serde(default)]
    pub version: Option<String>,
}

/// team_name_update（チーム名の全員同期）
#[derive(serde::Serialize, serde::Deserialize)]
pub struct TeamNamePayload {
    pub r#type: String,
    #[serde(default)]
    pub version: Option<String>,
    pub name: String,
}
