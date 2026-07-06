import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { CheckinEvent } from "@/hooks/useCheckin";

function pretendInTauri(on: boolean) {
  if (on) {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

// ── mock: bus de eventos Tauri en memoria ──────────────────────────────
// listen registra, busEmit dispara. El emit real del módulo pasa por
// emitMock para poder afirmar "fuera de Tauri no se emite". Igual que en
// Tauri real, el emisor TAMBIÉN recibe sus propios eventos (echo) — el
// filtrado por source es parte del contrato bajo prueba.
type Listener = (e: { payload: unknown }) => void;
const listeners = new Map<string, Set<Listener>>();

function busEmit(event: string, payload: unknown) {
  listeners.get(event)?.forEach((cb) => cb({ payload }));
}

const emitMock = vi.fn(async (event: string, payload: unknown) => {
  busEmit(event, payload);
});

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Listener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
    return () => listeners.get(event)?.delete(cb);
  }),
  emit: (event: string, payload: unknown) => emitMock(event, payload),
}));

// ── mock: label de la ventana actual ───────────────────────────────────
let currentLabel = "main";
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: currentLabel }),
}));

import {
  useCheckinResultRelay,
  emitCheckinResult,
  EVT_CHECKIN_RESULT,
} from "../useCheckinResultRelay";

const CHECKIN_EVENT: CheckinEvent = {
  id: "chk-1",
  result: "allowed_active",
  method: "fingerprint",
  member_id: "m-1",
  member_name: "Ana López",
  expiry_date: "2026-08-01",
  days_until_expiry: 26,
  manual_override: false,
  created_at: "2026-07-06T10:00:00Z",
};

// Drena el boot async del hook (import dinámico + listen) dentro de act().
async function flushBoot() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("useCheckinResultRelay", () => {
  beforeEach(() => {
    listeners.clear();
    emitMock.mockClear();
    currentLabel = "main";
    pretendInTauri(true);
  });

  afterEach(() => {
    pretendInTauri(false);
  });

  it("entrega a onCheckin un resultado emitido por OTRA ventana", async () => {
    const onCheckin = vi.fn();
    const onNoMatch = vi.fn();
    renderHook(() => useCheckinResultRelay({ onCheckin, onNoMatch }));
    await flushBoot();

    act(() =>
      busEmit(EVT_CHECKIN_RESULT, {
        source: "kiosk",
        kind: "checkin",
        event: CHECKIN_EVENT,
      }),
    );

    expect(onCheckin).toHaveBeenCalledWith(CHECKIN_EVENT);
    expect(onNoMatch).not.toHaveBeenCalled();
  });

  it("descarta el echo de la propia ventana (source === label propio)", async () => {
    const onCheckin = vi.fn();
    const onNoMatch = vi.fn();
    renderHook(() => useCheckinResultRelay({ onCheckin, onNoMatch }));
    await flushBoot();

    // Caso real: CheckinPage (main) emite; el GlobalCheckinScanner (main)
    // escucha en la MISMA ventana. Sin el filtro, el operador vería el
    // resultado dos veces (página + toast).
    act(() =>
      busEmit(EVT_CHECKIN_RESULT, {
        source: "main",
        kind: "checkin",
        event: CHECKIN_EVENT,
      }),
    );
    act(() => busEmit(EVT_CHECKIN_RESULT, { source: "main", kind: "no_match" }));

    expect(onCheckin).not.toHaveBeenCalled();
    expect(onNoMatch).not.toHaveBeenCalled();
  });

  it("entrega un no-match relayado a onNoMatch", async () => {
    const onCheckin = vi.fn();
    const onNoMatch = vi.fn();
    renderHook(() => useCheckinResultRelay({ onCheckin, onNoMatch }));
    await flushBoot();

    act(() => busEmit(EVT_CHECKIN_RESULT, { source: "kiosk", kind: "no_match" }));

    expect(onNoMatch).toHaveBeenCalledTimes(1);
    expect(onCheckin).not.toHaveBeenCalled();
  });

  it("emitCheckinResult estampa el source de la ventana actual", async () => {
    currentLabel = "checkin-float";
    await emitCheckinResult({ kind: "checkin", event: CHECKIN_EVENT });

    expect(emitMock).toHaveBeenCalledWith(EVT_CHECKIN_RESULT, {
      source: "checkin-float",
      kind: "checkin",
      event: CHECKIN_EVENT,
    });
  });

  it("round-trip entre ventanas: emit del kiosko llega al listener de main", async () => {
    const onCheckin = vi.fn();
    renderHook(() => useCheckinResultRelay({ onCheckin, onNoMatch: vi.fn() }));
    await flushBoot();

    // El "kiosko" emite (cambiamos el label ANTES del emit; el listener ya
    // resolvió "main" en su boot).
    currentLabel = "kiosk";
    await act(async () => {
      await emitCheckinResult({ kind: "checkin", event: CHECKIN_EVENT });
    });

    expect(onCheckin).toHaveBeenCalledWith(CHECKIN_EVENT);
  });

  it("un payload malformado no revienta ni dispara callbacks", async () => {
    const onCheckin = vi.fn();
    const onNoMatch = vi.fn();
    renderHook(() => useCheckinResultRelay({ onCheckin, onNoMatch }));
    await flushBoot();

    act(() => busEmit(EVT_CHECKIN_RESULT, "garbage"));
    act(() => busEmit(EVT_CHECKIN_RESULT, null));
    act(() => busEmit(EVT_CHECKIN_RESULT, { source: "kiosk", kind: "otra_cosa" }));

    expect(onCheckin).not.toHaveBeenCalled();
    expect(onNoMatch).not.toHaveBeenCalled();
  });

  it("usa los handlers actuales sin re-suscribir (ref pattern)", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: (ev: CheckinEvent) => void }) =>
        useCheckinResultRelay({ onCheckin: cb, onNoMatch: vi.fn() }),
      { initialProps: { cb: first } },
    );
    await flushBoot();

    rerender({ cb: second });
    act(() =>
      busEmit(EVT_CHECKIN_RESULT, {
        source: "kiosk",
        kind: "checkin",
        event: CHECKIN_EVENT,
      }),
    );

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(CHECKIN_EVENT);
    // Y sigue habiendo UN solo listener registrado.
    expect(listeners.get(EVT_CHECKIN_RESULT)?.size).toBe(1);
  });

  it("al desmontar se desuscribe del bus", async () => {
    const { unmount } = renderHook(() =>
      useCheckinResultRelay({ onCheckin: vi.fn(), onNoMatch: vi.fn() }),
    );
    await flushBoot();
    expect(listeners.get(EVT_CHECKIN_RESULT)?.size).toBe(1);

    unmount();
    expect(listeners.get(EVT_CHECKIN_RESULT)?.size).toBe(0);
  });

  it("fuera de Tauri no escucha ni emite", async () => {
    pretendInTauri(false);
    const onCheckin = vi.fn();
    renderHook(() => useCheckinResultRelay({ onCheckin, onNoMatch: vi.fn() }));
    await flushBoot();

    expect(listeners.get(EVT_CHECKIN_RESULT)?.size ?? 0).toBe(0);

    await emitCheckinResult({ kind: "no_match" });
    expect(emitMock).not.toHaveBeenCalled();
  });
});
