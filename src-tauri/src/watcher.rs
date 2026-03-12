use notify::{Config, EventKind, RecommendedWatcher, RecursiveMode, Watcher};
use std::path::Path;
use std::sync::mpsc;
use tauri::{AppHandle, Emitter};

#[allow(dead_code)]
pub fn start_watcher(app: AppHandle, watch_path: &Path) -> Option<RecommendedWatcher> {
    let (tx, rx) = mpsc::channel();

    let mut watcher = RecommendedWatcher::new(tx, Config::default()).ok()?;
    watcher.watch(watch_path, RecursiveMode::Recursive).ok()?;

    let app_handle = app.clone();
    std::thread::spawn(move || {
        while let Ok(event_result) = rx.recv() {
            if let Ok(event) = event_result {
                match event.kind {
                    EventKind::Create(_) | EventKind::Remove(_) | EventKind::Modify(_) => {
                        let _ = app_handle.emit("project-changed", ());
                    }
                    _ => {}
                }
            }
        }
    });

    Some(watcher)
}
