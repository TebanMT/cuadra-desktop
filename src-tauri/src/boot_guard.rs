// Boot guard / auto-rollback (ADR-005 §2.5).
//
// El operador objetivo es no-técnico. Si una actualización rompe el boot
// del binario en su laptop, NADIE va a reinstalar manualmente — el gym
// queda muerto. La política del ADR es:
//
//   1. Al arrancar, incrementamos un counter persistente.
//   2. Si el binario sobrevivió 30s, reseteamos el counter a 0 (= boot
//      exitoso).
//   3. Si al arrancar el counter ya estaba en 2 o más, asumimos que las
//      2 corridas previas crashearon antes del reset → invocamos
//      rollback: reportamos telemetry y, si tenemos un backup del MSI
//      previo en disco, lanzamos `msiexec /i` con él y salimos.
//
// LIMITACIÓN conocida: la "vuelta atrás" depende de que exista un
// installer previo en backups. Si no existe (primera versión instalada,
// o el directorio fue borrado), reportamos telemetry y dejamos el banner
// visible — el operador escala a soporte. El plugin updater 2.x NO
// guarda el binario previo por sí solo; usamos `backup_installer_path()`
// para que la capa JS copie el MSI a backups ANTES de invocar
// `downloadAndInstall()`.

use std::fs;
use std::path::PathBuf;

use crate::secure_storage::APP_DIR_NAME;

const COUNTER_FILE: &str = "boot-fail-count";
const BACKUPS_SUBDIR: &str = "backups";
const ROLLBACK_MARKER_FILE: &str = "auto-rollback-marker.json";
const ROLLBACK_THRESHOLD: u32 = 2;
const BOOT_OK_AFTER_SECS: u64 = 30;

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("could not resolve app data directory")]
    NoDataDir,
    #[error("io: {0}")]
    Io(#[from] std::io::Error),
    #[error("parse: {0}")]
    Parse(#[from] std::num::ParseIntError),
}

/// Devuelve `<data_dir>/<APP_DIR_NAME>`. Crea el dir si no existía. Igual
/// que en secure_storage.rs — los dos viven bajo el mismo paraguas.
fn app_data_dir() -> Result<PathBuf, Error> {
    let root = dirs::data_dir().ok_or(Error::NoDataDir)?;
    let dir = root.join(APP_DIR_NAME);
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

fn counter_path() -> Result<PathBuf, Error> {
    Ok(app_data_dir()?.join(COUNTER_FILE))
}

fn backups_dir() -> Result<PathBuf, Error> {
    let dir = app_data_dir()?.join(BACKUPS_SUBDIR);
    if !dir.exists() {
        fs::create_dir_all(&dir)?;
    }
    Ok(dir)
}

fn read_counter() -> u32 {
    let Ok(path) = counter_path() else {
        return 0;
    };
    let Ok(raw) = fs::read_to_string(&path) else {
        return 0;
    };
    raw.trim().parse().unwrap_or(0)
}

fn write_counter(n: u32) -> Result<(), Error> {
    let path = counter_path()?;
    fs::write(&path, n.to_string())?;
    Ok(())
}

/// Estado del boot — lo que `inspect_and_increment` devuelve para que el
/// caller (lib.rs) sepa si tiene que disparar rollback.
#[derive(Debug, PartialEq, Eq)]
pub enum BootDecision {
    /// Boot normal — incrementamos el counter; el async task lo reseteará
    /// si sobrevivimos 30s.
    Normal { count: u32 },
    /// El counter ya superó el umbral antes de este boot. Hay que
    /// disparar rollback (rollback() loggea + busca backup + relanza).
    NeedsRollback { count: u32 },
}

/// Lee el counter actual + lo incrementa atómicamente. Llamar UNA SOLA
/// VEZ al boot (idealmente desde `run()` antes de spawn-ear nada
/// asíncrono). Tolera errores de IO — si el filesystem está raro,
/// devolvemos Normal{count:0} y seguimos: peor escenario, no detectamos
/// el loop de crashes, pero NO impedimos el boot por una falla de disco.
pub fn inspect_and_increment() -> BootDecision {
    let previous = read_counter();
    let new_count = previous.saturating_add(1);
    // Mejor-esfuerzo: si write_counter falla, seguimos. El counter
    // queda fijo en `previous` y el próximo boot lo verá igual — mejor
    // que abortar la app por no poder escribir un int.
    let _ = write_counter(new_count);

    if previous >= ROLLBACK_THRESHOLD {
        BootDecision::NeedsRollback { count: previous }
    } else {
        BootDecision::Normal { count: new_count }
    }
}

/// `arm_reset_timer` arranca una tarea async que espera
/// `BOOT_OK_AFTER_SECS` y luego resetea el counter a 0. Si el binario
/// crashea antes, el reset nunca ocurre — el próximo boot ve el counter
/// elevado.
///
/// Usar dentro del setup de Tauri con `tauri::async_runtime::spawn`.
pub async fn arm_reset_timer() {
    tokio::time::sleep(std::time::Duration::from_secs(BOOT_OK_AFTER_SECS)).await;
    if let Err(e) = write_counter(0) {
        log::warn!("boot_guard: could not reset boot counter: {e}");
    } else {
        log::info!("boot_guard: boot OK — counter reset to 0");
    }
}

/// Path donde la capa JS debe copiar el MSI activo ANTES de instalar el
/// update, de manera que el next-boot tenga algo a qué volver si el
/// nuevo binario rompe. El nombre se basa en la versión que se está por
/// reemplazar para poder identificar la backup desde Ajustes / soporte.
///
/// Sólo Windows tiene .msi distribuible (ADR-005 §3). Para macOS este
/// path se devuelve igual (.app no se puede "instalar via msiexec") pero
/// nadie lo usa en producción — macOS es dev-only.
///
/// Hoy NO se invoca desde Rust — la capa JS (updater.ts) la consume vía
/// el comando Tauri `backup_installer_path_cmd` para depositar el
/// installer descargado en backups antes de aplicar. Marcado como pub
/// porque expuesto a JS; `#[allow(dead_code)]` para que el lint no se
/// queje mientras el wire JS no lo está usando todavía (queda como hook
/// listo para que un próximo plugin de updater sí entregue el path).
#[allow(dead_code)]
pub fn backup_installer_path(version: &str) -> Result<PathBuf, Error> {
    let dir = backups_dir()?;
    Ok(dir.join(format!("Tinta-{version}-x64-setup.exe")))
}

/// El marker se escribe inmediatamente DESPUÉS de detectar un loop de
/// crashes (ROLLBACK_THRESHOLD alcanzado). Contiene la versión que
/// crasheaba + cuántos boots fallidos + si pudimos lanzar el installer
/// de rollback. El FE lo lee vía `read_auto_rollback_marker` para
/// mostrar un banner "estamos en estado degradado" hasta que el dueño
/// confirme que ya pasó.
#[derive(serde::Serialize, serde::Deserialize, Debug)]
pub struct RollbackMarker {
    pub at: String, // ISO 8601 — JS lo parsea como Date directamente.
    pub failed_version: String,
    pub fail_count: u32,
    pub rolled_back: bool,
}

fn marker_path() -> Result<PathBuf, Error> {
    Ok(app_data_dir()?.join(ROLLBACK_MARKER_FILE))
}

fn write_marker(marker: &RollbackMarker) -> Result<(), Error> {
    let path = marker_path()?;
    let body = serde_json::to_string_pretty(marker)
        .map_err(|e| Error::Io(std::io::Error::new(std::io::ErrorKind::Other, e)))?;
    fs::write(&path, body)?;
    Ok(())
}

/// `read_marker` devuelve el marker si existe — sin error si no hay nada.
/// Lo expone una Tauri command para que la UI pinte el banner.
pub fn read_marker() -> Option<RollbackMarker> {
    let path = marker_path().ok()?;
    let raw = fs::read_to_string(&path).ok()?;
    serde_json::from_str(&raw).ok()
}

/// `clear_marker` borra el marker — UI lo invoca cuando el dueño cierra
/// el banner "ya estoy en versión sana".
pub fn clear_marker() {
    if let Ok(path) = marker_path() {
        let _ = fs::remove_file(&path);
    }
}

/// `latest_backup` busca en backups/ el installer más reciente. Es lo que
/// `rollback()` invoca para saber qué relanzar.
fn latest_backup() -> Option<PathBuf> {
    let dir = backups_dir().ok()?;
    let mut entries: Vec<(std::time::SystemTime, PathBuf)> = fs::read_dir(&dir)
        .ok()?
        .filter_map(|e| e.ok())
        .filter(|e| {
            e.path()
                .extension()
                .and_then(|x| x.to_str())
                .map(|x| x == "msi" || x == "exe")
                .unwrap_or(false)
        })
        .filter_map(|e| {
            let m = e.metadata().ok()?;
            let t = m.modified().ok()?;
            Some((t, e.path()))
        })
        .collect();
    entries.sort_by(|a, b| b.0.cmp(&a.0));
    entries.into_iter().next().map(|(_, p)| p)
}

/// Dispara el rollback: loggea, intenta lanzar el backup más reciente, y
/// si todo va bien sale del proceso para no competir con el installer.
///
/// Retorna `Ok(true)` si arrancó el installer del backup (el proceso
/// actual debe terminarse). `Ok(false)` si no hay backup disponible (el
/// caller tiene que dejar la app en un estado degradado visible). `Err`
/// si la invocación del installer falló.
pub fn rollback(current_version: &str, fail_count: u32) -> Result<bool, Error> {
    log::error!(
        "boot_guard: detectado loop de crashes ({fail_count} consecutivos en v{current_version}) — intentando rollback"
    );
    // Persistimos el marker SIEMPRE (con o sin backup) — el FE lo lee al
    // boot siguiente y pinta el banner. Lo marcamos rolled_back más
    // abajo si la invocación de msiexec realmente arrancó.
    let now = chrono_iso8601_now();
    // `mut` sólo aplica al path Windows (donde sí mutamos rolled_back tras
    // lanzar msiexec). Fuera de Windows el marker se escribe una sola vez
    // y nunca cambia → evitamos el warning con cfg.
    #[cfg(target_os = "windows")]
    let mut marker = RollbackMarker {
        at: now,
        failed_version: current_version.to_string(),
        fail_count,
        rolled_back: false,
    };
    #[cfg(not(target_os = "windows"))]
    let marker = RollbackMarker {
        at: now,
        failed_version: current_version.to_string(),
        fail_count,
        rolled_back: false,
    };
    let _ = write_marker(&marker);

    let Some(backup) = latest_backup() else {
        log::error!("boot_guard: no hay backup disponible — el operador queda con el binario roto");
        return Ok(false);
    };
    log::warn!("boot_guard: lanzando installer de rollback: {:?}", backup);

    // Reseteamos el counter ANTES de lanzar — si el rollback fallara
    // arrancando, no queremos quedar en loop infinito.
    let _ = write_counter(0);

    #[cfg(target_os = "windows")]
    {
        // /passive = sin UI interactiva pero con barra de progreso.
        // /norestart = no reinicia la PC; Tinta vive sin requerir reboot.
        std::process::Command::new("msiexec")
            .args([
                "/i",
                backup.to_string_lossy().as_ref(),
                "/passive",
                "/norestart",
            ])
            .spawn()?;
        marker.rolled_back = true;
        let _ = write_marker(&marker);
        return Ok(true);
    }

    // Fuera de Windows no tenemos installer distribuible (ADR-005 §3.2):
    // el operador NO va a estar acá. Loggeamos y devolvemos false para
    // que la app, si quiere, muestre un banner.
    #[cfg(not(target_os = "windows"))]
    {
        let _ = backup;
        let _ = marker;
        log::warn!("boot_guard: rollback no implementado fuera de Windows (ADR-005 §3.2)");
        Ok(false)
    }
}

/// ISO 8601 minimalista — evitamos meter `chrono` como dep nueva. El FE
/// parsea con `new Date(string)`. Si en algún momento ya entra chrono
/// por otra cosa, swappear acá.
fn chrono_iso8601_now() -> String {
    // SystemTime → segundos desde epoch → format manual UTC.
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    // Date construction muy básica: usamos format manual con divmod.
    // No es bonito pero alcanza para el marker (precisión ±1s).
    let (days, sec_of_day) = (now / 86_400, now % 86_400);
    let (hour, rest) = (sec_of_day / 3_600, sec_of_day % 3_600);
    let (min, sec) = (rest / 60, rest % 60);
    let (year, month, day) = days_to_ymd(days as i64);
    format!(
        "{:04}-{:02}-{:02}T{:02}:{:02}:{:02}Z",
        year, month, day, hour, min, sec
    )
}

// Conversión epoch_day → (year, month, day). Algoritmo de Howard Hinnant.
// Probado en tests aparte; suficientemente preciso para el marker.
fn days_to_ymd(days: i64) -> (i64, u32, u32) {
    let z = days + 719_468;
    let era = if z >= 0 { z } else { z - 146_096 } / 146_097;
    let doe = (z - era * 146_097) as u64; // [0, 146096]
    let yoe = (doe - doe / 1460 + doe / 36_524 - doe / 146_096) / 365; // [0, 399]
    let y = yoe as i64 + era * 400;
    let doy = doe - (365 * yoe + yoe / 4 - yoe / 100);
    let mp = (5 * doy + 2) / 153;
    let d = (doy - (153 * mp + 2) / 5 + 1) as u32;
    let m = (if mp < 10 { mp + 3 } else { mp - 9 }) as u32;
    (if m <= 2 { y + 1 } else { y }, m, d)
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::sync::Mutex;

    // Los tests comparten el path real en disco (no podemos parametrizar
    // dirs::data_dir() sin filtrar la abstracción al runtime). Serializamos
    // con un mutex para que cargo no los corra en paralelo y nos pisemos
    // el counter file entre tests.
    static SERIAL: Mutex<()> = Mutex::new(());

    fn reset() {
        if let Ok(p) = counter_path() {
            let _ = fs::remove_file(&p);
        }
    }

    #[test]
    fn counter_arranca_en_cero_si_archivo_no_existe() {
        let _g = SERIAL.lock().unwrap();
        reset();
        assert_eq!(read_counter(), 0);
    }

    #[test]
    fn inspect_increments_and_returns_normal_below_threshold() {
        let _g = SERIAL.lock().unwrap();
        reset();
        let first = inspect_and_increment();
        assert_eq!(first, BootDecision::Normal { count: 1 });
        let second = inspect_and_increment();
        assert_eq!(second, BootDecision::Normal { count: 2 });
    }

    #[test]
    fn inspect_returns_needs_rollback_when_threshold_reached() {
        let _g = SERIAL.lock().unwrap();
        reset();
        // Simulamos 2 boots crasheados sin reset (counter=2 al arrancar).
        let _ = write_counter(2);
        let decision = inspect_and_increment();
        // El counter previo (2) ya alcanza el umbral → NeedsRollback.
        assert_eq!(decision, BootDecision::NeedsRollback { count: 2 });
    }

    #[test]
    fn write_counter_overwrites() {
        let _g = SERIAL.lock().unwrap();
        reset();
        write_counter(42).unwrap();
        assert_eq!(read_counter(), 42);
        write_counter(0).unwrap();
        assert_eq!(read_counter(), 0);
    }

    #[test]
    fn days_to_ymd_known_dates() {
        // 2026-05-25 = epoch day 20_598 (calculado manualmente).
        let (y, m, d) = days_to_ymd(20_598);
        assert_eq!((y, m, d), (2026, 5, 25));
        // Epoch (1970-01-01)
        assert_eq!(days_to_ymd(0), (1970, 1, 1));
    }
}
