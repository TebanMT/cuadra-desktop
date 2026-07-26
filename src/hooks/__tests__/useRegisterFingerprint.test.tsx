import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { BioEventWire, BioEnrollWire } from "@/lib/biometricEvents";

// ── mock del provider SSE: capturamos el handler del hook ──────────────
let eventsHandler: ((evt: BioEventWire) => void) | null = null;
vi.mock("@/lib/biometricEventsProvider", () => ({
  BIOMETRIC_STATUS_KEY: ["biometric", "status"],
  useBiometricEvents: (h: (evt: BioEventWire) => void) => {
    eventsHandler = h;
  },
  useBiometricEnrolling: () => false,
}));

// ── mock de la API HTTP (enroll/start + enroll/cancel) ─────────────────
// vi.hoisted: la factory de vi.mock se iza al tope del archivo, así que lo
// que referencia debe izarse junto con ella.
const { postMock, ApiErrorMock } = vi.hoisted(() => {
  class ApiErrorMock extends Error {
    constructor(
      public status: number,
      public code: string,
      message: string,
      public details?: unknown,
    ) {
      super(message);
      this.name = "ApiError";
    }
  }
  return { postMock: vi.fn(), ApiErrorMock };
});
vi.mock("@/lib/api", () => ({
  api: {
    get: vi.fn(),
    post: (...args: unknown[]) => postMock(...args),
  },
  ApiError: ApiErrorMock,
}));

import { useRegisterFingerprint } from "../useBiometric";

const SESSION = {
  session_id: "s-1",
  member_id: "m-1",
  expires_at: "2026-07-26T10:01:00Z",
  required_samples: 3,
};

function enrollWire(overrides: Partial<BioEnrollWire> = {}): BioEnrollWire {
  return {
    session_id: "s-1",
    member_id: "m-1",
    captured: 0,
    required: 3,
    ...overrides,
  };
}

function fire(evt: Partial<BioEventWire> & { type: BioEventWire["type"] }) {
  act(() =>
    eventsHandler!({ timestamp: "2026-07-26T10:00:00Z", ...evt } as BioEventWire),
  );
}

describe("useRegisterFingerprint", () => {
  const onSuccess = vi.fn();
  const onError = vi.fn();
  let qc: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }

  function renderFp() {
    return renderHook(() => useRegisterFingerprint("m-1", { onSuccess, onError }), {
      wrapper,
    });
  }

  beforeEach(() => {
    eventsHandler = null;
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    vi.clearAllMocks();
    postMock.mockResolvedValue(SESSION);
  });

  it("start abre la sesión con member_id + consent y el progreso llega por SSE", async () => {
    const { result } = renderFp();
    expect(result.current.progress.status).toBe("idle");

    await act(async () => {
      await result.current.start();
    });
    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/biometric/enroll/start",
      { member_id: "m-1", consent_accepted: true },
      { retry: 0 },
    );
    expect(result.current.progress).toMatchObject({
      status: "waiting",
      captures_done: 0,
      captures_total: 3,
    });

    fire({ type: "enroll_started", enroll: enrollWire({ captured: 0 }) });
    fire({ type: "enroll_progress", enroll: enrollWire({ captured: 1 }) });
    expect(result.current.progress).toMatchObject({
      status: "waiting",
      captures_done: 1,
    });

    fire({ type: "enroll_progress", enroll: enrollWire({ captured: 2 }) });
    // Con los 3 dedazos el sidecar combina y persiste → "capturing".
    fire({ type: "enroll_progress", enroll: enrollWire({ captured: 3 }) });
    expect(result.current.progress).toMatchObject({
      status: "capturing",
      captures_done: 3,
    });

    fire({
      type: "enroll_completed",
      enroll: enrollWire({ captured: 3, fingerprint_ids: ["f1", "f2", "f3"] }),
    });
    expect(result.current.progress.status).toBe("success");
    expect(onSuccess).toHaveBeenCalledTimes(1);
  });

  it("enroll_completed invalida el cache de members (has_fingerprint cambió)", async () => {
    const invalidate = vi.spyOn(qc, "invalidateQueries");
    const { result } = renderFp();
    await act(async () => {
      await result.current.start();
    });
    fire({ type: "enroll_completed", enroll: enrollWire({ captured: 3 }) });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["members"] });
  });

  it("colisión: mapea el contrato fingerprint_collision con el socio existente", async () => {
    const { result } = renderFp();
    await act(async () => {
      await result.current.start();
    });
    fire({
      type: "enroll_failed",
      code: "fingerprint_collision",
      enroll: enrollWire({
        captured: 1,
        existing_member_id: "m-9",
        existing_member_name: "Luis Ramos",
      }),
    });
    expect(result.current.progress).toMatchObject({
      status: "failed",
      error: "collision",
      collisionMember: { id: "m-9", name: "Luis Ramos" },
    });
    expect(onError).toHaveBeenCalledWith("collision");
  });

  it("timeout de la sesión (60s sin completar) mapea a error 'timeout'", async () => {
    const { result } = renderFp();
    await act(async () => {
      await result.current.start();
    });
    fire({ type: "enroll_failed", code: "timeout", enroll: enrollWire({ captured: 1 }) });
    expect(result.current.progress).toMatchObject({
      status: "failed",
      error: "timeout",
    });
    expect(onError).toHaveBeenCalledWith("timeout");
  });

  it("enroll_failed cancelled regresa a idle sin marcar error (cancel propio)", async () => {
    const { result } = renderFp();
    await act(async () => {
      await result.current.start();
    });
    fire({ type: "enroll_failed", code: "cancelled", enroll: enrollWire() });
    expect(result.current.progress.status).toBe("idle");
    expect(onError).not.toHaveBeenCalled();
  });

  it("ignora eventos de una sesión ajena", async () => {
    const { result } = renderFp();
    await act(async () => {
      await result.current.start();
    });
    fire({
      type: "enroll_progress",
      enroll: enrollWire({ session_id: "s-otra", captured: 2 }),
    });
    expect(result.current.progress.captures_done).toBe(0);
  });

  it("si el POST responde después del enroll_started, adopta la sesión igual", async () => {
    // Simula la carrera SSE-gana-al-202: el evento llega mientras el POST
    // sigue en vuelo.
    let resolvePost: (v: unknown) => void;
    postMock.mockImplementationOnce(
      () => new Promise((r) => (resolvePost = r)),
    );
    const { result } = renderFp();

    let startPromise: Promise<void>;
    act(() => {
      startPromise = result.current.start();
    });
    fire({ type: "enroll_started", enroll: enrollWire() });
    fire({ type: "enroll_progress", enroll: enrollWire({ captured: 1 }) });
    expect(result.current.progress.captures_done).toBe(1);

    await act(async () => {
      resolvePost!(SESSION);
      await startPromise!;
    });
    // La respuesta tardía no pisa el progreso que ya llegó por SSE.
    expect(result.current.progress).toMatchObject({
      status: "waiting",
      captures_done: 1,
      captures_total: 3,
    });
  });

  it("409 (sesión huérfana) cancela y reintenta el start UNA vez", async () => {
    postMock
      .mockRejectedValueOnce(
        new ApiErrorMock(409, "enroll_session_active", "sesión activa"),
      )
      .mockResolvedValueOnce({ cancelled: true })
      .mockResolvedValueOnce(SESSION);
    const { result } = renderFp();
    await act(async () => {
      await result.current.start();
    });
    expect(postMock.mock.calls.map((c) => c[0])).toEqual([
      "/api/v1/biometric/enroll/start",
      "/api/v1/biometric/enroll/cancel",
      "/api/v1/biometric/enroll/start",
    ]);
    expect(result.current.progress.status).toBe("waiting");
  });

  it("sidecar sin lector (503) mapea a error 'reader'", async () => {
    postMock.mockRejectedValueOnce(
      new ApiErrorMock(503, "reader_unavailable", "sin lector"),
    );
    const { result } = renderFp();
    await act(async () => {
      await result.current.start();
    });
    expect(result.current.progress).toMatchObject({
      status: "failed",
      error: "reader",
    });
    expect(onError).toHaveBeenCalledWith("reader");
  });

  it("cancel() con sesión activa avisa al sidecar", async () => {
    const { result } = renderFp();
    await act(async () => {
      await result.current.start();
    });
    postMock.mockClear();
    act(() => result.current.cancel());
    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/biometric/enroll/cancel",
      undefined,
      { retry: 0 },
    );
    // La sesión quedó cerrada localmente: el enroll_failed(cancelled) que
    // rebote por SSE ya no nos toca.
    fire({ type: "enroll_failed", code: "cancelled", enroll: enrollWire() });
    expect(result.current.progress.status).toBe("waiting"); // sin cambios
  });

  it("desmontar la superficie cancela la sesión (no deja el check-in pausado 60s)", async () => {
    const { result, unmount } = renderFp();
    await act(async () => {
      await result.current.start();
    });
    postMock.mockClear();
    unmount();
    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/biometric/enroll/cancel",
      undefined,
      { retry: 0 },
    );
  });

  it("cancel() sin sesión no manda nada", () => {
    renderFp();
    act(() => {
      // sin start previo
    });
    expect(postMock).not.toHaveBeenCalledWith(
      "/api/v1/biometric/enroll/cancel",
      undefined,
      { retry: 0 },
    );
  });
});
