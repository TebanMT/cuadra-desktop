import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// Sentinel internal flag — isTauri() checks `__TAURI_INTERNALS__` on window.
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
  constructorCalls: Array<{ label: string; options: Record<string, unknown> }>;
} = {
  byLabel: new Map(),
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
  return { WebviewWindow, getCurrentWebviewWindow: () => null };
});

const toastWarning = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    warning: (...args: unknown[]) => toastWarning(...args),
    error: vi.fn(),
    success: vi.fn(),
  },
}));

// Fake kiosk/float existentes sin pasar por los constructores reales.
function pretendWindowExists(label: string) {
  state.byLabel.set(label, {
    label,
    show: vi.fn(async () => {}),
    setFocus: vi.fn(async () => {}),
    close: vi.fn(async () => {}),
  });
}

describe("floatWindow", () => {
  beforeEach(() => {
    state.byLabel.clear();
    state.constructorCalls = [];
    toastWarning.mockClear();
    window.localStorage.clear();
    pretendInTauri(true);
  });

  afterEach(() => {
    pretendInTauri(false);
  });

  it("crea la ventana flotante con el label y las opciones de mini-player", async () => {
    const { openCheckinFloatWindow, CHECKIN_FLOAT_WINDOW_LABEL } = await import(
      "../floatWindow"
    );
    const result = await openCheckinFloatWindow();
    expect(result).toBe("created");
    expect(state.constructorCalls).toHaveLength(1);
    expect(state.constructorCalls[0].label).toBe(CHECKIN_FLOAT_WINDOW_LABEL);
    expect(state.constructorCalls[0].options).toMatchObject({
      url: "/checkin-float",
      // Compacta, siempre encima, sin chrome del OS (drag region + botón
      // de cerrar propios) y fuera del taskbar.
      decorations: false,
      alwaysOnTop: true,
      skipTaskbar: true,
      resizable: true,
      width: 340,
      height: 220,
    });
  });

  it("enfoca la flotante existente en vez de duplicarla", async () => {
    const { openCheckinFloatWindow } = await import("../floatWindow");
    await openCheckinFloatWindow();
    const existing = state.byLabel.get("checkin-float")!;
    state.constructorCalls = [];
    const result = await openCheckinFloatWindow();
    expect(result).toBe("focused");
    expect(state.constructorCalls).toHaveLength(0);
    expect(existing.show).toHaveBeenCalled();
    expect(existing.setFocus).toHaveBeenCalled();
  });

  it("NO abre la flotante si el kiosko está activo (exclusión mutua) y avisa con toast", async () => {
    pretendWindowExists("kiosk");
    const { openCheckinFloatWindow } = await import("../floatWindow");
    const result = await openCheckinFloatWindow();
    expect(result).toBe("blocked_by_kiosk");
    expect(state.constructorCalls).toHaveLength(0);
    expect(toastWarning).toHaveBeenCalled();
  });

  it("openKioskWindow se bloquea cuando la flotante está abierta (exclusión inversa)", async () => {
    pretendWindowExists("checkin-float");
    const { openKioskWindow } = await import("../kioskWindow");
    const result = await openKioskWindow();
    expect(result).toBe("blocked_by_float");
    expect(state.constructorCalls).toHaveLength(0);
    expect(toastWarning).toHaveBeenCalled();
  });

  it("restaura la posición persistida en localStorage al crear la ventana", async () => {
    window.localStorage.setItem(
      "tinta.window-pos.checkin-float",
      JSON.stringify({ x: 120, y: 80 }),
    );
    const { openCheckinFloatWindow } = await import("../floatWindow");
    await openCheckinFloatWindow();
    // jsdom reporta screen.availWidth/Height = 0 → el clamp se salta y la
    // posición guardada pasa tal cual (mismo fallback que un webview que
    // no reporte dimensiones).
    expect(state.constructorCalls[0].options).toMatchObject({ x: 120, y: 80 });
  });

  it("ignora una posición persistida corrupta", async () => {
    window.localStorage.setItem("tinta.window-pos.checkin-float", "{no-json");
    const { openCheckinFloatWindow } = await import("../floatWindow");
    await openCheckinFloatWindow();
    expect(state.constructorCalls[0].options).not.toHaveProperty("x");
    expect(state.constructorCalls[0].options).not.toHaveProperty("y");
  });

  it("clampToScreen reencuadra posiciones fuera de la pantalla actual", async () => {
    const { clampToScreen } = await import("../floatWindow");
    // Dentro de rango: intacta.
    expect(clampToScreen({ x: 100, y: 50 }, 1920, 1080)).toEqual({ x: 100, y: 50 });
    // Negativa (monitor secundario desconectado): a 0.
    expect(clampToScreen({ x: -500, y: -20 }, 1920, 1080)).toEqual({ x: 0, y: 0 });
    // Más allá del borde: deja margen agarrable dentro de la pantalla.
    const clamped = clampToScreen({ x: 99_999, y: 99_999 }, 1920, 1080);
    expect(clamped.x).toBeLessThanOrEqual(1920 - 60);
    expect(clamped.y).toBeLessThanOrEqual(1080 - 60);
  });

  it("fuera de Tauri abre /checkin-float como popup con nombre fijo", async () => {
    pretendInTauri(false);
    const openSpy = vi.spyOn(window, "open").mockImplementation(() => null);
    const { openCheckinFloatWindow, CHECKIN_FLOAT_WINDOW_LABEL } = await import(
      "../floatWindow"
    );
    const result = await openCheckinFloatWindow();
    expect(result).toBe("created");
    expect(state.constructorCalls).toHaveLength(0);
    expect(openSpy).toHaveBeenCalledWith(
      "/checkin-float",
      CHECKIN_FLOAT_WINDOW_LABEL,
      expect.stringContaining("width="),
    );
    openSpy.mockRestore();
  });

  it("isCheckinFloatWindowOpen refleja si la ventana existe", async () => {
    const { openCheckinFloatWindow, isCheckinFloatWindowOpen } = await import(
      "../floatWindow"
    );
    expect(await isCheckinFloatWindowOpen()).toBe(false);
    await openCheckinFloatWindow();
    expect(await isCheckinFloatWindowOpen()).toBe(true);
  });

  it("closeCheckinFloatWindow cierra la ventana existente", async () => {
    const { openCheckinFloatWindow, closeCheckinFloatWindow } = await import(
      "../floatWindow"
    );
    await openCheckinFloatWindow();
    const existing = state.byLabel.get("checkin-float")!;
    await closeCheckinFloatWindow();
    expect(existing.close).toHaveBeenCalled();
  });
});
