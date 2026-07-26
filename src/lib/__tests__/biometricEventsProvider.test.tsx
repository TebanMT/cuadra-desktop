import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type {
  BioEventWire,
  BiometricEventsHandlers,
} from "@/lib/biometricEvents";
import { useAuthStore, type AuthUser } from "@/stores/useAuthStore";

// ── mock del cliente SSE: capturamos los handlers y simulamos el wire ──
let captured: BiometricEventsHandlers | null = null;
const closeFn = vi.fn();
const connectMock = vi.fn((handlers: BiometricEventsHandlers) => {
  captured = handlers;
  return { close: closeFn };
});
vi.mock("@/lib/biometricEvents", () => ({
  connectBiometricEvents: (h: BiometricEventsHandlers) => connectMock(h),
}));

import {
  BIOMETRIC_STATUS_KEY,
  BiometricEventsProvider,
  useBiometricEnrolling,
  useBiometricEvents,
  useBiometricLive,
  type BiometricStatus,
} from "../biometricEventsProvider";

const OPERATOR: AuthUser = {
  user_id: "u-1",
  full_name: "Operador Uno",
  email: "op@gym.mx",
  phone: null,
  role: "operator",
  has_pin: false,
};

function makeEvent(overrides: Partial<BioEventWire> = {}): BioEventWire {
  return {
    type: "checkin_no_match",
    timestamp: "2026-07-26T10:00:00Z",
    ...overrides,
  };
}

// Consumer de prueba: expone live/enrolling en el DOM y colecta eventos.
const received: BioEventWire[] = [];
function Probe({ enabled = true }: { enabled?: boolean }) {
  useBiometricEvents((evt) => received.push(evt), { enabled });
  const live = useBiometricLive();
  const enrolling = useBiometricEnrolling();
  return (
    <div>
      <span data-testid="live">{String(live)}</span>
      <span data-testid="enrolling">{String(enrolling)}</span>
    </div>
  );
}

function renderProvider(ui: React.ReactNode = <Probe />) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  const utils = render(
    <QueryClientProvider client={qc}>
      <BiometricEventsProvider>{ui}</BiometricEventsProvider>
    </QueryClientProvider>,
  );
  return { qc, ...utils };
}

describe("BiometricEventsProvider", () => {
  beforeEach(() => {
    captured = null;
    received.length = 0;
    connectMock.mockClear();
    closeFn.mockClear();
    useAuthStore.setState({ user: OPERATOR });
  });

  it("sin sesión iniciada NO abre conexión (el endpoint es autenticado)", () => {
    useAuthStore.setState({ user: null });
    renderProvider();
    expect(connectMock).not.toHaveBeenCalled();
    expect(screen.getByTestId("live").textContent).toBe("false");
  });

  it("con sesión abre la conexión y live sigue el open/down del stream", () => {
    renderProvider();
    expect(connectMock).toHaveBeenCalledTimes(1);
    expect(screen.getByTestId("live").textContent).toBe("false");

    act(() => captured!.onOpen?.());
    expect(screen.getByTestId("live").textContent).toBe("true");

    act(() => captured!.onDown?.());
    expect(screen.getByTestId("live").textContent).toBe("false");
  });

  it("reparte los eventos a los suscriptores; enabled=false silencia", () => {
    const { rerender, qc } = renderProvider(<Probe enabled />);
    const evt = makeEvent();
    act(() => captured!.onEvent?.(evt));
    expect(received).toEqual([evt]);

    rerender(
      <QueryClientProvider client={qc}>
        <BiometricEventsProvider>
          <Probe enabled={false} />
        </BiometricEventsProvider>
      </QueryClientProvider>,
    );
    act(() => captured!.onEvent?.(makeEvent()));
    expect(received).toHaveLength(1);
  });

  it("el snapshot status aterriza en el query cache de /biometric/status", () => {
    const { qc } = renderProvider();
    act(() =>
      captured!.onStatus?.({
        connected: true,
        available: true,
        enrolling: false,
        model: "U.are.U 4500",
      }),
    );
    const cached = qc.getQueryData<BiometricStatus>(BIOMETRIC_STATUS_KEY);
    expect(cached).toMatchObject({
      connected: true,
      available: true,
      model: "U.are.U 4500",
    });
  });

  it("reader_disconnected apaga connected y available al instante (sin esperar el poll)", () => {
    const { qc } = renderProvider();
    act(() => captured!.onStatus?.({ connected: true, available: true }));
    act(() =>
      captured!.onEvent?.(makeEvent({ type: "reader_disconnected" })),
    );
    expect(qc.getQueryData<BiometricStatus>(BIOMETRIC_STATUS_KEY)).toMatchObject({
      connected: false,
      available: false,
    });

    act(() => captured!.onEvent?.(makeEvent({ type: "reader_connected" })));
    expect(qc.getQueryData<BiometricStatus>(BIOMETRIC_STATUS_KEY)).toMatchObject({
      connected: true,
      available: true,
    });
  });

  it("enroll_started/enroll_failed prenden y apagan `enrolling` (estado global del gym)", () => {
    renderProvider();
    expect(screen.getByTestId("enrolling").textContent).toBe("false");

    act(() =>
      captured!.onEvent?.(
        makeEvent({
          type: "enroll_started",
          enroll: {
            session_id: "s-1",
            member_id: "m-1",
            captured: 0,
            required: 3,
          },
        }),
      ),
    );
    expect(screen.getByTestId("enrolling").textContent).toBe("true");

    act(() =>
      captured!.onEvent?.(
        makeEvent({
          type: "enroll_failed",
          code: "timeout",
          enroll: {
            session_id: "s-1",
            member_id: "m-1",
            captured: 1,
            required: 3,
          },
        }),
      ),
    );
    expect(screen.getByTestId("enrolling").textContent).toBe("false");
  });

  it("al reconectar tras una caída invalida ['checkins'] (resync de lo perdido)", () => {
    const { qc } = renderProvider();
    const invalidate = vi.spyOn(qc, "invalidateQueries");

    act(() => captured!.onOpen?.());
    expect(invalidate).not.toHaveBeenCalled(); // primer open: nada que resyncear

    act(() => captured!.onDown?.());
    act(() => captured!.onOpen?.());
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["checkins"] });
  });

  it("desmontar cierra la conexión; logout también", () => {
    const { unmount } = renderProvider();
    expect(connectMock).toHaveBeenCalledTimes(1);
    act(() => useAuthStore.setState({ user: null }));
    expect(closeFn).toHaveBeenCalledTimes(1);
    unmount();
  });

  it("logout→login recicla la conexión (adiós canales zombie)", () => {
    renderProvider();
    expect(connectMock).toHaveBeenCalledTimes(1);
    act(() => useAuthStore.setState({ user: null }));
    expect(closeFn).toHaveBeenCalledTimes(1);
    act(() => useAuthStore.setState({ user: { ...OPERATOR, user_id: "u-2" } }));
    expect(connectMock).toHaveBeenCalledTimes(2);
  });
});
