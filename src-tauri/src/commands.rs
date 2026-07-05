use crate::boot_guard;
use crate::secure_storage;
use crate::AppState;
use tauri::{AppHandle, Manager, State};

#[tauri::command]
pub async fn get_sidecar_url(state: State<'_, AppState>) -> Result<String, String> {
    state
        .sidecar
        .url()
        .await
        .ok_or_else(|| "sidecar not ready".to_string())
}

#[tauri::command]
pub async fn get_local_auth_token(state: State<'_, AppState>) -> Result<String, String> {
    Ok(state.sidecar.local_token().await)
}

// secure_storage_* commands log every call so support tickets can be
// diagnosed without DevTools. We only log keys (which are well-known
// constants like "user_access_token") and lengths/presence of values
// — never the actual JWT/refresh-token contents. If keyring fails
// (sandbox issues, missing entitlements on ad-hoc signed builds),
// the error is logged AND propagated to the JS layer so frontend can
// show a proper error instead of looking like a silent success.
#[tauri::command]
pub fn secure_storage_set(key: String, value: String) -> Result<(), String> {
    let value_len = value.len();
    match secure_storage::set(&key, &value) {
        Ok(()) => {
            log::info!("secure_storage_set ok key={key} len={value_len}");
            Ok(())
        }
        Err(e) => {
            log::error!("secure_storage_set FAILED key={key} len={value_len}: {e}");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn secure_storage_get(key: String) -> Result<Option<String>, String> {
    match secure_storage::get(&key) {
        Ok(Some(v)) => {
            log::info!("secure_storage_get hit key={key} len={}", v.len());
            Ok(Some(v))
        }
        Ok(None) => {
            log::warn!("secure_storage_get miss key={key}");
            Ok(None)
        }
        Err(e) => {
            log::error!("secure_storage_get FAILED key={key}: {e}");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn secure_storage_delete(key: String) -> Result<(), String> {
    match secure_storage::delete(&key) {
        Ok(()) => {
            log::info!("secure_storage_delete ok key={key}");
            Ok(())
        }
        Err(e) => {
            log::error!("secure_storage_delete FAILED key={key}: {e}");
            Err(e.to_string())
        }
    }
}

#[tauri::command]
pub fn print_pdf(_bytes: Vec<u8>) -> Result<(), String> {
    log::info!("print_pdf invoked ({} bytes) — stub, not yet wired to OS printer", _bytes.len());
    Ok(())
}

#[tauri::command]
pub fn quit_app(app: AppHandle) {
    app.exit(0);
}

// El updater de Tauri (Windows/NSIS) termina el proceso con
// std::process::exit al aplicar el update — RunEvent::Exit nunca corre,
// el sidecar queda huérfano y bloquea tinta-sidecar.exe justo cuando el
// instalador intenta sobreescribirlo ("error opening file for writing").
// El FE lo invoca entre download() e install() para soltar el binario y
// el puerto ANTES de lanzar el NSIS. El hook PREINSTALL del instalador
// es la red para los huérfanos que este camino limpio no cubre (crash
// de la app, updates desde versiones sin este comando).
#[tauri::command]
pub async fn shutdown_sidecar(state: State<'_, AppState>) -> Result<(), String> {
    state.sidecar.shutdown().await;
    Ok(())
}

// Lee el marker de auto-rollback (ADR-005 §2.5). El FE lo consulta al
// boot para mostrar un banner si la corrida anterior crasheó dos veces y
// disparamos rollback. Sin marker → None.
#[tauri::command]
pub fn read_auto_rollback_marker() -> Option<boot_guard::RollbackMarker> {
    boot_guard::read_marker()
}

#[tauri::command]
pub fn clear_auto_rollback_marker() {
    boot_guard::clear_marker();
}
