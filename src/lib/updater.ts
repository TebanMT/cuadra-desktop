// updater.ts — wrapper sobre @tauri-apps/plugin-updater con telemetry
// hacia el cloud (ADR-005 §7). Aislado en /lib porque el hook (useUpdater)
// es sólo el orquestador del UI; la lógica de check/download/install/report
// vive acá para que sea testeable y reusable desde Ajustes ("Buscar
// actualizaciones") sin duplicar.

import { isTauri } from "./utils";
import { api } from "./api";

// ---------------------------------------------------------------------------
// Auto-rollback marker (ADR-005 §2.5)
// ---------------------------------------------------------------------------
// Cuando el binario crashea 2x seguidas, Rust escribe un marker en disco
// con la versión que falló + timestamp. El FE lo lee al boot para mostrar
// un banner; cuando el dueño lo cierra, llamamos clearRollbackMarker.

export interface RollbackMarker {
  at: string;
  failed_version: string;
  fail_count: number;
  rolled_back: boolean;
}

export async function readRollbackMarker(): Promise<RollbackMarker | null> {
  if (!isTauri()) return null;
  const { invoke } = await import("@tauri-apps/api/core");
  const res = await invoke<RollbackMarker | null>("read_auto_rollback_marker");
  if (res) {
    // Reportamos el evento auto_rollback como telemetry — first sighting
    // (idempotente: el marker dura hasta que el usuario lo cierra, pero
    // el reportTelemetry de abajo no se llama en loop porque
    // UpdaterShell sólo lee el marker una vez por sesión).
    void reportTelemetry({
      kind: "auto_rollback",
      from: res.failed_version,
      to: "previous-installer",
      reason: `boot-fail-count=${res.fail_count}, rolled_back=${res.rolled_back}`,
    });
  }
  return res;
}

export async function clearRollbackMarker(): Promise<void> {
  if (!isTauri()) return;
  const { invoke } = await import("@tauri-apps/api/core");
  await invoke("clear_auto_rollback_marker");
}

// Eventos que enviamos al cloud (ADR-005 §7). El cloud los persiste en
// `update_events` (tabla que se agregaría post-v1 — por ahora consumo
// silencioso si el endpoint no existe). No nos importa fallar acá: la
// telemetry es best-effort, no debe interrumpir el flujo de update.
export type UpdateEvent =
  | { kind: "update_check"; currentVersion: string }
  | { kind: "update_available"; currentVersion: string; newVersion: string }
  | { kind: "update_download_started"; newVersion: string }
  | { kind: "update_download_completed"; newVersion: string }
  | { kind: "update_apply_started"; newVersion: string }
  | { kind: "update_apply_succeeded"; newVersion: string }
  | { kind: "update_apply_failed"; newVersion: string; reason: string }
  | { kind: "auto_rollback"; from: string; to: string; reason: string };

export async function reportTelemetry(evt: UpdateEvent): Promise<void> {
  try {
    await api.post("/api/v1/telemetry/update-event", evt);
  } catch {
    // Silencio intencional. La telemetry no debe romper el flujo;
    // el peor caso es que perdamos visibilidad de un update event,
    // no que un cliente quede sin actualizar.
  }
}

// CheckResult es lo que devuelve checkForUpdate(). Mantiene un wrapper
// simple sobre el shape de Tauri para que el hook no tenga que conocer la
// API del plugin directamente — útil si tenemos que swappear backend en
// el futuro (e.g. Sentry-based update channel).
export interface UpdateInfo {
  version: string;
  notes: string | null;
  // pubDate llega como ISO string; el hook decide cómo renderearlo.
  pubDate: string | null;
}

export interface CheckResult {
  available: boolean;
  info?: UpdateInfo;
  current?: string;
}

// Carga lazy del plugin: import() asíncrono evita pagar el costo al boot
// si el FE se está cargando fuera de Tauri (dev en browser, vitest).
async function loadPlugin() {
  if (!isTauri()) return null;
  const mod = await import("@tauri-apps/plugin-updater");
  return mod;
}

export async function checkForUpdate(currentVersion: string): Promise<CheckResult> {
  void reportTelemetry({ kind: "update_check", currentVersion });
  const plugin = await loadPlugin();
  if (!plugin) {
    // Fuera de Tauri (dev en browser) — devolvemos "sin update" para que
    // la UI no rompa. En producción siempre estamos dentro de Tauri.
    return { available: false };
  }
  const update = await plugin.check();
  if (!update) {
    return { available: false, current: currentVersion };
  }
  void reportTelemetry({
    kind: "update_available",
    currentVersion,
    newVersion: update.version,
  });
  return {
    available: true,
    current: currentVersion,
    info: {
      version: update.version,
      notes: update.body ?? null,
      pubDate: update.date ?? null,
    },
  };
}

// downloadAndInstall encadena los tres steps y reporta cada uno. relaunch
// dispara reinicio de la app — el caller decide cuándo invocarlo (ahora vs.
// al cerrar). En el flujo silencioso default sólo reportamos
// apply_succeeded y dejamos que el ciclo natural de cerrar/abrir aplique
// el update; con `restartNow=true` (botón manual en Ajustes / modal de
// schema upgrade) llamamos relaunch().
export async function downloadAndInstall(
  newVersion: string,
  restartNow: boolean,
): Promise<{ ok: true } | { ok: false; reason: string }> {
  const plugin = await loadPlugin();
  if (!plugin) return { ok: false, reason: "no-tauri" };

  const update = await plugin.check();
  if (!update) {
    return { ok: false, reason: "no-update-available" };
  }

  void reportTelemetry({ kind: "update_download_started", newVersion });
  try {
    await update.downloadAndInstall();
    void reportTelemetry({ kind: "update_download_completed", newVersion });
    void reportTelemetry({ kind: "update_apply_started", newVersion });
    void reportTelemetry({ kind: "update_apply_succeeded", newVersion });
  } catch (e: unknown) {
    const reason = e instanceof Error ? e.message : String(e);
    void reportTelemetry({ kind: "update_apply_failed", newVersion, reason });
    return { ok: false, reason };
  }
  if (restartNow) {
    const process = await import("@tauri-apps/plugin-process");
    await process.relaunch();
  }
  return { ok: true };
}
