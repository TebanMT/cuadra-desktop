import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";

// ── provider mock ─────────────────────────────────────────────────────
// Aislamos el loop del BiometricStreamProvider real: capturamos el
// subscriber que registra para dispararle samples a mano, imitando lo que
// el provider haría al recibir un dedazo del SDK.
interface CapturedSub {
  enabled?: boolean;
  onSample?: (png: Uint8Array, q: number) => void;
}
let capturedSub: CapturedSub | null = null;

vi.mock("@/lib/biometricStreamProvider", () => ({
  useBiometricSubscription: (handlers: CapturedSub) => {
    capturedSub = handlers;
    return { status: "running" };
  },
  useBiometricClaim: () => async () => async () => {},
}));

// El módulo biometric real carga el SDK de DigitalPersona vía `?url`
// (irresoluble en vitest) — mock mínimo de lo que useBiometric.ts importa.
vi.mock("@/lib/biometric", () => {
  class BiometricError extends Error {
    constructor(public code: string, message: string) {
      super(message);
    }
  }
  return {
    BiometricError,
    captureOnePng: vi.fn(),
    isReaderConnected: vi.fn(async () => true),
    ENROLL_QUALITY_FLOOR: 60,
  };
});

const postFormData = vi.fn();
vi.mock("@/lib/api", async () => {
  // ApiError real (clase pura, sin I/O) + api mockeada. Así el instanceof
  // del hook y los constructores de los tests usan la misma clase.
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ApiError: actual.ApiError,
    api: {
      postFormData: (...args: unknown[]) => postFormData(...args),
      get: vi.fn(),
      post: vi.fn(),
    },
  };
});

import { useBiometricCheckinLoop } from "../useBiometric";
import { ApiError } from "@/lib/api";

const CHECKIN_EVENT = {
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

function fireSample() {
  act(() => {
    capturedSub?.onSample?.(new Uint8Array([1, 2, 3]), 80);
  });
}

describe("useBiometricCheckinLoop", () => {
  beforeEach(() => {
    capturedSub = null;
    postFormData.mockReset();
    postFormData.mockResolvedValue(CHECKIN_EVENT);
  });

  it("cada sample POST-ea a /biometric/checkin y entrega el evento a onCheckin", async () => {
    const onCheckin = vi.fn();
    renderHook(() => useBiometricCheckinLoop({ enabled: true, onCheckin }));
    expect(capturedSub?.enabled).toBe(true);

    fireSample();
    await act(async () => {});

    expect(postFormData).toHaveBeenCalledTimes(1);
    expect(postFormData.mock.calls[0][0]).toBe("/api/v1/biometric/checkin");
    expect(onCheckin).toHaveBeenCalledWith(CHECKIN_EVENT);
  });

  it("serializa POSTs inflight: un dedazo doble no genera dos check-ins", async () => {
    // El POST queda colgado hasta que lo resolvamos a mano.
    let resolvePost: ((v: unknown) => void) | undefined;
    postFormData.mockImplementation(
      () => new Promise((r) => (resolvePost = r)),
    );
    const onCheckin = vi.fn();
    renderHook(() => useBiometricCheckinLoop({ enabled: true, onCheckin }));

    fireSample();
    fireSample(); // segundo dedazo con el primero aún en vuelo
    expect(postFormData).toHaveBeenCalledTimes(1);

    await act(async () => {
      resolvePost!(CHECKIN_EVENT);
    });
    expect(onCheckin).toHaveBeenCalledTimes(1);

    // Con el inflight liberado, el siguiente sample sí procesa.
    postFormData.mockResolvedValue(CHECKIN_EVENT);
    fireSample();
    await act(async () => {});
    expect(postFormData).toHaveBeenCalledTimes(2);
  });

  it("un ApiError no-503 se reporta como no-match (el BE no identificó a nadie)", async () => {
    postFormData.mockRejectedValue(new ApiError(404, "no_match", "no match"));
    const onCheckin = vi.fn();
    const onNoMatch = vi.fn();
    renderHook(() =>
      useBiometricCheckinLoop({ enabled: true, onCheckin, onNoMatch }),
    );

    fireSample();
    await act(async () => {});

    expect(onNoMatch).toHaveBeenCalledTimes(1);
    expect(onCheckin).not.toHaveBeenCalled();
  });

  it("enabled=false apaga la suscripción (el provider decide si el stream sigue)", () => {
    renderHook(() =>
      useBiometricCheckinLoop({ enabled: false, onCheckin: vi.fn() }),
    );
    expect(capturedSub?.enabled).toBe(false);
  });
});
