use std::sync::Arc;
use std::sync::Mutex;
use tauri::Manager;
use tokio::sync::RwLock;

mod commands;
mod db;
mod git_util;
mod ntp_util;
mod lang_detect;
mod models;
mod team;
mod watcher;
mod ai;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data dir");
            let conn = db::init_db(&app_data_dir).expect("Failed to initialize database");
            app.manage(db::DbState(Mutex::new(conn)));

            let iroh_state: team::IrohState = Arc::new(RwLock::new(None));
            let iroh_state_clone = iroh_state.clone();
            let pending_joins: commands::team::PendingJoinsState = Arc::new(RwLock::new(Vec::new()));
            app.manage(pending_joins);
            let app_handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                match team::IrohNodeState::init().await {
                    Ok(node) => {
                        let mut guard = iroh_state_clone.write().await;
                        *guard = Some(node);
                        if let Err(e) = commands::team::restore_team_subscriptions(&app_handle).await {
                            eprintln!("restore_team_subscriptions failed: {}", e);
                        }
                    }
                    Err(e) => {
                        eprintln!("iroh init failed (team sync disabled): {}", e);
                    }
                }
            });
            app.manage(iroh_state);

            let _main_window = app.get_webview_window("main").unwrap();

            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
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
            commands::tasks::update_task_status,
            commands::logs::get_activity_logs,
            commands::logs::export_logs_csv,
            commands::ai::save_api_key,
            commands::ai::get_api_key_status,
            commands::ai::delete_api_key,
            commands::ai::analyze_logs,
            commands::settings::get_watched_dirs,
            commands::settings::add_watched_dir,
            commands::settings::remove_watched_dir,
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::team::team_create,
            commands::team::team_issue_invite,
            commands::team::team_join,
            commands::team::team_list_invite_codes,
            commands::team::team_revoke_invite_code,
            commands::team::team_list_pending_joins,
            commands::team::team_approve_join,
            commands::team::team_reject_join,
            commands::team::team_get_sync_mode,
            commands::team::team_set_sync_mode,
            commands::team::team_get_unsynced_count,
            commands::team::team_push_unsynced,
        ])
        .run(tauri::generate_context!())
        .expect("Error while running Tauri application");
}
