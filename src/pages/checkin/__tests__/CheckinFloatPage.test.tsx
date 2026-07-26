import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, act } from "@testing-library/react";
import type { CheckinEvent } from "@/hooks/useCheckin";

// ── mocks de todo el I/O: la página se prueba como máquina de estados ──
interface FeedOpts {
  enabled?: boolean;
  onAttempt?(): void;
  onCheckin(ev: CheckinEvent): void;
  onNoMatch?(): void;
  onSampleRejected?(): void;
  onError?(message?: string): void;
}
let feedOpts: FeedOpts | null = null;
let bioAvailable = true;
let bioConnected = true;

vi.mock("@/hooks/useBiometric", () => ({
  useBiometricStatus: () => ({
    data: { available: bioAvailable, connected: bioConnected },
  }),
  useBiometricCheckinFeed: (opts: FeedOpts) => {
    feedOpts = opts;
  },
}));

// Estado del provider SSE — dot del header + pausa por enroll.
let sseLive = true;
let enrolling = false;
vi.mock("@/lib/biometricEventsProvider", () => ({
  useBiometricLive: () => sseLive,
  useBiometricEnrolling: () => enrolling,
}));

let kioskPresent = false;
vi.mock("@/hooks/useWindowPresence", () => ({
  useWindowPresence: () => kioskPresent,
}));

// Knobs del dueño (Ajustes → Perfil del gym): duración del veredicto en
// pantalla + volumen del tono. Variables para probar que la página los
// honra en vez de hardcodear.
let mockTtlMs = 10_000;
let mockVolume = 0.8;
vi.mock("@/hooks/useGym", () => ({
  useCheckinFeedbackSettings: () => ({ ttlMs: mockTtlMs, volume: mockVolume }),
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
    feedOpts = null;
    mockTtlMs = 10_000;
    mockVolume = 0.8;
    bioAvailable = true;
    bioConnected = true;
    sseLive = true;
    enrolling = false;
    kioskPresent = false;
    playCheckinTone.mockClear();
    closeCurrentWindow.mockClear();
  });

  it("en idle muestra 'Esperando huella…' con el feed habilitado", () => {
    render(<CheckinFloatPage />);
    expect(screen.getByText(t.float.waiting)).toBeInTheDocument();
    expect(feedOpts?.enabled).toBe(true);
  });

  it("con el kiosko abierto se bloquea y APAGA su feed (exclusión mutua)", () => {
    kioskPresent = true;
    render(<CheckinFloatPage />);
    expect(screen.getByText(t.float.kioskActiveTitle)).toBeInTheDocument();
    expect(screen.getByText(t.float.kioskActiveBody)).toBeInTheDocument();
    expect(feedOpts?.enabled).toBe(false);
  });

  it("muestra la pausa por enroll de forma explícita (no ventana 'congelada')", () => {
    enrolling = true;
    render(<CheckinFloatPage />);
    expect(screen.getByText(t.float.enrollPauseTitle)).toBeInTheDocument();
    expect(screen.getByText(t.float.enrollPauseBody)).toBeInTheDocument();
  });

  it("sin lector utilizable avisa 'lector desconectado'", () => {
    bioAvailable = false;
    bioConnected = false;
    render(<CheckinFloatPage />);
    expect(screen.getByText(t.float.readerDisconnected)).toBeInTheDocument();
  });

  it("un check-in permitido pinta nombre + detalle en verde y suena success", () => {
    render(<CheckinFloatPage />);
    act(() => feedOpts!.onCheckin(makeEvent()));
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText(t.feedback.successActive(26))).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("success", 0.8);
  });

  it("membresía vencida pinta el detalle de denegado y suena denied", () => {
    render(<CheckinFloatPage />);
    act(() =>
      feedOpts!.onCheckin(
        makeEvent({ result: "denied_expired", days_until_expiry: -3 }),
      ),
    );
    expect(screen.getByText("Ana López")).toBeInTheDocument();
    expect(screen.getByText(t.feedback.deniedExpired(3))).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("denied", 0.8);
  });

  it("por vencer pinta el detalle ámbar y suena warning", () => {
    render(<CheckinFloatPage />);
    act(() =>
      feedOpts!.onCheckin(
        makeEvent({ result: "allowed_expiring_soon", days_until_expiry: 2 }),
      ),
    );
    expect(screen.getByText(t.feedback.successExpiringSoon(2))).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("warning", 0.8);
  });

  it("huella no reconocida muestra el no-match sin nombre", () => {
    render(<CheckinFloatPage />);
    act(() => feedOpts!.onNoMatch!());
    expect(screen.getByText(t.float.noMatchTitle)).toBeInTheDocument();
    expect(screen.getByText(t.feedback.deniedNotFound)).toBeInTheDocument();
    expect(playCheckinTone).toHaveBeenCalledWith("denied", 0.8);
  });

  it("sample_rejected muestra 'vuelve a apoyar el dedo' SIN tono y expira solo", () => {
    vi.useFakeTimers();
    try {
      render(<CheckinFloatPage />);
      act(() => feedOpts!.onSampleRejected!());
      expect(screen.getByText(t.feedback.sampleRejected)).toBeInTheDocument();
      expect(playCheckinTone).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(mockTtlMs + 500);
      });
      expect(screen.queryByText(t.feedback.sampleRejected)).not.toBeInTheDocument();
      expect(screen.getByText(t.float.waiting)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("un intento nuevo (attempt) limpia el hint de sample_rejected", () => {
    render(<CheckinFloatPage />);
    act(() => feedOpts!.onSampleRejected!());
    expect(screen.getByText(t.feedback.sampleRejected)).toBeInTheDocument();
    act(() => feedOpts!.onAttempt!());
    expect(screen.queryByText(t.feedback.sampleRejected)).not.toBeInTheDocument();
    expect(screen.getByText(t.feedback.processing)).toBeInTheDocument();
  });

  it("el resultado dura lo configurado y REGRESA a 'Esperando huella…'", async () => {
    vi.useFakeTimers();
    try {
      render(<CheckinFloatPage />);
      act(() => feedOpts!.onCheckin(makeEvent()));

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
      act(() => feedOpts!.onCheckin(makeEvent()));
      act(() => {
        vi.advanceTimersByTime(8_000);
      });
      // Segundo socio antes de que expire el primero.
      act(() =>
        feedOpts!.onCheckin(
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

  it("honra el TTL configurado por el dueño (no hay duración en duro)", async () => {
    mockTtlMs = 2_000; // "Duración del feedback al check-in" al mínimo
    vi.useFakeTimers();
    try {
      render(<CheckinFloatPage />);
      act(() => feedOpts!.onCheckin(makeEvent()));
      expect(screen.getByText("Ana López")).toBeInTheDocument();

      act(() => {
        vi.advanceTimersByTime(2_500);
      });
      expect(screen.queryByText("Ana López")).not.toBeInTheDocument();
      expect(screen.getByText(t.float.waiting)).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it("el botón de cerrar propio cierra la ventana (no hay chrome del OS)", () => {
    render(<CheckinFloatPage />);
    screen.getByLabelText(t.float.closeAria).click();
    expect(closeCurrentWindow).toHaveBeenCalled();
  });
});
