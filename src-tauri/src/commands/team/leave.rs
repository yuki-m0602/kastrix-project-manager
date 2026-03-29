//! チーム退出コマンド（team_leave）

use crate::db::DbState;
use crate::team::{
    broadcast_permission_change, broadcast_team_disband, clear_members_if_no_team,
    get_my_endpoint_id, is_current_user_host, pending_db, IrohState,
};
use tauri::{AppHandle, Emitter, State};

/// チームを退出（ホストの場合は移譲または解散してから退出）
#[tauri::command]
pub async fn team_leave(
    app: AppHandle,
    state: State<'_, DbState>,
    iroh: State<'_, IrohState>,
) -> Result<(), String> {
    let topic_id: Option<String> = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.query_row("SELECT topic_id FROM team_subscriptions LIMIT 1", [], |r| {
            r.get(0)
        })
        .ok()
    };
    let topic_id = topic_id.ok_or_else(|| "参加中のチームがありません".to_string())?;
    let my_id = get_my_endpoint_id(&iroh).await;
    if my_id.is_empty() {
        return Err("ノードIDを取得できません".to_string());
    }

    let is_host = {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        is_current_user_host(&db)
    };

    if is_host {
        let (oldest_co, has_co_host) = {
            let db = state.0.lock().map_err(|e| e.to_string())?;
            let co: Option<String> = db
                .query_row(
                    "SELECT endpoint_id FROM members WHERE role = 'co_host' AND status = 'active' ORDER BY joined_at ASC LIMIT 1",
                    [],
                    |r| r.get(0),
                )
                .ok();
            (co.clone(), co.is_some())
        };

        if has_co_host {
            let new_host = oldest_co.unwrap();
            let _ = broadcast_permission_change(&iroh, &my_id, &new_host).await;
        } else {
            let _ = broadcast_team_disband(&iroh).await;
        }

        tokio::time::sleep(std::time::Duration::from_secs(2)).await;
    }

    {
        let guard = iroh.read().await;
        if let Some(node) = guard.as_ref() {
            node.unsubscribe(&topic_id).await;
        }
    }

    {
        let db = state.0.lock().map_err(|e| e.to_string())?;
        db.execute(
            "DELETE FROM team_subscriptions WHERE topic_id = ?1",
            [&topic_id],
        )
        .map_err(|e| e.to_string())?;
        pending_db::delete_pending_for_topic(&db, &topic_id).map_err(|e| e.to_string())?;
        db.execute("DELETE FROM members WHERE endpoint_id = ?1", [&my_id])
            .map_err(|e| e.to_string())?;
        clear_members_if_no_team(&db).map_err(|e| e.to_string())?;
    }

    let _ = app.emit("team-left", ());
    Ok(())
}
