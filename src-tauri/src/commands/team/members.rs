//! メンバー関連コマンド（一覧・承認・拒否・キック・ブロック・CO-HOST 昇格）

use crate::db::DbState;
use crate::team::{
    am_i_pending_guest, broadcast_member_display_name, broadcast_member_join, broadcast_member_op,
    broadcast_member_roster, broadcast_member_sync_need, can_approve_or_reject,
    clear_members_if_no_team, clear_pending_invite_preview, collect_active_member_roster,
    get_my_endpoint_id, in_team, is_current_user_host, normalize_endpoint_id, pending_db,
    upsert_member_joined_active, MemberSyncNeedPayload, IrohState,
};
use tauri::{AppHandle, Emitter, State};
use uuid::Uuid;

use super::{PendingJoinInfo, PendingJoinsState};

#[derive(serde::Serialize)]
pub struct MemberInfo {
    pub id: String,
    pub endpoint_id: String,
    pub role: String,
    pub status: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub display_name: Option<String>,
}

#[tauri::command]
pub fn team_list_blocked(state: State<'_, DbState>) -> Result<Vec<MemberInfo>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, endpoint_id, role, status, display_name FROM members WHERE status = 'blocked' ORDER BY endpoint_id")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MemberInfo {
                id: row.get(0)?,
                endpoint_id: row.get(1)?,
                role: row.get(2)?,
                status: row.get(3)?,
                display_name: row.get::<_, Option<String>>(4).ok().flatten(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

#[tauri::command]
pub fn team_is_in_team(state: State<'_, DbState>) -> Result<bool, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    Ok(in_team(&db))
}

/// 自分が members で active か（購読の残骸だけでは true にしない）
#[tauri::command]
pub async fn team_is_active_member(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<bool, String> {
    let my_id = get_my_endpoint_id(&iroh).await;
    if my_id.is_empty() {
        return Ok(false);
    }
    let db = state.0.lock().map_err(|e| e.to_string())?;
    if !in_team(&db) {
        return Ok(false);
    }
    Ok(db
        .query_row(
            "SELECT 1 FROM members WHERE lower(endpoint_id) = lower(?1) AND status = 'active'",
            [&my_id],
            |_| Ok(()),
        )
        .is_ok())
}

/// 購読はあるが自分が active メンバーでも承認待ちでもない不整合を掃除（UI が「参加中」のまま固まるのを防ぐ）
#[tauri::command]
pub async fn team_repair_orphan_if_needed(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
) -> Result<bool, String> {
    let my_id = get_my_endpoint_id(&iroh).await;
    if my_id.is_empty() {
        return Ok(false);
    }
    let topics: Vec<String> = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        if !in_team(&db) {
            return Ok(false);
        }
        if am_i_pending_guest(&db, &my_id) {
            return Ok(false);
        }
        if db
            .query_row(
                "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'active'",
                [&my_id],
                |_| Ok(()),
            )
            .is_ok()
        {
            return Ok(false);
        }
        let mut stmt = db
            .prepare("SELECT topic_id FROM team_subscriptions")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |r| r.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };
    if topics.is_empty() {
        return Ok(false);
    }
    for tid in &topics {
        let guard = iroh.read().await;
        if let Some(node) = guard.as_ref() {
            node.unsubscribe(tid).await;
        }
    }
    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.execute("DELETE FROM team_subscriptions", [])
            .map_err(|e| e.to_string())?;
        db.execute("DELETE FROM members", [])
            .map_err(|e| e.to_string())?;
        pending_db::delete_all_pending_joins(&db).map_err(|e| e.to_string())?;
    }
    {
        let mut guard = pending_joins.write().await;
        guard.clear();
    }
    let _ = app.emit("team-left", ());
    Ok(true)
}

#[tauri::command]
pub fn team_list_members(state: State<'_, DbState>) -> Result<Vec<MemberInfo>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let mut stmt = db
        .prepare("SELECT id, endpoint_id, role, status, display_name FROM members WHERE status = 'active' ORDER BY role DESC, joined_at ASC")
        .map_err(|e| e.to_string())?;
    let rows = stmt
        .query_map([], |row| {
            Ok(MemberInfo {
                id: row.get(0)?,
                endpoint_id: row.get(1)?,
                role: row.get(2)?,
                status: row.get(3)?,
                display_name: row.get::<_, Option<String>>(4).ok().flatten(),
            })
        })
        .map_err(|e| e.to_string())?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| e.to_string())?;
    Ok(rows)
}

/// 参加申請一覧（SQLite を正とする。メモリとズレた場合でも UI に出るようにする）
#[tauri::command]
pub fn team_list_pending_joins(state: State<'_, DbState>) -> Result<Vec<PendingJoinInfo>, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    pending_db::load_all_pending_joins(&db).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn team_am_i_pending(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<bool, String> {
    let my_id = get_my_endpoint_id(&iroh).await;
    let db = state.0.lock().map_err(|e| e.to_string())?;
    Ok(am_i_pending_guest(&db, &my_id))
}

/// 承認済みだが `member_join` が届いていないゲストが、gossip でホスト/CO-HOST に再送を依頼する。
#[tauri::command]
pub async fn team_request_member_sync(
    iroh: State<'_, IrohState>,
    state: State<'_, DbState>,
) -> Result<bool, String> {
    let my_id = get_my_endpoint_id(&iroh).await;
    if my_id.is_empty() {
        return Ok(false);
    }
    let topic_id: String = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        if !am_i_pending_guest(&db, &my_id) {
            return Ok(false);
        }
        match db.query_row(
            "SELECT topic_id FROM team_subscriptions WHERE is_host = 0 LIMIT 1",
            [],
            |r| r.get::<_, String>(0),
        ) {
            Ok(t) => t,
            Err(rusqlite::Error::QueryReturnedNoRows) => return Ok(false),
            Err(e) => return Err(e.to_string()),
        }
    };
    let tid = topic_id.to_ascii_lowercase();
    let ep = normalize_endpoint_id(&my_id);
    let payload = MemberSyncNeedPayload {
        r#type: "member_sync_need".to_string(),
        endpoint_id: ep,
        topic_id: tid.clone(),
    };
    broadcast_member_sync_need(&iroh, &tid, &payload).await?;
    Ok(true)
}

/// ホストは承認済みだが `member_join` gossip が届かず画面が切り替わらないときの救済。
/// **参加申請中**（`am_i_pending_guest`）のときだけ、ローカル DB に自分を active メンバーとして書き込む。
#[tauri::command]
pub async fn team_guest_apply_local_membership_if_pending(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<(), String> {
    let my_id = get_my_endpoint_id(&iroh).await;
    if my_id.is_empty() {
        return Err(
            "エンドポイントIDを取得できません。しばらく待ってから再度お試しください。".to_string(),
        );
    }
    let ep = normalize_endpoint_id(&my_id);
    let db = state.0.lock().map_err(|e| e.to_string())?;
    if !am_i_pending_guest(&db, &ep) {
        return Err("参加申請中ではないか、すでにメンバーとして同期済みです。".to_string());
    }
    upsert_member_joined_active(&db, &ep).map_err(|e| e.to_string())?;
    let _ = clear_pending_invite_preview(&db);
    drop(db);
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn team_cancel_join(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
) -> Result<(), String> {
    let my_id = get_my_endpoint_id(&iroh).await;

    let guest_topics: Vec<String> = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let mut stmt = db
            .prepare("SELECT topic_id FROM team_subscriptions WHERE is_host = 0")
            .map_err(|e| e.to_string())?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(|e| e.to_string())?;
        rows.collect::<Result<Vec<_>, _>>()
            .map_err(|e| e.to_string())?
    };

    if !guest_topics.is_empty() {
        let is_active = {
            let db = state.0.lock().map_err(|e| e.to_string())?;
            if my_id.is_empty() {
                false
            } else {
                db.query_row(
                    "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'active'",
                    [&my_id],
                    |_| Ok(()),
                )
                .is_ok()
            }
        };
        if is_active {
            return Err("すでに承認済みです。キャンセルできません。".to_string());
        }
        // ブロードキャスト失敗でもローカル DB は必ず掃除する（ホスト側は申請リストが残る可能性はある）
        if !my_id.is_empty() {
            let _ = broadcast_member_op(&iroh, "member_cancel", &my_id, None).await;
        }
        {
            let db = state.0.lock().map_err(|e| e.to_string())?;
            db.execute("DELETE FROM team_subscriptions WHERE is_host = 0", [])
                .map_err(|e| e.to_string())?;
            for tid in &guest_topics {
                let _ = pending_db::delete_pending_join(&db, &my_id, tid);
            }
            clear_members_if_no_team(&db).map_err(|e| e.to_string())?;
            let _ = clear_pending_invite_preview(&db);
        }
        {
            let guard = iroh.read().await;
            if let Some(node) = guard.as_ref() {
                for tid in &guest_topics {
                    node.unsubscribe(tid).await;
                }
            }
        }
        let _ = app.emit("team-cancelled", ());
        return Ok(());
    }

    if my_id.is_empty() {
        return Err("ノードIDを取得できません".to_string());
    }

    // 参加申請がない場合: ホストの孤立状態（is_host=1 だが members にいない）を解消
    let topic_id = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let host: Option<String> = db
            .query_row(
                "SELECT topic_id FROM team_subscriptions WHERE is_host = 1 LIMIT 1",
                [],
                |r| r.get(0),
            )
            .ok();
        let topic_id = host.ok_or_else(|| "参加申請中のチームがありません".to_string())?;
        let is_active = db
            .query_row(
                "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'active'",
                [&my_id],
                |_| Ok(()),
            )
            .is_ok();
        if is_active {
            return Err("参加申請中のチームがありません".to_string());
        }
        topic_id
    };

    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.execute(
            "DELETE FROM team_subscriptions WHERE topic_id = ?1",
            [&topic_id],
        )
        .map_err(|e| e.to_string())?;
        let _ = pending_db::delete_pending_join(&db, &my_id, &topic_id);
        clear_members_if_no_team(&db).map_err(|e| e.to_string())?;
        let _ = clear_pending_invite_preview(&db);
    }
    {
        let guard = iroh.read().await;
        if let Some(node) = guard.as_ref() {
            node.unsubscribe(&topic_id).await;
        }
    }
    let _ = app.emit("team-cancelled", ());
    Ok(())
}

#[tauri::command]
pub async fn team_approve_join(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    endpoint_id: String,
    topic_id: String,
) -> Result<(), String> {
    let endpoint_id = normalize_endpoint_id(&endpoint_id);
    let topic_id = topic_id.to_ascii_lowercase();
    let my_endpoint_id = get_my_endpoint_id(&iroh).await;
    let can_approve = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        can_approve_or_reject(&db, &topic_id, &my_endpoint_id)
    };
    if !can_approve {
        return Err("承認する権限がありません（HOST または CO-HOST のみ）".to_string());
    }
    let is_blocked = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row(
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'blocked'",
            [&endpoint_id],
            |_| Ok(true),
        )
        .unwrap_or(false)
    };
    if is_blocked {
        return Err(
            "このメンバーはブロックされています。ブロック解除後に再招待してください。".to_string(),
        );
    }
    {
        let mut guard = pending_joins.write().await;
        guard.retain(|p| {
            !(normalize_endpoint_id(&p.endpoint_id) == endpoint_id && p.topic_id == topic_id)
        });
    }
    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        pending_db::delete_pending_join(&db, &endpoint_id, &topic_id).map_err(|e| e.to_string())?;
        upsert_member_joined_active(&db, &endpoint_id).map_err(|e| e.to_string())?;
    }
    match broadcast_member_join(&iroh, &endpoint_id, &topic_id).await {
        Ok(()) => {}
        Err(e) => {
            eprintln!("broadcast_member_join: {}", e);
            let _ = app.emit("team-member-join-broadcast-failed", e);
        }
    }
    let roster = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        collect_active_member_roster(&db).map_err(|e| e.to_string())?
    };
    if let Err(e) = broadcast_member_roster(&iroh, &topic_id, &roster).await {
        eprintln!("broadcast_member_roster: {}", e);
    }
    // 参加側が初回 member_join を取りこぼしやすいため、遅延で数回再送（冪等）
    let iroh_retry = iroh.inner().clone();
    let ep_retry = endpoint_id.clone();
    let tid_retry = topic_id.clone();
    tauri::async_runtime::spawn(async move {
        for ms in [2500_u64, 8000, 16000] {
            tokio::time::sleep(std::time::Duration::from_millis(ms)).await;
            if let Err(e) = broadcast_member_join(&iroh_retry, &ep_retry, &tid_retry).await {
                eprintln!("broadcast_member_join (approve retry): {}", e);
            }
        }
    });
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn team_reject_join(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    endpoint_id: String,
    topic_id: String,
) -> Result<(), String> {
    let endpoint_id = normalize_endpoint_id(&endpoint_id);
    let topic_id = topic_id.to_ascii_lowercase();
    let my_endpoint_id = get_my_endpoint_id(&iroh).await;
    let can_reject = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        can_approve_or_reject(&db, &topic_id, &my_endpoint_id)
    };
    if !can_reject {
        return Err("拒否する権限がありません（HOST または CO-HOST のみ）".to_string());
    }
    {
        let mut guard = pending_joins.write().await;
        guard.retain(|p| {
            !(normalize_endpoint_id(&p.endpoint_id) == endpoint_id && p.topic_id == topic_id)
        });
    }
    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        pending_db::delete_pending_join(&db, &endpoint_id, &topic_id).map_err(|e| e.to_string())?;
    }
    Ok(())
}

#[tauri::command]
pub async fn team_kick(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    app: AppHandle,
    endpoint_id: String,
) -> Result<(), String> {
    let my_endpoint_id = get_my_endpoint_id(&iroh).await;
    let n = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        let is_host = is_current_user_host(&db);
        let is_co_host: bool = db
            .query_row(
                "SELECT 1 FROM members WHERE endpoint_id = ?1 AND role IN ('host','co_host') AND status = 'active'",
                [&my_endpoint_id],
                |r| r.get(0),
            )
            .unwrap_or(false);
        if !is_host && !is_co_host {
            return Err("キックする権限がありません（HOST または CO-HOST のみ）".to_string());
        }
        db.execute(
            "UPDATE members SET status = 'kicked' WHERE endpoint_id = ?1 AND status = 'active'",
            [&endpoint_id],
        )
        .map_err(|e| e.to_string())?
    };
    if n == 0 {
        return Err("キック対象のメンバーが見つかりません".to_string());
    }
    {
        let mut guard = pending_joins.write().await;
        guard.retain(|p| p.endpoint_id != endpoint_id);
    }
    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        pending_db::delete_pending_for_endpoint(&db, &endpoint_id).map_err(|e| e.to_string())?;
    }
    broadcast_member_op(&iroh, "member_kick", &endpoint_id, None).await?;
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn team_block(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    pending_joins: State<'_, PendingJoinsState>,
    app: AppHandle,
    endpoint_id: String,
) -> Result<(), String> {
    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        if !is_current_user_host(&db) {
            return Err("ブロックする権限がありません（HOST のみ）".to_string());
        }
        let n = db
            .execute(
                "UPDATE members SET status = 'blocked' WHERE endpoint_id = ?1",
                [&endpoint_id],
            )
            .map_err(|e| e.to_string())?;
        if n == 0 {
            db.execute(
                "INSERT INTO members (id, endpoint_id, role, status) VALUES (?1, ?2, 'member', 'blocked')",
                rusqlite::params![Uuid::new_v4().to_string(), endpoint_id],
            )
            .map_err(|e| e.to_string())?;
        }
    }
    {
        let mut guard = pending_joins.write().await;
        guard.retain(|p| p.endpoint_id != endpoint_id);
    }
    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        pending_db::delete_pending_for_endpoint(&db, &endpoint_id).map_err(|e| e.to_string())?;
    }
    broadcast_member_op(&iroh, "member_block", &endpoint_id, Some("high")).await?;
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn team_unblock(
    state: State<'_, DbState>,
    app: AppHandle,
    endpoint_id: String,
) -> Result<(), String> {
    let n = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        if !is_current_user_host(&db) {
            return Err("ブロック解除する権限がありません（HOST のみ）".to_string());
        }
        db.execute(
            "UPDATE members SET status = 'kicked' WHERE endpoint_id = ?1 AND status = 'blocked'",
            [&endpoint_id],
        )
        .map_err(|e| e.to_string())?
    };
    if n == 0 {
        return Err("ブロックされているメンバーが見つかりません".to_string());
    }
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn team_promote_to_co_host(
    state: State<'_, DbState>,
    endpoint_id: String,
) -> Result<(), String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    if !is_current_user_host(&db) {
        return Err("CO-HOST の昇格は HOST のみ可能です".to_string());
    }
    db.execute(
        "UPDATE members SET role = 'co_host' WHERE endpoint_id = ?1 AND status = 'active'",
        [&endpoint_id],
    )
    .map_err(|e| e.to_string())?;
    Ok(())
}

#[tauri::command]
pub async fn team_get_my_role(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<String, String> {
    let my_id = get_my_endpoint_id(&iroh).await;
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let role: Option<String> = db
        .query_row(
            "SELECT role FROM members WHERE lower(endpoint_id) = lower(?1) AND status = 'active'",
            [&my_id],
            |r| r.get(0),
        )
        .ok();
    Ok(role.unwrap_or_else(|| "member".to_string()))
}

#[tauri::command]
pub fn team_am_i_host(state: State<'_, DbState>) -> Result<bool, String> {
    let db = state.0.lock().map_err(|e| e.to_string())?;
    Ok(is_current_user_host(&db))
}

#[tauri::command]
pub async fn team_set_my_display_name(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
    app: AppHandle,
    display_name: String,
) -> Result<(), String> {
    let name = display_name.trim().to_string();
    if name.len() > 64 {
        return Err("表示名は64文字以内で入力してください".to_string());
    }
    let my_id = get_my_endpoint_id(&iroh).await;
    if my_id.is_empty() {
        return Err("ノードIDを取得できません".to_string());
    }
    let n = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.execute(
            "UPDATE members SET display_name = ?1 WHERE endpoint_id = ?2 AND status = 'active'",
            rusqlite::params![&name, &my_id],
        )
        .map_err(|e| e.to_string())?
    };
    if n == 0 {
        return Err("チームに参加していないため、表示名を設定できません".to_string());
    }
    broadcast_member_display_name(&iroh, &my_id, &name).await?;
    let _ = app.emit("team-members-updated", ());
    Ok(())
}

#[tauri::command]
pub async fn team_get_my_display_name(
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<Option<String>, String> {
    let my_id = get_my_endpoint_id(&iroh).await;
    if my_id.is_empty() {
        return Ok(None);
    }
    let db = state.0.lock().map_err(|e| e.to_string())?;
    let name: Option<String> = db
        .query_row(
            "SELECT display_name FROM members WHERE endpoint_id = ?1",
            [&my_id],
            |r| r.get(0),
        )
        .ok()
        .flatten();
    Ok(name)
}
