import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useWindowPresence } from "../useWindowPresence";

function pretendInTauri(on: boolean) {
  if (on) {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

// ── mocks: ventanas por label + bus de eventos Tauri ──────────────────
const windowsByLabel = new Set<string>();

vi.mock("@tauri-apps/api/webviewWindow", () => ({
  WebviewWindow: {
    getByLabel: async (label: string) =>
      windowsByLabel.has(label) ? { label } : null,
  },
  getCurrentWebviewWindow: () => ({ label: "main" }),
}));

type Listener = (e: { payload: unknown }) => void;
const listeners = new Map<string, Set<Listener>>();

function busEmit(event: string, payload: unknown) {
  listeners.get(event)?.forEach((cb) => cb({ payload }));
}

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Listener) => {
    if (!listeners.has(event)) listeners.set(event, new Set());
    listeners.get(event)!.add(cb);
    return () => listeners.get(event)?.delete(cb);
  }),
}));

// Drena el boot async del hook (imports dinámicos + probe inicial) dentro
// de act() para que los setState del probe no disparen warnings.
async function flushBoot() {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
}

describe("useWindowPresence", () => {
  beforeEach(() => {
    windowsByLabel.clear();
    listeners.clear();
    pretendInTauri(true);
  });

  afterEach(() => {
    pretendInTauri(false);
  });

  it("detecta una ventana ya existente en el probe inicial", async () => {
    windowsByLabel.add("checkin-float");
    const { result } = renderHook(() => useWindowPresence("checkin-float", 60));
    await flushBoot();
    expect(result.current).toBe(true);
  });

  it("reporta false cuando la ventana no existe", async () => {
    const { result } = renderHook(() => useWindowPresence("checkin-float", 60));
    await flushBoot();
    // Los listeners quedaron registrados y el probe corrió.
    expect(listeners.get("tauri://window-destroyed")?.size ?? 0).toBeGreaterThan(0);
    expect(result.current).toBe(false);
  });

  it("cae a false al instante cuando llega window-destroyed del label", async () => {
    windowsByLabel.add("checkin-float");
    const { result } = renderHook(() => useWindowPresence("checkin-float", 5_000));
    await flushBoot();
    expect(result.current).toBe(true);

    windowsByLabel.delete("checkin-float");
    act(() => busEmit("tauri://window-destroyed", "checkin-float"));
    expect(result.current).toBe(false);
  });

  it("sube a true al instante cuando llega window-created del label (payload objeto)", async () => {
    const { result } = renderHook(() => useWindowPresence("kiosk", 5_000));
    await flushBoot();
    expect(listeners.get("tauri://window-created")?.size ?? 0).toBeGreaterThan(0);

    windowsByLabel.add("kiosk");
    act(() => busEmit("tauri://window-created", { label: "kiosk" }));
    expect(result.current).toBe(true);
  });

  it("ignora eventos de otros labels", async () => {
    windowsByLabel.add("checkin-float");
    const { result } = renderHook(() => useWindowPresence("checkin-float", 5_000));
    await flushBoot();
    expect(result.current).toBe(true);

    act(() => busEmit("tauri://window-destroyed", "kiosk"));
    expect(result.current).toBe(true);
  });

  it("el poll reconcilia aunque el evento se haya perdido", async () => {
    // Ventana aparece DESPUÉS del mount, sin evento window-created (p.ej.
    // esta ventana estaba en background y el evento no llegó).
    const { result } = renderHook(() => useWindowPresence("checkin-float", 40));
    await flushBoot();
    expect(result.current).toBe(false);

    windowsByLabel.add("checkin-float");
    // Dejamos correr varios ticks del poll dentro de act.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 150));
    });
    expect(result.current).toBe(true);
  });

  it("fuera de Tauri siempre reporta false", async () => {
    pretendInTauri(false);
    windowsByLabel.add("checkin-float");
    const { result } = renderHook(() => useWindowPresence("checkin-float", 40));
    // Sin Tauri no hay coordinación multi-ventana posible.
    await new Promise((r) => setTimeout(r, 100));
    expect(result.current).toBe(false);
  });
});
