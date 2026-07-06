mod boot_guard;
mod commands;
mod secure_storage;
mod sidecar;

use std::sync::Arc;
use tauri::{Manager, RunEvent};

pub struct AppState {
    pub sidecar: Arc<sidecar::SidecarManager>,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    env_logger::init();

    // Boot guard: incrementamos el counter persistente ANTES de cualquier
    // operación que pueda crashear. Si el counter venía >= 2, intentamos
    // rollback al installer previo y salimos para no competir con
    // msiexec. Sólo en Windows tiene efecto real; macOS dev sigue.
    let current_version = env!("CARGO_PKG_VERSION");
    match boot_guard::inspect_and_increment() {
        boot_guard::BootDecision::Normal { count } => {
            log::info!("boot_guard: boot #{count} en v{current_version}");
        }
        boot_guard::BootDecision::NeedsRollback { count } => {
            // Mejor-esfuerzo. Si la invocación falla, igual seguimos —
            // pinta al operador un banner via FE más adelante.
            match boot_guard::rollback(current_version, count) {
                Ok(true) => {
                    log::warn!("boot_guard: rollback lanzado, saliendo del proceso actual");
                    std::process::exit(0);
                }
                Ok(false) => {
                    log::error!(
                        "boot_guard: sin backup disponible para rollback — la app sigue arrancando degradada"
                    );
                }
                Err(e) => {
                    log::error!("boot_guard: rollback falló: {e}");
                }
            }
        }
    }

    let sidecar_manager = Arc::new(sidecar::SidecarManager::new());
    let sidecar_for_event = sidecar_manager.clone();

    let app = tauri::Builder::default()
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
            // Arma el reset del boot-fail counter: si el binario sigue
            // vivo 30s después del arranque, lo consideramos boot
            // exitoso y bajamos el counter a 0. Si crashea antes, el
            // counter queda en alto y el próximo arranque lo verá.
            tauri::async_runtime::spawn(async move {
                boot_guard::arm_reset_timer().await;
            });
            Ok(())
        })
        .on_window_event(move |window, event| {
            // Window-X click → graceful shutdown of the sidecar so it
            // releases port 9090 before the next launch. Only la main
            // dispara este shutdown: la kiosk vive en su propia
            // WebviewWindow y cerrarla NO debe matar al sidecar (la
            // recepción sigue cobrando). Al cerrar la main, además,
            // arrastramos a la kiosk para no dejar proceso huérfano.
            if let tauri::WindowEvent::CloseRequested { .. } = event {
                if window.label() != "main" {
                    return;
                }
                if let Some(kiosk) = window.app_handle().get_webview_window("kiosk") {
                    let _ = kiosk.close();
                }
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
            commands::save_file,
            commands::quit_app,
            commands::shutdown_sidecar,
            commands::read_auto_rollback_marker,
            commands::clear_auto_rollback_marker,
        ])
        .build(tauri::generate_context!())
        .expect("error while running tauri application");

    // RunEvent::Exit fires on Cmd+Q (macOS), Alt+F4, app menu Quit, and
    // any other "app is going down" signal that does NOT necessarily
    // route through window CloseRequested. Without this the sidecar
    // gets orphaned on Cmd+Q — reparented to launchd holding port 9090
    // until reboot — and the next launch can't bind. Belt+suspenders
    // with the parent-PID watcher in the Go sidecar (the watcher is the
    // safety net for crash/SIGKILL cases this handler can't catch).
    app.run(move |_app_handle, event| {
        if let RunEvent::Exit = event {
            tauri::async_runtime::block_on(async {
                sidecar_for_event.shutdown().await;
            });
        }
    });
}
