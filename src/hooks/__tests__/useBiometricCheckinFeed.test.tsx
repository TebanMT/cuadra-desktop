import { describe, it, expect, vi, beforeEach } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { ReactNode } from "react";
import type { BioEventWire } from "@/lib/biometricEvents";
import type { CheckinEvent } from "@/hooks/useCheckin";

// ── mock del provider: capturamos el handler y simulamos el wire ───────
let eventsHandler: ((evt: BioEventWire) => void) | null = null;
let eventsEnabled: boolean | undefined;
let enrolling = false;
vi.mock("@/lib/biometricEventsProvider", () => ({
  BIOMETRIC_STATUS_KEY: ["biometric", "status"],
  useBiometricEvents: (
    h: (evt: BioEventWire) => void,
    opts?: { enabled?: boolean },
  ) => {
    eventsHandler = h;
    eventsEnabled = opts?.enabled;
  },
  useBiometricEnrolling: () => enrolling,
}));

vi.mock("@/lib/api", () => ({
  // get pendiente eterno: useBiometricStatus lee del query cache que el
  // test pre-carga, sin red.
  api: { get: vi.fn(() => new Promise(() => {})), post: vi.fn() },
  ApiError: class ApiError extends Error {},
}));

import {
  BIOMETRIC_STATUS_KEY,
  useBiometricCheckinFeed,
  useReaderMissing,
} from "../useBiometric";

function makeCheckin(overrides: Partial<CheckinEvent> = {}): CheckinEvent {
  return {
    id: "chk-1",
    result: "allowed_active",
    method: "fingerprint",
    member_id: "m-1",
    member_name: "Ana López",
    expiry_date: "2026-08-01",
    days_until_expiry: 26,
    manual_override: false,
    created_at: "2026-07-26T10:00:00Z",
    ...overrides,
  };
}

function wireEvent(overrides: Partial<BioEventWire>): BioEventWire {
  return { type: "checkin_no_match", timestamp: "2026-07-26T10:00:00Z", ...overrides };
}

describe("useBiometricCheckinFeed", () => {
  const onAttempt = vi.fn();
  const onCheckin = vi.fn();
  const onNoMatch = vi.fn();
  const onSampleRejected = vi.fn();
  const onError = vi.fn();

  beforeEach(() => {
    eventsHandler = null;
    eventsEnabled = undefined;
    enrolling = false;
    vi.clearAllMocks();
  });

  function renderFeed(enabled?: boolean) {
    return renderHook(() =>
      useBiometricCheckinFeed({
        enabled,
        onAttempt,
        onCheckin,
        onNoMatch,
        onSampleRejected,
        onError,
      }),
    );
  }

  it("mapea cada tipo de evento al callback correcto", () => {
    renderFeed();
    const ev = makeCheckin();
    act(() => {
      eventsHandler!(wireEvent({ type: "checkin_attempt_started" }));
      eventsHandler!(wireEvent({ type: "checkin_result", checkin: ev }));
      eventsHandler!(wireEvent({ type: "checkin_no_match" }));
      eventsHandler!(wireEvent({ type: "checkin_error", message: "helper caído" }));
      eventsHandler!(wireEvent({ type: "sample_rejected", code: "low_quality" }));
    });
    expect(onAttempt).toHaveBeenCalledTimes(1);
    expect(onCheckin).toHaveBeenCalledWith(ev);
    expect(onNoMatch).toHaveBeenCalledTimes(1);
    expect(onError).toHaveBeenCalledWith("helper caído");
    expect(onSampleRejected).toHaveBeenCalledTimes(1);
  });

  it("checkin_result sin payload no explota ni llama onCheckin", () => {
    renderFeed();
    act(() => eventsHandler!(wireEvent({ type: "checkin_result" })));
    expect(onCheckin).not.toHaveBeenCalled();
  });

  it("ignora eventos de enroll y de lector (no son del feed de check-in)", () => {
    renderFeed();
    act(() => {
      eventsHandler!(wireEvent({ type: "reader_disconnected" }));
      eventsHandler!(
        wireEvent({
          type: "enroll_progress",
          enroll: { session_id: "s", member_id: "m", captured: 1, required: 3 },
        }),
      );
    });
    expect(onAttempt).not.toHaveBeenCalled();
    expect(onCheckin).not.toHaveBeenCalled();
    expect(onError).not.toHaveBeenCalled();
  });

  it("suprime sample_rejected mientras hay enroll activo (esos dedazos son de recepción)", () => {
    enrolling = true;
    renderFeed();
    act(() => eventsHandler!(wireEvent({ type: "sample_rejected" })));
    expect(onSampleRejected).not.toHaveBeenCalled();
  });

  it("propaga enabled=false a la suscripción del provider", () => {
    renderFeed(false);
    expect(eventsEnabled).toBe(false);
  });
});

describe("useReaderMissing", () => {
  const READER_SEEN_KEY = "tinta.bio.reader_seen";
  let qc: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }

  function renderWithStatus(status: { connected: boolean; available: boolean } | null) {
    qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    if (status) qc.setQueryData(BIOMETRIC_STATUS_KEY, status);
    return renderHook(() => useReaderMissing(), { wrapper });
  }

  beforeEach(() => {
    window.localStorage.removeItem(READER_SEEN_KEY);
  });

  it("una PC que jamás ha visto lector NO avisa (gym que opera por número)", () => {
    const { result } = renderWithStatus({ connected: false, available: false });
    expect(result.current).toBe(false);
  });

  it("con lector conectado no avisa y deja marcada la PC", () => {
    const { result } = renderWithStatus({ connected: true, available: true });
    expect(result.current).toBe(false);
    expect(window.localStorage.getItem(READER_SEEN_KEY)).toBe("1");
  });

  it("si la PC ya tuvo lector y hoy no responde, avisa — aunque la app haya reiniciado", () => {
    // La marca vive en localStorage: simula una sesión previa con lector.
    window.localStorage.setItem(READER_SEEN_KEY, "1");
    const { result } = renderWithStatus({ connected: false, available: false });
    expect(result.current).toBe(true);
  });

  it("sin snapshot todavía no afirma nada", () => {
    window.localStorage.setItem(READER_SEEN_KEY, "1");
    const { result } = renderWithStatus(null);
    expect(result.current).toBe(false);
  });
});
