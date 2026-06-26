import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Sentinel internal flag — isTauri() checks `__TAURI_INTERNALS__` on window.
// Toggle it per-test so we can verify both the Tauri and non-Tauri paths.
function pretendInTauri(on: boolean) {
  if (on) {
    (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__ = {};
  } else {
    delete (window as unknown as Record<string, unknown>).__TAURI_INTERNALS__;
  }
}

interface FakeWindow {
  label: string;
  show: ReturnType<typeof vi.fn>;
  setFocus: ReturnType<typeof vi.fn>;
  close: ReturnType<typeof vi.fn>;
}

const state: {
  byLabel: Map<string, FakeWindow>;
  current: FakeWindow | null;
  constructorCalls: Array<{ label: string; options: Record<string, unknown> }>;
} = {
  byLabel: new Map(),
  current: null,
  constructorCalls: [],
};

vi.mock("@tauri-apps/api/webviewWindow", () => {
  class WebviewWindow {
    label: string;
    show: ReturnType<typeof vi.fn>;
    setFocus: ReturnType<typeof vi.fn>;
    close: ReturnType<typeof vi.fn>;
    constructor(label: string, options: Record<string, unknown>) {
      this.label = label;
      this.show = vi.fn(async () => {});
      this.setFocus = vi.fn(async () => {});
      this.close = vi.fn(async () => {});
      state.constructorCalls.push({ label, options });
      state.byLabel.set(label, this as unknown as FakeWindow);
    }
    static async getByLabel(label: string) {
      return state.byLabel.get(label) ?? null;
    }
  }
  function getCurrentWebviewWindow() {
    return state.current;
  }
  return { WebviewWindow, getCurrentWebviewWindow };
});

describe("kioskWindow", () => {
  beforeEach(() => {
    state.byLabel.clear();
    state.current = null;
    state.constructorCalls = [];
    pretendInTauri(true);
  });

  afterEach(() => {
    pretendInTauri(false);
  });

  it("creates the kiosk window with the expected label and options", async () => {
    const { openKioskWindow, KIOSK_WINDOW_LABEL } = await import("../kioskWindow");
    await openKioskWindow();
    expect(state.constructorCalls).toHaveLength(1);
    expect(state.constructorCalls[0].label).toBe(KIOSK_WINDOW_LABEL);
    expect(state.constructorCalls[0].options).toMatchObject({
      url: "/kiosk",
      title: "Tinta · Kiosko",
      // El kiosko ya no corre fullscreen sin decoraciones; ahora es una
      // ventana normal maximizada con X del OS y barra inferior visible.
      fullscreen: false,
      maximized: true,
      decorations: true,
      resizable: true,
    });
  });

  it("focuses an existing kiosk window instead of creating a new one", async () => {
    const { openKioskWindow } = await import("../kioskWindow");
    await openKioskWindow();
    const existing = state.byLabel.get("kiosk")!;
    state.constructorCalls = [];
    await openKioskWindow();
    expect(state.constructorCalls).toHaveLength(0);
    expect(existing.show).toHaveBeenCalled();
    expect(existing.setFocus).toHaveBeenCalled();
  });

  it("isKioskWindowOpen reflects whether the window exists", async () => {
    const { openKioskWindow, isKioskWindowOpen } = await import("../kioskWindow");
    expect(await isKioskWindowOpen()).toBe(false);
    await openKioskWindow();
    expect(await isKioskWindowOpen()).toBe(true);
  });

  it("closeKioskWindow closes the existing window", async () => {
    const { openKioskWindow, closeKioskWindow } = await import("../kioskWindow");
    await openKioskWindow();
    const existing = state.byLabel.get("kiosk")!;
    await closeKioskWindow();
    expect(existing.close).toHaveBeenCalled();
  });

  it("isCurrentWindowKiosk reads the current window label", async () => {
    const { isCurrentWindowKiosk } = await import("../kioskWindow");
    state.current = { label: "kiosk" } as FakeWindow;
    expect(await isCurrentWindowKiosk()).toBe(true);
    state.current = { label: "main" } as FakeWindow;
    expect(await isCurrentWindowKiosk()).toBe(false);
  });

  it("outside Tauri, openKioskWindow opens /kiosk in a named tab instead of using the WebviewWindow API", async () => {
    pretendInTauri(false);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { openKioskWindow, KIOSK_WINDOW_LABEL } = await import("../kioskWindow");
    await openKioskWindow();
    expect(state.constructorCalls).toHaveLength(0);
    expect(openSpy).toHaveBeenCalledWith("/kiosk", KIOSK_WINDOW_LABEL);
    openSpy.mockRestore();
  });
});
