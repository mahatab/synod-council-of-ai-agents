mod commands;

use commands::{api_calls, keychain, sessions, settings, telegram};
use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .manage(council_core::keychain::ApiKeyCache::default())
        .manage(telegram::TelegramBotState::default())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .plugin(tauri_plugin_opener::init())
        .setup(|app| {
            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }

            // Auto-start Telegram bot if enabled in settings
            let app_settings = council_core::settings::load_settings().unwrap_or_default();
            if app_settings.telegram_enabled {
                let cache = council_core::keychain::ApiKeyCache::default();
                let service = "com.council-of-ai-agents.telegram-bot-token";
                if let Ok(Some(token)) = council_core::keychain::get_api_key(&cache, service) {
                    let state = app.state::<telegram::TelegramBotState>();
                    let handle = state.inner().clone_handle();
                    tauri::async_runtime::spawn(async move {
                        let (shutdown_tx, shutdown_rx) = tokio::sync::oneshot::channel();
                        let task = tauri::async_runtime::spawn(async move {
                            if let Err(e) =
                                council_telegram_bot::start_bot(token, shutdown_rx).await
                            {
                                log::error!("Telegram bot auto-start error: {}", e);
                            }
                        });
                        let mut guard = handle.lock().await;
                        *guard = Some(telegram::BotHandleInner {
                            shutdown_tx: Some(shutdown_tx),
                            task,
                        });
                    });
                    log::info!("Telegram bot auto-started");
                }
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
            telegram::start_telegram_bot,
            telegram::stop_telegram_bot,
            telegram::get_telegram_status,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
