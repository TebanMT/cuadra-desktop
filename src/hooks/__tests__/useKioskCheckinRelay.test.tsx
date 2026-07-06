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
// Mismo seam que useWindowPresence.test — listen registra, busEmit
// dispara. El emit real del módulo pasa por emitMock para poder afirmar
// "fuera de Tauri no se emite".
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

import {
  useKioskCheckinRelay,
  emitKioskCheckinResult,
  EVT_KIOSK_CHECKIN_RESULT,
} from "../useKioskCheckinRelay";

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

describe("useKioskCheckinRelay", () => {
  beforeEach(() => {
    listeners.clear();
    emitMock.mockClear();
    pretendInTauri(true);
  });

  afterEach(() => {
    pretendInTauri(false);
  });

  it("entrega un resultado de check-in relayado a onCheckin", async () => {
    const onCheckin = vi.fn();
    const onNoMatch = vi.fn();
    renderHook(() => useKioskCheckinRelay({ onCheckin, onNoMatch }));
    await flushBoot();

    act(() =>
      busEmit(EVT_KIOSK_CHECKIN_RESULT, {
        kind: "checkin",
        event: CHECKIN_EVENT,
      }),
    );

    expect(onCheckin).toHaveBeenCalledWith(CHECKIN_EVENT);
    expect(onNoMatch).not.toHaveBeenCalled();
  });

  it("entrega un no-match relayado a onNoMatch", async () => {
    const onCheckin = vi.fn();
    const onNoMatch = vi.fn();
    renderHook(() => useKioskCheckinRelay({ onCheckin, onNoMatch }));
    await flushBoot();

    act(() => busEmit(EVT_KIOSK_CHECKIN_RESULT, { kind: "no_match" }));

    expect(onNoMatch).toHaveBeenCalledTimes(1);
    expect(onCheckin).not.toHaveBeenCalled();
  });

  it("round-trip: emitKioskCheckinResult llega al listener", async () => {
    const onCheckin = vi.fn();
    const onNoMatch = vi.fn();
    renderHook(() => useKioskCheckinRelay({ onCheckin, onNoMatch }));
    await flushBoot();

    await act(async () => {
      await emitKioskCheckinResult({ kind: "checkin", event: CHECKIN_EVENT });
    });

    expect(emitMock).toHaveBeenCalledWith(EVT_KIOSK_CHECKIN_RESULT, {
      kind: "checkin",
      event: CHECKIN_EVENT,
    });
    expect(onCheckin).toHaveBeenCalledWith(CHECKIN_EVENT);
  });

  it("un payload malformado no revienta ni dispara callbacks", async () => {
    const onCheckin = vi.fn();
    const onNoMatch = vi.fn();
    renderHook(() => useKioskCheckinRelay({ onCheckin, onNoMatch }));
    await flushBoot();

    act(() => busEmit(EVT_KIOSK_CHECKIN_RESULT, "garbage"));
    act(() => busEmit(EVT_KIOSK_CHECKIN_RESULT, null));
    act(() => busEmit(EVT_KIOSK_CHECKIN_RESULT, { kind: "otra_cosa" }));

    expect(onCheckin).not.toHaveBeenCalled();
    expect(onNoMatch).not.toHaveBeenCalled();
  });

  it("usa los handlers actuales sin re-suscribir (ref pattern)", async () => {
    const first = vi.fn();
    const second = vi.fn();
    const { rerender } = renderHook(
      ({ cb }: { cb: (ev: CheckinEvent) => void }) =>
        useKioskCheckinRelay({ onCheckin: cb, onNoMatch: vi.fn() }),
      { initialProps: { cb: first } },
    );
    await flushBoot();

    rerender({ cb: second });
    act(() =>
      busEmit(EVT_KIOSK_CHECKIN_RESULT, {
        kind: "checkin",
        event: CHECKIN_EVENT,
      }),
    );

    expect(first).not.toHaveBeenCalled();
    expect(second).toHaveBeenCalledWith(CHECKIN_EVENT);
    // Y sigue habiendo UN solo listener registrado.
    expect(listeners.get(EVT_KIOSK_CHECKIN_RESULT)?.size).toBe(1);
  });

  it("al desmontar se desuscribe del bus", async () => {
    const { unmount } = renderHook(() =>
      useKioskCheckinRelay({ onCheckin: vi.fn(), onNoMatch: vi.fn() }),
    );
    await flushBoot();
    expect(listeners.get(EVT_KIOSK_CHECKIN_RESULT)?.size).toBe(1);

    unmount();
    expect(listeners.get(EVT_KIOSK_CHECKIN_RESULT)?.size).toBe(0);
  });

  it("fuera de Tauri no escucha ni emite", async () => {
    pretendInTauri(false);
    const onCheckin = vi.fn();
    renderHook(() => useKioskCheckinRelay({ onCheckin, onNoMatch: vi.fn() }));
    await flushBoot();

    expect(listeners.get(EVT_KIOSK_CHECKIN_RESULT)?.size ?? 0).toBe(0);

    await emitKioskCheckinResult({ kind: "no_match" });
    expect(emitMock).not.toHaveBeenCalled();
  });
});
