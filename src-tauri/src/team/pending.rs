//! 参加申請の状態管理

use std::sync::Arc;
use tokio::sync::RwLock;

/// 参加申請（NeighborUp で受信）
#[derive(Clone, serde::Serialize)]
pub struct PendingJoinInfo {
    pub endpoint_id: String,
    pub topic_id: String,
    pub requested_at: String,
}

pub type PendingJoinsState = Arc<RwLock<Vec<PendingJoinInfo>>>;
