//! メンバー関連コマンド（一覧・承認・拒否・キック・ブロック・CO-HOST 昇格）

use crate::db::DbState;
use crate::team::{
    am_i_pending_guest, broadcast_member_display_name, broadcast_member_join, broadcast_member_op,
    can_approve_or_reject, clear_members_if_no_team, get_my_endpoint_id, in_team,
    is_current_user_host, pending_db, upsert_member_joined_active, IrohState,
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
            "SELECT 1 FROM members WHERE endpoint_id = ?1 AND status = 'active'",
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

#[tauri::command]
pub async fn team_list_pending_joins(
    pending_joins: State<'_, PendingJoinsState>,
) -> Result<Vec<PendingJoinInfo>, String> {
    let guard = pending_joins.read().await;
    Ok(guard.clone())
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
        rows.collect::<Result<Vec<_>, _>>().map_err(|e| e.to_string())?
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
            db.execute(
                "DELETE FROM team_subscriptions WHERE is_host = 0",
                [],
            )
            .map_err(|e| e.to_string())?;
            for tid in &guest_topics {
                let _ = pending_db::delete_pending_join(&db, &my_id, tid);
            }
            clear_members_if_no_team(&db).map_err(|e| e.to_string())?;
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
        guard.retain(|p| !(p.endpoint_id == endpoint_id && p.topic_id == topic_id));
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
        guard.retain(|p| !(p.endpoint_id == endpoint_id && p.topic_id == topic_id));
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
            "SELECT role FROM members WHERE endpoint_id = ?1 AND status = 'active'",
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
