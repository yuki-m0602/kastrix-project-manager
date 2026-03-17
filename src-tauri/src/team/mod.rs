//! チーム機能モジュール
//!
//! Phase 1: iroh 接続基盤、招待コード、DB 操作、Tauri コマンドを実装。

mod broadcast;
mod event_handler;
mod helpers;
mod invite_code;
mod iroh_node;
mod payloads;
mod pending;
mod task_sync;

pub use broadcast::{
    broadcast_member_display_name, broadcast_member_op, broadcast_permission_change,
    broadcast_team_disband,
};
pub use event_handler::spawn_topic_listener;
pub use helpers::{can_approve_or_reject, get_my_endpoint_id, is_current_user_host, topic_id_to_hex};
pub use invite_code::{generate_invite_code, normalize_code};
pub use iroh_node::{IrohNodeState, IrohState};
pub use pending::{PendingJoinInfo, PendingJoinsState};
pub use task_sync::{
    apply_task_update, broadcast_task_update, record_operation, TaskUpdatePayload,
};
