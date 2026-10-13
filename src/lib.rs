//! Tengwar — library crate.
//!
//! The Tauri application is exposed as a single `run()` function so
//! that:
//!   - `main.rs` is a 3-line binary that just calls `tengwar::run()`
//!   - integration tests (`tests/*.rs`) and examples can use every
//!     public module without needing to launch the GUI
//!   - doc-tests on public items run automatically via `cargo test`

pub mod diagram;
pub mod export;
pub mod fs_ops;
pub mod git;
pub mod link_graph;
pub mod markdown;
pub mod search;
pub mod state;
pub mod vim;
pub mod watcher;

use std::sync::Mutex;
use state::AppState;

/// Entry point for the Tengwar desktop app. Wires up the Tauri builder
/// and blocks on the event loop until the user closes the window.
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_opener::init())
        .manage(AppState {
            vim: Mutex::new(vim::VimState::new()),
        })
        .setup(|_app| {
            #[cfg(debug_assertions)]
            {
                use tauri::Manager;
                if let Some(window) = _app.get_webview_window("main") {
                    window.open_devtools();
                }
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            vim::vim_handle_key,
            vim::vim_set_text,
            vim::vim_load_text,
            vim::vim_mark_saved,
            vim::vim_get_text,
            vim::vim_execute_command,
            vim::vim_go_to_line,
            vim::vim_snapshot,
            markdown::render_markdown,
            diagram::render_diagram,
            fs_ops::set_workspace_root,
            fs_ops::read_text_file,
            fs_ops::write_text_file,
            fs_ops::delete_path,
            fs_ops::rename_path,
            fs_ops::create_dir,
            fs_ops::list_dir,
            fs_ops::image_to_data_url,
            fs_ops::search_in_files,
            export::export_html,
            git::git_init,
            git::git_status,
            git::git_stage_all,
            git::git_commit,
            git::git_clone,
            git::git_fetch,
            git::git_pull,
            git::git_push,
            git::git_list_branches,
            git::git_checkout,
            git::git_set_remote,
            git::git_current_branch,
            git::git_remotes,
            git::git_diff,
            git::git_diff_stats,
            git::git_diff_last,
            search::fuzzy_find,
            watcher::start_watching,
            watcher::stop_watching,
            link_graph::build_link_graph,
        ])
        .run(tauri::generate_context!())
        .expect("Failed to start application");
}