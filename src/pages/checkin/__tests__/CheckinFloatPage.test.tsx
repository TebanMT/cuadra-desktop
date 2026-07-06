import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { CheckinEvent } from "@/hooks/useCheckin";

// ── mocks de todo el I/O: la página se prueba como máquina de estados ──
interface LoopOpts {
  enabled: boolean;
  onAttempt?(): void;
  onCheckin(ev: CheckinEvent): void;
  onNoMatch?(): void;
  onError?(code: string): void;
}
let loopOpts: LoopOpts | null = null;
let bioAvailable = true;
let readerConnected: boolean | null = true;

vi.mock("@/hooks/useBiometric", () => ({
  useBiometricStatus: () => ({ data: { available: bioAvailable, connected: true } }),
  useReaderConnected: () => readerConnected,
  useBiometricCheckinLoop: (opts: LoopOpts) => {
    loopOpts = opts;
  },
}));

let kioskPresent = false;
vi.mock("@/hooks/useWindowPresence", () => ({
  useWindowPresence: () => kioskPresent,
}));

// Relay entre ventanas — capturamos los handlers para simular resultados
// que la main procesó (el camino normal: el Lite Client enruta el sample
// a la ventana con foco, que casi siempre es la main).
interface RelayOpts {
  onCheckin(ev: CheckinEvent): void;
  onNoMatch(): void;
}
let relayOpts: RelayOpts | null = null;
vi.mock("@/hooks/useCheckinResultRelay", () => ({
  useCheckinResultRelay: (opts: RelayOpts) => {
    relayOpts = opts;
  },
  emitCheckinResult: vi.fn(async () => {}),
}));

let streamStatus = "running";
vi.mock("@/lib/biometricStreamProvider", () => ({
  useBiometricStreamStatus: () => streamStatus,
}));

const playCheckinTone = vi.fn();
vi.mock("@/lib/audio", () => ({
  playCheckinTone: (...args: unknown[]) => playCheckinTone(...args),
  unlockAudio: vi.fn(),
}));

const closeCurrentWindow = vi.fn();
vi.mock("@/lib/kioskWindow", () => ({
  closeCurrentWindow: () => closeCurrentWindow(),
}));

// MemberPhoto resuelve la URL del sidecar vía Tauri command — irrelevante
// para la máquina de estados.
vi.mock("@/components/members/MemberPhoto", () => ({
  MemberPhoto: () => null,
}));

import CheckinFloatPage from "../CheckinFloatPage";
import { checkin as t } from "@/strings/checkin";

function makeEvent(overrides: Partial<CheckinEvent> = {}): CheckinEvent {
  return {
    id: "chk-1",
    result: "allowed_active",
    method: "fingerprint",
    member_id: "m-1",
    member_name: "Ana López",
    expiry_date: "2026-08-01",
    days_until_expiry: 26,
    manual_override: false,
    created_at: "2026-07-06T18:30:00Z",
    ...overrides,
  };
}

describe("CheckinFloatPage", () => {
  beforeEach(() => {
    loopOpts = null;
    relayOpts = null;
    bioAvailable = true;
    readerConnected = true;
    kioskPresent = false;
    streamStatus = "running";
    playCheckinTone.mockClear();
    closeCurrentWindow.mockClear();
  });

  it("en idle muestra 'Esperando huella…' con el loop habilitado", () => {
    render(<CheckinFloatPage />);
    expect(screen.getByText(t.float.waiting)).toBeInTheDocument();
    expect(loopOpts?.enabled).toBe(true);
  });

  it("con el kiosko abierto se bloquea y APAGA su loop (exclusión mutua)", () => {
    kioskPresent = true;
    render(<CheckinFloatPage />);
    expect(screen.getByText(t.float.kioskActiveTitle)).toBeInTheDocument();
    expect(screen.getByText(t.float.kioskActiveBody)).toBeInTheDocument();
    expect(loopOpts?.enabled).toBe(false);
  });

  it("muestra la pausa por enroll de forma explícita (no ventana 'congelada')", () => {
    streamStatus = "paused_by_enroll";
    render(<CheckinFloatPage />);
    expect(screen.getByText(t.float.enrollPauseTitle)).toBeInTheDocument();
    expect(screen.getByText(t.float.enrollPauseBody)).toBeInTheDocument();
  });

  it("sin lector utilizable avisa 'lector desconectado'", () => {
    readerConnected = false;
    render(<CheckinFloatPage />);
    expect(screen.getByText(t.float.readerDisconnected)).toBeInTheDocument();
    expect(loopOpts?.enabled).toBe(false);
  });

  it("un check-in permitido pinta nombre + detalle en verde y suena success", () => {
    render(<CheckinFloatPage />);
    act(() => loopOpts!.onCheckin(makeEvent()));
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText(t.feedback.successActive(26))).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("success");
  });

  it("membresía vencida pinta el detalle de denegado y suena denied", () => {
    render(<CheckinFloatPage />);
    act(() =>
      loopOpts!.onCheckin(
        makeEvent({ result: "denied_expired", days_until_expiry: -3 }),
      ),
    );
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText(t.feedback.deniedExpired(3))).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("denied");
  });

  it("por vencer pinta el detalle ámbar y suena warning", () => {
    render(<CheckinFloatPage />);
    act(() =>
      loopOpts!.onCheckin(
        makeEvent({ result: "allowed_expiring_soon", days_until_expiry: 2 }),
      ),
    );
    expect(screen.getByText(t.feedback.successExpiringSoon(2))).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("warning");
  });

  it("huella no reconocida muestra el no-match sin nombre", () => {
    render(<CheckinFloatPage />);
    act(() => loopOpts!.onNoMatch!());
    expect(screen.getByText(t.float.noMatchTitle)).toBeInTheDocument();
    expect(screen.getByText(t.feedback.deniedNotFound)).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("denied");
  });

  it("el resultado sobrevive al TTL del kiosko pero REGRESA a 'Esperando huella…' después", async () => {
    vi.useFakeTimers();
    try {
      render(<CheckinFloatPage />);
      act(() => loopOpts!.onCheckin(makeEvent()));

      // Pasado el auto-fade del kiosko (3.5s) sigue visible — el punto de
      // la feature: el toast muere bajo modales, esta superficie no.
      act(() => {
        vi.advanceTimersByTime(5_000);
      });
      expect(screen.getByText("Ana López")).toBeInTheDocument();

      // Pero al vencer el TTL vuelve la animación de espera — la señal
      // para el siguiente socio (feedback del piloto 6-jul-2026).
      act(() => {
        vi.advanceTimersByTime(6_000);
      });
      expect(screen.queryByText("Ana López")).not.toBeInTheDocument();
      expect(screen.getByText(t.float.waiting)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("un resultado nuevo reemplaza al anterior y re-arma el TTL", async () => {
    vi.useFakeTimers();
    try {
      render(<CheckinFloatPage />);
      act(() => loopOpts!.onCheckin(makeEvent()));
      act(() => {
        vi.advanceTimersByTime(8_000);
      });
      // Segundo socio antes de que expire el primero.
      act(() =>
        loopOpts!.onCheckin(
          makeEvent({ member_id: "m-2", member_name: "Luis Ramos" }),
        ),
      );
      expect(screen.getByText("Luis Ramos")).toBeInTheDocument();
      expect(screen.queryByText("Ana López")).not.toBeInTheDocument();

      // El timer se re-armó con el segundo resultado: a los 8s de éste
      // sigue visible, y expira hasta cumplir SU propio TTL.
      act(() => {
        vi.advanceTimersByTime(8_000);
      });
      expect(screen.getByText("Luis Ramos")).toBeInTheDocument();
      act(() => {
        vi.advanceTimersByTime(3_000);
      });
      expect(screen.queryByText("Luis Ramos")).not.toBeInTheDocument();
      expect(screen.getByText(t.float.waiting)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("pinta con tono un resultado RELAYADO desde la main (el camino normal sin foco)", () => {
    render(<CheckinFloatPage />);
    act(() => relayOpts!.onCheckin(makeEvent()));

    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText(t.feedback.successActive(26))).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("success");
  });

  it("pinta un no-match relayado desde la main", () => {
    render(<CheckinFloatPage />);
    act(() => relayOpts!.onNoMatch());

    expect(screen.getByText(t.float.noMatchTitle)).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("denied");
  });

  it("el botón de cerrar propio cierra la ventana (no hay chrome del OS)", () => {
    render(<CheckinFloatPage />);
    screen.getByLabelText(t.float.closeAria).click();
    expect(closeCurrentWindow).toHaveBeenCalled();
  });
});
