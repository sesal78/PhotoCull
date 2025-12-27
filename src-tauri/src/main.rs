#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

use photocull::commands::{
    self, AppState,
};
use tracing_subscriber::{fmt, EnvFilter};

fn main() {
    let filter = EnvFilter::try_from_env("PHOTOCULL_LOG_LEVEL")
        .unwrap_or_else(|_| EnvFilter::new("info"));

    fmt()
        .with_env_filter(filter)
        .with_target(true)
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .manage(AppState::default())
        .invoke_handler(tauri::generate_handler![
            commands::open_folder,
            commands::get_thumbnail,
            commands::get_preview,
            commands::save_edits,
            commands::set_rating,
            commands::set_flag,
            commands::export_images,
            commands::ai_analyze,
            commands::ai_auto_enhance,
            commands::init_ai,
        ])
        .setup(|_app| {
            let _ = commands::init_ai();
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
