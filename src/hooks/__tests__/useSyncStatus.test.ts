import { describe, it, expect } from "vitest";
import { levelOf, type SyncStatus } from "../useSyncStatus";

// Pin de la disciplina de severidad del sync (offline-first): estar sin
// conexión NUNCA escala a error — la operación diaria no depende de
// internet. Antes offline_medium/long pintaban ámbar de alerta y
// offline_critical pintaba ROJO con "Hay un problema sincronizando",
// que el operador leía como falla del sistema cuando sólo no había
// internet. El rojo queda reservado para problemas reales.
function status(state: SyncStatus["state"]): SyncStatus {
  return {
    state,
    last_synced_at: null,
    queue_pending_count: 0,
    last_error: null,
  };
}

describe("levelOf", () => {
  it("online y offline corto son 'ok' — el parpadeo de red no se reporta", () => {
    expect(levelOf(status("online"))).toBe("ok");
    expect(levelOf(status("offline_short"))).toBe("ok");
  });

  it("offline medio/largo es 'offline' (calmado), no warning ni error", () => {
    expect(levelOf(status("offline_medium"))).toBe("offline");
    expect(levelOf(status("offline_long"))).toBe("offline");
  });

  it("offline crítico (>7d) es 'offlineLong' — visibilidad ámbar, nunca rojo", () => {
    expect(levelOf(status("offline_critical"))).toBe("offlineLong");
  });

  it("los problemas reales conservan su tono propio", () => {
    expect(levelOf(status("sync_error"))).toBe("syncError");
    expect(levelOf(status("auth_invalid"))).toBe("auth");
    expect(levelOf(status("schema_upgrade_required"))).toBe("stale");
  });
});
