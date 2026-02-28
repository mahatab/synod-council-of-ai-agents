mod commands;
mod models;
mod providers;

use commands::{api_calls, keychain, sessions, settings};

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(keychain::ApiKeyCache::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            keychain::save_api_key,
            keychain::get_api_key,
            keychain::delete_api_key,
            keychain::has_api_key,
            api_calls::stream_chat,
            sessions::save_session,
            sessions::load_session,
            sessions::list_sessions,
            sessions::delete_session,
            sessions::get_default_sessions_path,
            settings::load_settings,
            settings::save_settings,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
