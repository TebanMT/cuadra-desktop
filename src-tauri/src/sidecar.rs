use std::collections::VecDeque;
use std::fs;
use std::path::PathBuf;
use std::sync::Arc;
use std::time::{Duration, Instant};

use tauri::{AppHandle, Emitter};
use tauri_plugin_shell::process::{CommandChild, CommandEvent};
use tauri_plugin_shell::ShellExt;
use tokio::sync::Mutex;
use uuid::Uuid;

use crate::secure_storage::APP_DIR_NAME;

// Sin prefix `binaries/` a propósito. Tauri 2 aplana las subcarpetas al
// bundlear external bins en macOS (las copia directo a Contents/MacOS/),
// pero al llamar a `shell.sidecar()` el lookup conserva el path con
// subdir → posix_spawn busca Contents/MacOS/binaries/tinta-sidecar y
// falla con ENOENT. Manteniéndolo plano evitamos el mismatch.
const SIDECAR_BIN: &str = "tinta-sidecar";
const MAX_RESTARTS: usize = 3;
const RESTART_WINDOW: Duration = Duration::from_secs(60);
const SHUTDOWN_GRACE: Duration = Duration::from_secs(5);

#[derive(Clone, Default, serde::Serialize)]
pub struct SidecarStatus {
    pub url: Option<String>,
    pub local_token: String,
    pub running: bool,
}

struct Inner {
    child: Option<CommandChild>,
    url: Option<String>,
    local_token: String,
    restart_history: VecDeque<Instant>,
    failed: bool,
    shutting_down: bool,
}

pub struct SidecarManager {
    inner: Arc<Mutex<Inner>>,
}

impl SidecarManager {
    pub fn new() -> Self {
        Self {
            inner: Arc::new(Mutex::new(Inner {
                child: None,
                url: None,
                local_token: Uuid::new_v4().to_string(),
                restart_history: VecDeque::new(),
                failed: false,
                shutting_down: false,
            })),
        }
    }

    pub async fn url(&self) -> Option<String> {
        self.inner.lock().await.url.clone()
    }

    pub async fn local_token(&self) -> String {
        self.inner.lock().await.local_token.clone()
    }

    pub async fn start(&self, app: AppHandle) {
        kill_stale_sidecars();
        loop {
            let should_continue = self.spawn_once(&app).await;
            if !should_continue {
                break;
            }
        }
    }

    async fn spawn_once(&self, app: &AppHandle) -> bool {
        let shell = app.shell();
        let cmd = match shell.sidecar(SIDECAR_BIN) {
            Ok(c) => c,
            Err(e) => {
                log::error!("sidecar binary not found ({SIDECAR_BIN}): {e}");
                self.mark_failed(app).await;
                return false;
            }
        };

        // Resuelve los paths persistentes del sidecar (SQLite + cache
        // de fotos) al app-data dir per-OS. Sin esto el sidecar cae
        // a ./tmp/ relativo al cwd, que en macOS empaquetado es `/`
        // → /tmp, donde el OS borra archivos en reboot. Catastrófico
        // para tinta.db (perderías toda la operación local) e
        // incómodo para uploads/ (re-download desde R2 en cada boot).
        let cmd = match app_data_paths() {
            Ok(paths) => cmd
                .env("SIDECAR_DB_PATH", &paths.db_path)
                .env("UPLOADS_DIR", &paths.uploads_dir),
            Err(e) => {
                log::warn!("could not resolve app data dir, sidecar will use defaults: {e}");
                cmd
            }
        };

        let (mut rx, child) = match cmd.spawn() {
            Ok(pair) => pair,
            Err(e) => {
                log::error!("failed to spawn sidecar: {e}");
                if !self.record_restart().await {
                    self.mark_failed(app).await;
                    return false;
                }
                tokio::time::sleep(Duration::from_secs(1)).await;
                return true;
            }
        };

        {
            let mut inner = self.inner.lock().await;
            inner.child = Some(child);
            inner.url = None;
        }

        log::info!("sidecar spawned");

        while let Some(event) = rx.recv().await {
            match event {
                CommandEvent::Stdout(bytes) => {
                    let line = String::from_utf8_lossy(&bytes).trim().to_string();
                    log::info!("[sidecar] {line}");
                    if let Some(rest) = line.strip_prefix("LISTENING_ON=") {
                        let url = format!("http://127.0.0.1:{}", rest.trim());
                        let mut inner = self.inner.lock().await;
                        inner.url = Some(url.clone());
                        let _ = app.emit("sidecar_ready", &url);
                    }
                }
                CommandEvent::Stderr(bytes) => {
                    log::warn!("[sidecar:err] {}", String::from_utf8_lossy(&bytes).trim());
                }
                CommandEvent::Terminated(payload) => {
                    log::warn!("sidecar terminated: code={:?}", payload.code);
                    let mut inner = self.inner.lock().await;
                    inner.child = None;
                    inner.url = None;
                    if inner.shutting_down {
                        return false;
                    }
                    drop(inner);
                    if !self.record_restart().await {
                        self.mark_failed(app).await;
                        return false;
                    }
                    let _ = app.emit("sidecar_restarting", ());
                    tokio::time::sleep(Duration::from_millis(500)).await;
                    return true;
                }
                CommandEvent::Error(e) => {
                    log::error!("sidecar pipe error: {e}");
                }
                _ => {}
            }
        }
        false
    }

    async fn record_restart(&self) -> bool {
        let mut inner = self.inner.lock().await;
        let now = Instant::now();
        while let Some(front) = inner.restart_history.front() {
            if now.duration_since(*front) > RESTART_WINDOW {
                inner.restart_history.pop_front();
            } else {
                break;
            }
        }
        if inner.restart_history.len() >= MAX_RESTARTS {
            return false;
        }
        inner.restart_history.push_back(now);
        true
    }

    async fn mark_failed(&self, app: &AppHandle) {
        let mut inner = self.inner.lock().await;
        inner.failed = true;
        let _ = app.emit("sidecar_failed", ());
    }

    pub async fn shutdown(&self) {
        let child = {
            let mut inner = self.inner.lock().await;
            inner.shutting_down = true;
            inner.child.take()
        };
        if let Some(child) = child {
            let pid = child.pid();
            log::info!("sending shutdown to sidecar pid={pid}");
            let _ = child.kill();
            tokio::time::sleep(SHUTDOWN_GRACE).await;
        }
    }
}

// Mata sidecars huérfanos de sesiones anteriores ANTES del primer spawn.
// Origen típico: el updater de Tauri termina la app con process::exit —
// RunEvent::Exit nunca corre, el shutdown() no se ejecuta — o un crash
// duro del desktop. Un huérfano retiene el puerto 9090: el hijo nuevo
// muere al bindear, el manager agota MAX_RESTARTS y el FE queda clavado
// en "sidecar not ready" hasta un reboot. Matar por nombre de imagen
// asume UNA instancia de Tinta por máquina — supuesto que el puerto
// fijo ya impone de todos modos.
fn kill_stale_sidecars() {
    #[cfg(windows)]
    {
        use std::os::windows::process::CommandExt;
        // CREATE_NO_WINDOW: sin flash de consola al correr taskkill.
        const CREATE_NO_WINDOW: u32 = 0x0800_0000;
        match std::process::Command::new("taskkill")
            .args(["/F", "/IM", "tinta-sidecar.exe"])
            .creation_flags(CREATE_NO_WINDOW)
            .output()
        {
            Ok(o) if o.status.success() => {
                log::warn!("killed stale tinta-sidecar.exe orphan(s) from a previous session");
            }
            // taskkill sale no-cero cuando el proceso no existe — el caso
            // normal y silencioso. Errores de lanzamiento sí se loggean.
            Ok(_) => {}
            Err(e) => log::warn!("could not run taskkill for stale sidecars: {e}"),
        }
    }
    #[cfg(not(windows))]
    {
        // -x: match exacto del nombre de proceso (no queremos matar, p.ej.,
        // un editor con "tinta-sidecar" en sus argumentos).
        match std::process::Command::new("pkill")
            .args(["-x", "tinta-sidecar"])
            .output()
        {
            Ok(o) if o.status.success() => {
                log::warn!("killed stale tinta-sidecar orphan(s) from a previous session");
            }
            Ok(_) => {}
            Err(e) => log::warn!("could not run pkill for stale sidecars: {e}"),
        }
    }
}

struct AppDataPaths {
    db_path: PathBuf,
    uploads_dir: PathBuf,
}

// app_data_paths resuelve el directorio app-data per-OS y devuelve los
// paths que el sidecar Go espera por env var. Crea el directorio si
// no existe. Comparte el constante APP_DIR_NAME con secure_storage
// para que todo el estado del desktop viva bajo el mismo paraguas.
fn app_data_paths() -> Result<AppDataPaths, String> {
    let root = dirs::data_dir().ok_or_else(|| "no platform data dir".to_string())?;
    let app_dir = root.join(APP_DIR_NAME);
    let uploads_dir = app_dir.join("uploads");
    // mkdir -p sobre uploads (que es nieto de root) — crea también
    // el app_dir si no existe. Errores se propagan al caller que
    // decide caer al default del sidecar.
    fs::create_dir_all(&uploads_dir).map_err(|e| format!("mkdir uploads: {e}"))?;
    let db_path = app_dir.join("tinta.db");
    Ok(AppDataPaths {
        db_path,
        uploads_dir,
    })
}
