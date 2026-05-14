// Local secret persistence for the desktop app — replaces the previous
// macOS Keychain (`keyring` crate) implementation.
//
// Why a flat JSON file instead of OS keychain?
//
// We ship the desktop ad-hoc signed (`signingIdentity: "-"` in
// tauri.conf.json) because we don't yet have an Apple Developer ID
// ($99/year + notarization) or equivalent EV cert on Windows. Under
// ad-hoc signing on macOS:
//
//   - There is no Apple Team ID, so the keychain entries we add
//     cannot be tagged with an access group derived from one.
//   - macOS happily ACCEPTS writes to the keychain — `SecItemAdd`
//     returns success — but later reads via `SecItemCopyMatching`
//     return `errSecItemNotFound` because the calling process'
//     code-signing identity doesn't match the access-list of the
//     stored item. This produced the symptom we hit in production:
//     redeem-installer worked, but the next API call had no
//     Authorization header → 401.
//
// File-based persistence is the boring, reliable answer:
//
//   ~/Library/Application Support/app.tinta.desktop/secrets.json   (macOS)
//   %APPDATA%\app.tinta.desktop\secrets.json                       (Windows)
//   ~/.local/share/app.tinta.desktop/secrets.json                  (Linux)
//
// Mode 0600 on Unix limits readback to the same OS user. On a gym's
// reception desktop where one OS user logs in physically and the
// machine is single-purpose, that matches the actual threat model —
// the keychain wouldn't have offered meaningful additional protection
// here anyway (keychain unlock follows the login session, same as
// file-system access).
//
// When/if we ever ship Developer-ID-signed-and-notarized builds, we
// can re-introduce keychain as a primary store and migrate existing
// secrets transparently. This module's public API (set/get/delete)
// stays stable so that swap is a one-file change.

use std::collections::HashMap;
use std::fs;
use std::io;
use std::path::PathBuf;
use std::sync::Mutex;

// pub: el módulo sidecar también lo usa para colocar tinta.db y el
// cache de fotos bajo el mismo paraguas por-OS (~/Library/Application
// Support/app.tinta.desktop, %APPDATA%\app.tinta.desktop, …).
pub const APP_DIR_NAME: &str = "app.tinta.desktop";
const SECRETS_FILE: &str = "secrets.json";

#[derive(thiserror::Error, Debug)]
pub enum Error {
    #[error("could not resolve app data directory")]
    NoDataDir,
    #[error("io error: {0}")]
    Io(#[from] io::Error),
    #[error("json error: {0}")]
    Json(#[from] serde_json::Error),
}

/// In-process serializer for the file. Concurrent set/get from
/// different Tauri commands run on different threads — without this
/// lock two simultaneous writes could corrupt the JSON. Reads are
/// also locked to avoid the read-modify-write race that would
/// otherwise lose entries on concurrent set calls.
static FILE_LOCK: Mutex<()> = Mutex::new(());

fn data_dir() -> Result<PathBuf, Error> {
    // dirs::data_dir() returns the platform's "app support" root —
    // ~/Library/Application Support on macOS, %APPDATA% on Windows,
    // ~/.local/share on Linux. We append APP_DIR_NAME and create
    // the directory on first use.
    let root = dirs::data_dir().ok_or(Error::NoDataDir)?;
    let app_dir = root.join(APP_DIR_NAME);
    if !app_dir.exists() {
        fs::create_dir_all(&app_dir)?;
        // Restrict access on Unix: the parent directory itself is
        // 0700 (only the owning OS user can list/enter it). Without
        // this another local user could read the secrets file.
        #[cfg(unix)]
        {
            use std::os::unix::fs::PermissionsExt;
            let mut perms = fs::metadata(&app_dir)?.permissions();
            perms.set_mode(0o700);
            fs::set_permissions(&app_dir, perms)?;
        }
    }
    Ok(app_dir)
}

fn secrets_path() -> Result<PathBuf, Error> {
    Ok(data_dir()?.join(SECRETS_FILE))
}

fn load() -> Result<HashMap<String, String>, Error> {
    let path = secrets_path()?;
    match fs::read_to_string(&path) {
        Ok(contents) if contents.trim().is_empty() => Ok(HashMap::new()),
        Ok(contents) => Ok(serde_json::from_str(&contents)?),
        // First run — file doesn't exist yet. Return empty map.
        Err(e) if e.kind() == io::ErrorKind::NotFound => Ok(HashMap::new()),
        Err(e) => Err(e.into()),
    }
}

fn save(map: &HashMap<String, String>) -> Result<(), Error> {
    let path = secrets_path()?;
    let json = serde_json::to_string_pretty(map)?;

    // Atomic write: write to a sibling temp file then rename. Without
    // this a crash mid-write could leave a half-written secrets.json
    // and brick the app.
    let tmp_path = path.with_extension("json.tmp");
    fs::write(&tmp_path, json.as_bytes())?;

    // Set permissions on the temp file BEFORE rename — between rename
    // and chmod the file is briefly world-readable on some umasks.
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = fs::metadata(&tmp_path)?.permissions();
        perms.set_mode(0o600);
        fs::set_permissions(&tmp_path, perms)?;
    }

    fs::rename(&tmp_path, &path)?;
    Ok(())
}

pub fn set(key: &str, value: &str) -> Result<(), Error> {
    let _guard = FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut map = load()?;
    map.insert(key.to_string(), value.to_string());
    save(&map)?;
    Ok(())
}

pub fn get(key: &str) -> Result<Option<String>, Error> {
    let _guard = FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let map = load()?;
    Ok(map.get(key).cloned())
}

pub fn delete(key: &str) -> Result<(), Error> {
    let _guard = FILE_LOCK.lock().unwrap_or_else(|e| e.into_inner());
    let mut map = load()?;
    if map.remove(key).is_some() {
        save(&map)?;
    }
    Ok(())
}
