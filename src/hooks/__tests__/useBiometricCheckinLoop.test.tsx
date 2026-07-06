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
vi.mock("@/lib/api", () => ({
  api: {
    postFormData: (...args: unknown[]) => postFormData(...args),
    get: vi.fn(),
    post: vi.fn(),
  },
  ApiError: class ApiError extends Error {
    status = 500;
    code = "";
  },
}));

import { useBiometricCheckinLoop } from "../useBiometric";

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

describe("useBiometricCheckinLoop — suppressed", () => {
  beforeEach(() => {
    capturedSub = null;
    postFormData.mockReset();
    postFormData.mockResolvedValue(CHECKIN_EVENT);
  });

  it("con suppressed=true ignora el sample: ni POST al BE ni onCheckin", async () => {
    const onCheckin = vi.fn();
    renderHook(() =>
      useBiometricCheckinLoop({ enabled: true, suppressed: true, onCheckin }),
    );
    expect(capturedSub).not.toBeNull();

    fireSample();
    await act(async () => {});

    expect(postFormData).not.toHaveBeenCalled();
    expect(onCheckin).not.toHaveBeenCalled();
    // La suscripción sigue viva — suprimir NO es desuscribirse.
    expect(capturedSub?.enabled).toBe(true);
  });

  it("al quitar suppressed retoma el POST y el callback sin re-suscribir", async () => {
    const onCheckin = vi.fn();
    const { rerender } = renderHook(
      ({ suppressed }: { suppressed: boolean }) =>
        useBiometricCheckinLoop({ enabled: true, suppressed, onCheckin }),
      { initialProps: { suppressed: true } },
    );

    fireSample();
    await act(async () => {});
    expect(postFormData).not.toHaveBeenCalled();

    rerender({ suppressed: false });
    fireSample();
    await act(async () => {});

    expect(postFormData).toHaveBeenCalledTimes(1);
    expect(onCheckin).toHaveBeenCalledWith(CHECKIN_EVENT);
  });

  it("un sample suprimido no bloquea al siguiente (no toca el flag inflight)", async () => {
    const onCheckin = vi.fn();
    const { rerender } = renderHook(
      ({ suppressed }: { suppressed: boolean }) =>
        useBiometricCheckinLoop({ enabled: true, suppressed, onCheckin }),
      { initialProps: { suppressed: true } },
    );

    // Varios dedazos durante la supresión…
    fireSample();
    fireSample();
    await act(async () => {});

    // …y el primero real después de la supresión pasa completo.
    rerender({ suppressed: false });
    fireSample();
    await act(async () => {});
    expect(postFormData).toHaveBeenCalledTimes(1);
    expect(onCheckin).toHaveBeenCalledTimes(1);
  });
});
