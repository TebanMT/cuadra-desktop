mod commands;
mod secure_storage;
mod sidecar;

use std::sync::Arc;
use tauri::Manager;

pub struct AppState {
    pub sidecar: Arc<sidecar::SidecarManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    let sidecar_manager = Arc::new(sidecar::SidecarManager::new());

    tauri::Builder::default()
        .plugin(tauri_plugin_shell::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_os::init())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .manage(AppState {
            sidecar: sidecar_manager.clone(),
        })
        .setup(move |app| {
            let handle = app.handle().clone();
            let sm = sidecar_manager.clone();
            tauri::async_runtime::spawn(async move {
                sm.start(handle).await;
            });
            Ok(())
        })
        .on_window_event(move |window, event| {
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                let state: tauri::State<AppState> = window.state();
                let sm = state.sidecar.clone();
                tauri::async_runtime::block_on(async move {
                    sm.shutdown().await;
                });
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::get_sidecar_url,
            commands::get_local_auth_token,
            commands::secure_storage_set,
            commands::secure_storage_get,
            commands::secure_storage_delete,
            commands::print_pdf,
            commands::quit_app,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
