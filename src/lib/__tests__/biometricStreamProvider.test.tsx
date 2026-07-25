import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { ReactNode } from "react";
import {
  BiometricStreamProvider,
  useBiometricClaim,
  useBiometricStreamStatus,
  useBiometricSubscription,
} from "../biometricStreamProvider";

// ── Tauri event bus mock ──────────────────────────────────────────────
// Espejo mínimo de @tauri-apps/api/event: listen/emit comparten un bus
// in-memory. Como un solo proceso de test simula UNA ventana, los
// emits de "esta ventana" llegan a sus propios listeners también — el
// provider ya filtra por holder == myLabel para ignorarlos, así que
// es exactamente el comportamiento real de Tauri.
type Listener = (e: { payload: unknown }) => void;
const listeners = new Map<string, Set<Listener>>();
const emitCalls: Array<{ event: string; payload: unknown }> = [];

function bus_listen(event: string, cb: Listener): () => void {
  if (!listeners.has(event)) listeners.set(event, new Set());
  listeners.get(event)!.add(cb);
  return () => listeners.get(event)?.delete(cb);
}

async function bus_emit(event: string, payload: unknown) {
  emitCalls.push({ event, payload });
  listeners.get(event)?.forEach((cb) => cb({ payload }));
}

vi.mock("@tauri-apps/api/event", () => ({
  listen: vi.fn(async (event: string, cb: Listener) => bus_listen(event, cb)),
  emit: vi.fn(async (event: string, payload: unknown) => bus_emit(event, payload)),
}));

// ── window label mock ─────────────────────────────────────────────────
// El provider importa getCurrentWebviewWindow() para conocer su label.
// Lo configuramos por test para simular ser la main o la kiosko window.
let currentLabel = "main";
vi.mock("@tauri-apps/api/webviewWindow", () => ({
  getCurrentWebviewWindow: () => ({ label: currentLabel }),
}));

// ── isTauri mock ──────────────────────────────────────────────────────
// Por defecto activamos el path Tauri en los tests porque ese es el
// camino de producción. Tests que quieran probar el non-Tauri path lo
// override-ean explícitamente.
vi.mock("@/lib/utils", async () => {
  const actual = await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils");
  return {
    ...actual,
    isTauri: () => true,
  };
});

// ── biometric module mock ─────────────────────────────────────────────
// Capturamos el último set de handlers y el stop fn para que los tests
// puedan disparar onSample/onDeviceConnected/etc imitando al SDK.
interface CapturedStreamHandlers {
  onSample?: (png: Uint8Array, q: number) => void;
  onDeviceConnected?: () => void;
  onDeviceDisconnected?: () => void;
  onError?: (err: { code: string }) => void;
}
let lastStreamHandlers: CapturedStreamHandlers | null = null;
const stopMock = vi.fn(async () => {});
const startCaptureStreamMock = vi.fn(
  async (handlers: CapturedStreamHandlers) => {
    lastStreamHandlers = handlers;
    return { stop: stopMock };
  },
);

// Mock TODO el módulo biometric — importActual cargaría el SDK real de
// DigitalPersona que tiene un `?url` import no resoluble en tests. Sólo
// re-exportamos lo que el provider necesita; los tests no tocan
// captureOnePng ni isReaderConnected.
vi.mock("../biometric", () => {
  class BiometricError extends Error {
    constructor(public code: string, message: string) {
      super(message);
      this.name = "BiometricError";
    }
  }
  return {
    startCaptureStream: (h: CapturedStreamHandlers) => startCaptureStreamMock(h),
    BiometricError,
    ENROLL_QUALITY_FLOOR: 60,
    CHECKIN_QUALITY_FLOOR: 40,
    captureOnePng: vi.fn(),
    isReaderConnected: vi.fn(),
  };
});

function wrapper({ children }: { children: ReactNode }) {
  return <BiometricStreamProvider>{children}</BiometricStreamProvider>;
}

function wrapperAlwaysOn({ children }: { children: ReactNode }) {
  return <BiometricStreamProvider alwaysOn>{children}</BiometricStreamProvider>;
}

describe("BiometricStreamProvider", () => {
  beforeEach(() => {
    listeners.clear();
    emitCalls.length = 0;
    lastStreamHandlers = null;
    stopMock.mockClear();
    startCaptureStreamMock.mockClear();
    currentLabel = "main";
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  // ─────────────────────────────────────────────────────────────────────
  // Subscriber lifecycle
  // ─────────────────────────────────────────────────────────────────────

  it("no arranca stream si no hay subscribers y no es alwaysOn", async () => {
    renderHook(() => useBiometricStreamStatus(), { wrapper });
    // Damos tiempo a label-resolution + IPC mount-effect.
    await vi.waitFor(() => {
      // El provider está labelReady; sin subs no debió pedir el stream.
      expect(startCaptureStreamMock).not.toHaveBeenCalled();
    });
  });

  it("arranca stream cuando un subscriber se monta", async () => {
    const onSample = vi.fn();
    renderHook(() => useBiometricSubscription({ enabled: true, onSample }), {
      wrapper,
    });
    await vi.waitFor(() => {
      expect(startCaptureStreamMock).toHaveBeenCalledTimes(1);
    });
  });

  it("para el stream cuando el último subscriber se desuscribe", async () => {
    const { unmount } = renderHook(
      () => useBiometricSubscription({ enabled: true, onSample: vi.fn() }),
      { wrapper },
    );
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalledTimes(1));
    unmount();
    await vi.waitFor(() => {
      // El cleanup del effect llama stream.stop().
      expect(stopMock).toHaveBeenCalled();
    });
  });

  it("multiplexea samples a múltiples subscribers simultáneos", async () => {
    // Los dos subscribers tienen que vivir DENTRO del mismo provider —
    // renderHook con dos calls separados crea dos providers
    // independientes. Hacemos un hook compuesto.
    const a = vi.fn();
    const b = vi.fn();
    renderHook(
      () => {
        useBiometricSubscription({ enabled: true, onSample: a });
        useBiometricSubscription({ enabled: true, onSample: b });
      },
      { wrapper },
    );
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalled());

    const png = new Uint8Array([1, 2, 3]);
    act(() => lastStreamHandlers?.onSample?.(png, 75));

    expect(a).toHaveBeenCalledWith(png, 75);
    expect(b).toHaveBeenCalledWith(png, 75);
    // El stream debe haber arrancado UNA sola vez, no una por subscriber
    // — esa es la razón del provider.
    expect(startCaptureStreamMock).toHaveBeenCalledTimes(1);
  });

  it("watchdog: CommunicationFailed mid-stream suelta el stream muerto y re-arranca con backoff", async () => {
    renderHook(
      () => useBiometricSubscription({ enabled: true, onSample: vi.fn() }),
      { wrapper },
    );
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    // El canal murió con el stream "running" (agente reiniciado, socket
    // caído). Antes esto era silencio: status verde y lector sordo.
    act(() => {
      lastStreamHandlers?.onError?.({ code: "lite_client_unreachable" });
    });
    expect(stopMock).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(startCaptureStreamMock).toHaveBeenCalledTimes(2);
    vi.useRealTimers();
  });

  it("watchdog: errores no fatales (sdk_error) NO reinician el stream", async () => {
    renderHook(
      () => useBiometricSubscription({ enabled: true, onSample: vi.fn() }),
      { wrapper },
    );
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalledTimes(1));

    vi.useFakeTimers();
    act(() => {
      lastStreamHandlers?.onError?.({ code: "sdk_error" });
    });
    expect(stopMock).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(2_100);
    });
    expect(startCaptureStreamMock).toHaveBeenCalledTimes(1);
    vi.useRealTimers();
  });

  it("alwaysOn mantiene el stream encendido sin subscribers", async () => {
    renderHook(() => useBiometricStreamStatus(), { wrapper: wrapperAlwaysOn });
    await vi.waitFor(() => {
      expect(startCaptureStreamMock).toHaveBeenCalledTimes(1);
    });
  });

  it("la ventana etiquetada 'kiosk' deduce alwaysOn aunque no se pase la prop", async () => {
    currentLabel = "kiosk";
    renderHook(() => useBiometricStreamStatus(), { wrapper });
    await vi.waitFor(() => {
      expect(startCaptureStreamMock).toHaveBeenCalledTimes(1);
    });
  });

  // ─────────────────────────────────────────────────────────────────────
  // Claim / release semantics
  // ─────────────────────────────────────────────────────────────────────

  it("claim local pausa el stream y emite Tauri claim:acquire", async () => {
    const { result } = renderHook(
      () => ({
        claim: useBiometricClaim(),
        sub: useBiometricSubscription({ enabled: true, onSample: vi.fn() }),
      }),
      { wrapper },
    );
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalledTimes(1));
    stopMock.mockClear();

    let release: (() => Promise<void>) | undefined;
    await act(async () => {
      release = await result.current.claim();
    });

    // Stream pausado en HW.
    await vi.waitFor(() => expect(stopMock).toHaveBeenCalled());
    // Status reflejado.
    expect(result.current.sub.status).toBe("paused_by_enroll");
    // Evento Tauri emitido para coordinar con otras ventanas.
    const acquireEmits = emitCalls.filter((c) => c.event === "biometric:claim:acquire");
    expect(acquireEmits.length).toBeGreaterThan(0);
    expect(acquireEmits[acquireEmits.length - 1].payload).toMatchObject({
      holder: "main",
    });

    // Release: reanuda stream + emite claim:release.
    startCaptureStreamMock.mockClear();
    await act(async () => {
      await release!();
    });
    await vi.waitFor(() => {
      expect(startCaptureStreamMock).toHaveBeenCalledTimes(1);
    });
    const releaseEmits = emitCalls.filter((c) => c.event === "biometric:claim:release");
    expect(releaseEmits.length).toBeGreaterThan(0);
  });

  it("release sólo dispara una vez aunque se invoque dos veces", async () => {
    const { result } = renderHook(
      () => ({
        claim: useBiometricClaim(),
        sub: useBiometricSubscription({ enabled: true, onSample: vi.fn() }),
      }),
      { wrapper },
    );
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalled());

    let release: (() => Promise<void>) | undefined;
    await act(async () => {
      release = await result.current.claim();
    });

    emitCalls.length = 0;
    await act(async () => {
      await release!();
      await release!(); // doble release intencional
    });

    const releaseEmits = emitCalls.filter((c) => c.event === "biometric:claim:release");
    // Un solo release emitido — el segundo es no-op.
    expect(releaseEmits.length).toBe(1);
  });

  it("claim:acquire de OTRA ventana pausa el stream local", async () => {
    const { result } = renderHook(
      () => useBiometricSubscription({ enabled: true, onSample: vi.fn() }),
      { wrapper },
    );
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalled());
    stopMock.mockClear();

    // Simular que la ventana "kiosk" tomó claim (nuestro provider está
    // en main por currentLabel="main").
    await act(async () => {
      await bus_emit("biometric:claim:acquire", { holder: "kiosk" });
    });

    await vi.waitFor(() => expect(stopMock).toHaveBeenCalled());
    expect(result.current.status).toBe("paused_by_enroll");
  });

  it("claim:release de la ventana remota reanuda el stream", async () => {
    renderHook(() => useBiometricSubscription({ enabled: true, onSample: vi.fn() }), {
      wrapper,
    });
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalled());

    // Otra ventana toma claim → pausa.
    await act(async () => {
      await bus_emit("biometric:claim:acquire", { holder: "kiosk" });
    });
    await vi.waitFor(() => expect(stopMock).toHaveBeenCalled());
    startCaptureStreamMock.mockClear();

    // Y luego la suelta → reanuda.
    await act(async () => {
      await bus_emit("biometric:claim:release", { holder: "kiosk" });
    });
    await vi.waitFor(() => {
      expect(startCaptureStreamMock).toHaveBeenCalledTimes(1);
    });
  });

  it("ignora claim:acquire emitido por uno mismo (Tauri echoes back)", async () => {
    const { result } = renderHook(
      () => ({
        claim: useBiometricClaim(),
        sub: useBiometricSubscription({ enabled: true, onSample: vi.fn() }),
      }),
      { wrapper },
    );
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalled());

    // claim() local incrementa localClaimCount; el emit dispara el listener
    // que vería holder=="main". El provider debe ignorarlo (de lo contrario
    // contaría como remoto + local = claims duplicados que jamás se sueltan).
    let release: (() => Promise<void>) | undefined;
    await act(async () => {
      release = await result.current.claim();
    });

    // Cuando soltamos, debe volver a running, no quedarse en pause por
    // el "remoto" fantasma.
    startCaptureStreamMock.mockClear();
    await act(async () => {
      await release!();
    });
    await vi.waitFor(() => {
      expect(startCaptureStreamMock).toHaveBeenCalledTimes(1);
    });
    expect(result.current.sub.status).toBe("running");
  });

  it("window-destroyed libera claims huérfanos del holder", async () => {
    renderHook(() => useBiometricSubscription({ enabled: true, onSample: vi.fn() }), {
      wrapper,
    });
    await vi.waitFor(() => expect(startCaptureStreamMock).toHaveBeenCalled());

    // Otra ventana toma claim pero "crashea" sin emitir release.
    await act(async () => {
      await bus_emit("biometric:claim:acquire", { holder: "kiosk" });
    });
    await vi.waitFor(() => expect(stopMock).toHaveBeenCalled());

    // El runtime de Tauri emite window-destroyed con el label de la ventana.
    startCaptureStreamMock.mockClear();
    await act(async () => {
      await bus_emit("tauri://window-destroyed", "kiosk");
    });

    // El provider liberó al holder huérfano y arrancó el stream de vuelta.
    await vi.waitFor(() => {
      expect(startCaptureStreamMock).toHaveBeenCalledTimes(1);
    });
  });

  it("claim:query en mount: si OTRA ventana tiene un claim activo, respondemos NO si no tenemos", async () => {
    // Provider sin claim local → no debe responder a claim:query (silencio
    // = no holding). Validamos contando emits de claim:state.
    renderHook(() => useBiometricStreamStatus(), { wrapper });
    await vi.waitFor(() => true);
    emitCalls.length = 0;

    await act(async () => {
      await bus_emit("biometric:claim:query", { from: "kiosk" });
    });

    const stateEmits = emitCalls.filter((c) => c.event === "biometric:claim:state");
    expect(stateEmits.length).toBe(0);
  });

  it("claim:query en mount: si tenemos claim local, respondemos con claim:state", async () => {
    const { result } = renderHook(() => useBiometricClaim(), { wrapper });
    await vi.waitFor(() => true);

    await act(async () => {
      await result.current();
    });

    emitCalls.length = 0;
    await act(async () => {
      await bus_emit("biometric:claim:query", { from: "kiosk" });
    });

    const stateEmits = emitCalls.filter((c) => c.event === "biometric:claim:state");
    expect(stateEmits.length).toBe(1);
    expect(stateEmits[0].payload).toMatchObject({ holders: ["main"] });
  });
});
