use std::sync::Arc;
use std::sync::Mutex;
use tauri::Emitter;
use tauri::Manager;
use tokio::sync::RwLock;

mod ai;
mod commands;
mod db;
mod git_util;
mod lang_detect;
mod models;
mod ntp_util;
mod team;
mod watcher;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app.path().app_data_dir().map_err(|e| {
                std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to get app data dir: {}", e),
                )
            })?;
            let conn = db::init_db(&app_data_dir).map_err(|e| {
                std::io::Error::new(
                    std::io::ErrorKind::Other,
                    format!("Failed to initialize database: {}", e),
                )
            })?;
            app.manage(db::DbState(Mutex::new(conn)));

            let iroh_state: team::IrohState = Arc::new(RwLock::new(None));
            let iroh_state_clone = iroh_state.clone();
            let pending_joins: commands::team::PendingJoinsState =
                Arc::new(RwLock::new(Vec::new()));
            app.manage(pending_joins);
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let app_data_dir = app_handle
                    .path()
                    .app_data_dir()
                    .expect("Failed to get app data dir");
                match team::IrohNodeState::init(&app_data_dir).await {
                    Ok(node) => {
                        {
                            let mut guard = iroh_state_clone.write().await;
                            *guard = Some(node);
                        }
                        if let Err(e) =
                            commands::team::invite::restore_team_subscriptions(&app_handle).await
                        {
                            eprintln!("restore_team_subscriptions failed: {}", e);
                        }
                        let _ = app_handle.emit("team-iroh-ready", true);
                    }
                    Err(e) => {
                        eprintln!("iroh init failed (team sync disabled): {}", e);
                        let _ = app_handle.emit("team-iroh-ready", false);
                    }
                }
            });
            app.manage(iroh_state);

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::team::team_is_ready,
            commands::team::team_debug_status,
            commands::team::team_get_endpoint_id,
            commands::team::team_get_current_room,
            commands::projects::scan_directory,
            commands::projects::get_projects,
            commands::projects::get_project,
            commands::projects::get_readme,
            commands::projects::open_in_ide,
            commands::projects::scan_all_watched_dirs,
            commands::projects::remove_project,
            commands::tasks::get_tasks,
            commands::tasks::create_task,
            commands::tasks::update_task,
            commands::tasks::delete_task,
            commands::tasks::task_can_delete,
            commands::tasks::update_task_status,
            commands::logs::get_activity_logs,
            commands::logs::export_logs_csv,
            commands::ai::save_api_key,
            commands::ai::get_api_key_status,
            commands::ai::delete_api_key,
            commands::ai::list_ai_models,
            commands::ai::list_ai_models_extended,
            commands::ai::analyze_logs,
            commands::ai::ai_create_chat,
            commands::ai::ai_list_chats,
            commands::ai::ai_get_chat_messages,
            commands::ai::ai_add_chat_message,
            commands::ai::ai_delete_chat,
            commands::settings::get_watched_dirs,
            commands::settings::add_watched_dir,
            commands::settings::remove_watched_dir,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::team::invite::team_create,
            commands::team::invite::team_issue_invite,
            commands::team::invite::team_join,
            commands::team::invite::team_list_invite_codes,
            commands::team::invite::team_revoke_invite_code,
            commands::team::members::team_list_pending_joins,
            commands::team::members::team_am_i_pending,
            commands::team::members::team_cancel_join,
            commands::team::members::team_approve_join,
            commands::team::members::team_reject_join,
            commands::team::members::team_kick,
            commands::team::members::team_block,
            commands::team::members::team_unblock,
            commands::team::team_get_sync_mode,
            commands::team::team_set_sync_mode,
            commands::team::team_get_unsynced_count,
            commands::team::team_push_unsynced,
            commands::team::members::team_promote_to_co_host,
            commands::team::members::team_list_members,
            commands::team::members::team_list_blocked,
            commands::team::members::team_get_my_role,
            commands::team::members::team_am_i_host,
            commands::team::members::team_set_my_display_name,
            commands::team::members::team_get_my_display_name,
            commands::team::team_resolve_conflict,
            commands::team::leave::team_leave,
            commands::team::update_name::team_update_name,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}
