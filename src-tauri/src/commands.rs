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

// print_pdf — impresión real (antes: stub que devolvía Ok y el FE cantaba
// "Enviado a la impresora" sin imprimir nada). Escribe el PDF a un temp y
// usa el verbo Print de la asociación de PDF del sistema; si la asociación
// no expone ese verbo (típico: Edge como visor default, sin Acrobat — el
// caso normal en las PCs de los gyms), cae a ABRIR el visor por defecto.
// Devuelve "printed" | "opened" para que el FE ponga el copy honesto
// ("imprime desde el visor") en vez de un éxito falso.
#[tauri::command]
pub async fn print_pdf(bytes: Vec<u8>) -> Result<String, String> {
    let stamp = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_millis())
        .unwrap_or(0);
    let path = std::env::temp_dir().join(format!("tinta-comprobante-{stamp}.pdf"));
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    // Procesos del shell bloqueantes — fuera del hilo principal para no
    // congelar el webview.
    tauri::async_runtime::spawn_blocking(move || print_or_open(&path))
        .await
        .map_err(|e| e.to_string())?
}

#[cfg(target_os = "windows")]
fn print_or_open(path: &std::path::Path) -> Result<String, String> {
    use std::os::windows::process::CommandExt;
    // Sin esto, powershell/cmd parpadean una consola frente al operador.
    const CREATE_NO_WINDOW: u32 = 0x0800_0000;
    let p = path.display().to_string();
    // $ErrorActionPreference='Stop' vuelve terminante el "verbo no
    // soportado" → exit code 1 → caemos al open. Comillas simples de PS se
    // escapan duplicándolas (el temp path no trae, pero por si acaso).
    let script = format!(
        "$ErrorActionPreference='Stop'; Start-Process -FilePath '{}' -Verb Print",
        p.replace('\'', "''")
    );
    let printed = std::process::Command::new("powershell")
        .args(["-NoProfile", "-NonInteractive", "-Command", &script])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if printed {
        return Ok("printed".into());
    }
    let opened = std::process::Command::new("cmd")
        .args(["/C", "start", "", &p])
        .creation_flags(CREATE_NO_WINDOW)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if opened {
        Ok("opened".into())
    } else {
        Err("no se pudo imprimir ni abrir el comprobante".into())
    }
}

#[cfg(target_os = "macos")]
fn print_or_open(path: &std::path::Path) -> Result<String, String> {
    // lp manda a la impresora default de CUPS; sin impresora configurada
    // falla y abrimos Preview (máquina de dev — suficiente).
    let printed = std::process::Command::new("lp")
        .arg(path)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if printed {
        return Ok("printed".into());
    }
    let opened = std::process::Command::new("open")
        .arg(path)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if opened {
        Ok("opened".into())
    } else {
        Err("no se pudo imprimir ni abrir el comprobante".into())
    }
}

#[cfg(all(not(target_os = "windows"), not(target_os = "macos")))]
fn print_or_open(path: &std::path::Path) -> Result<String, String> {
    let opened = std::process::Command::new("xdg-open")
        .arg(path)
        .status()
        .map(|s| s.success())
        .unwrap_or(false);
    if opened {
        Ok("opened".into())
    } else {
        Err("no se pudo abrir el comprobante".into())
    }
}

// save_file — guardar con diálogo nativo. `<a download>` con blob: es un
// no-op dentro de WebView2 (Tauri no cablea el download handler de wry),
// así que "Descargar" mostraba éxito sin escribir NADA a disco. El FE nos
// pasa los bytes; acá va el diálogo + write. Devuelve la ruta elegida, o
// None si el operador canceló (el FE no toastea nada en ese caso).
#[tauri::command]
pub async fn save_file(
    app: AppHandle,
    bytes: Vec<u8>,
    suggested_name: String,
) -> Result<Option<String>, String> {
    use tauri_plugin_dialog::DialogExt;
    let ext = std::path::Path::new(&suggested_name)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();
    // blocking_save_file no debe correr en el hilo principal (deadlock
    // documentado del plugin) — spawn_blocking igual que print_pdf.
    let picked = tauri::async_runtime::spawn_blocking(move || {
        let mut dlg = app.dialog().file().set_file_name(&suggested_name);
        if !ext.is_empty() {
            let exts = [ext.as_str()];
            dlg = dlg.add_filter(ext.to_uppercase(), &exts);
        }
        dlg.blocking_save_file()
    })
    .await
    .map_err(|e| e.to_string())?;
    let Some(file_path) = picked else {
        return Ok(None);
    };
    let path = file_path.into_path().map_err(|e| e.to_string())?;
    std::fs::write(&path, &bytes).map_err(|e| e.to_string())?;
    Ok(Some(path.display().to_string()))
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
