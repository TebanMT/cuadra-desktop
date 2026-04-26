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

#[tauri::command]
pub fn secure_storage_set(key: String, value: String) -> Result<(), String> {
    secure_storage::set(&key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secure_storage_get(key: String) -> Result<Option<String>, String> {
    secure_storage::get(&key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn secure_storage_delete(key: String) -> Result<(), String> {
    secure_storage::delete(&key).map_err(|e| e.to_string())
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
