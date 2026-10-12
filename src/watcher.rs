use notify::{RecommendedWatcher, RecursiveMode, Watcher, Event};
use once_cell::sync::Lazy;
use std::path::PathBuf;
use std::sync::Mutex;
use tauri::{AppHandle, Emitter};

static WATCHER: Lazy<Mutex<Option<RecommendedWatcher>>> = Lazy::new(|| Mutex::new(None));

fn lock_watcher() -> Result<std::sync::MutexGuard<'static, Option<RecommendedWatcher>>, String> {
    WATCHER
        .lock()
        .map_err(|_| "watcher state poisoned by an earlier panic".to_string())
}

#[tauri::command]
pub fn start_watching(app: AppHandle, path: String) -> Result<(), String> {
    let mut guard = lock_watcher()?;

    // Stop existing watcher if any.
    *guard = None;

    let app_clone = app.clone();
    let mut watcher = notify::recommended_watcher(move |res: Result<Event, notify::Error>| {
        if let Ok(event) = res {
            let _ = app_clone.emit(
                "fs-change",
                event
                    .paths
                    .iter()
                    .map(|p| p.to_string_lossy().to_string())
                    .collect::<Vec<_>>(),
            );
        }
    })
    .map_err(|e| format!("Watcher init: {e}"))?;

    watcher
        .watch(PathBuf::from(&path).as_path(), RecursiveMode::Recursive)
        .map_err(|e| format!("Watch: {e}"))?;

    *guard = Some(watcher);
    Ok(())
}

#[tauri::command]
pub fn stop_watching() -> Result<(), String> {
    let mut guard = lock_watcher()?;
    *guard = None;
    Ok(())
}