import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import type { CheckinEvent } from "@/hooks/useCheckin";
import {
  CHECKIN_FLOAT_WINDOW_LABEL,
  KIOSK_WINDOW_LABEL,
} from "@/lib/windowLabels";

// ── mocks de todo el I/O: el scanner se prueba como wiring puro ────────
// CheckinFeedback (eventToFeedback / feedbackTone / feedbackDetail) va SIN
// mock a propósito: el toast debe decir exactamente lo mismo que el kiosko.
interface FeedOpts {
  enabled?: boolean;
  onCheckin(ev: CheckinEvent): void;
  onNoMatch?(): void;
}
let feedOpts: FeedOpts | null = null;

vi.mock("@/hooks/useBiometric", () => ({
  useBiometricCheckinFeed: (opts: FeedOpts) => {
    feedOpts = opts;
  },
}));

let floatPresent = false;
let kioskPresent = false;
vi.mock("@/hooks/useWindowPresence", () => ({
  useWindowPresence: (label: string) =>
    label === "kiosk" ? kioskPresent : label === "checkin-float" ? floatPresent : false,
}));

// Knobs del dueño (Ajustes → Perfil del gym) — el scanner usa el volumen.
vi.mock("@/hooks/useGym", () => ({
  useCheckinFeedbackSettings: () => ({ ttlMs: 4000, volume: 0.8 }),
}));

const toastSuccess = vi.fn();
const toastWarning = vi.fn();
const toastError = vi.fn();
vi.mock("sonner", () => ({
  toast: {
    success: (...args: unknown[]) => toastSuccess(...args),
    warning: (...args: unknown[]) => toastWarning(...args),
    error: (...args: unknown[]) => toastError(...args),
  },
}));

const playCheckinTone = vi.fn();
vi.mock("@/lib/audio", () => ({
  playCheckinTone: (...args: unknown[]) => playCheckinTone(...args),
}));

import { GlobalCheckinScanner } from "../GlobalCheckinScanner";
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
    created_at: "2026-07-06T10:00:00Z",
    ...overrides,
  };
}

// El scanner lee la ruta actual (en /checkin la página es dueña del feedback).
function renderAt(path = "/") {
  return render(
    <MemoryRouter initialEntries={[path]}>
      <GlobalCheckinScanner />
    </MemoryRouter>,
  );
}

describe("GlobalCheckinScanner", () => {
  beforeEach(() => {
    feedOpts = null;
    floatPresent = false;
    kioskPresent = false;
    toastSuccess.mockClear();
    toastWarning.mockClear();
    toastError.mockClear();
    playCheckinTone.mockClear();
  });

  describe("gating del feed", () => {
    it("corre habilitado en cualquier ruta normal", () => {
      renderAt("/sales");
      expect(feedOpts?.enabled).toBe(true);
    });

    it("en /checkin se apaga: CheckinPage pinta en la MISMA ventana (anti doble-feedback)", () => {
      renderAt("/checkin");
      expect(feedOpts?.enabled).toBe(false);
    });

    it("sigue habilitado con la flotante o el kiosko abiertos (todas las ventanas reciben el SSE)", () => {
      floatPresent = true;
      renderAt("/");
      expect(feedOpts?.enabled).toBe(true);
    });

    // Sanity de los labels que el mock de useWindowPresence hardcodea.
    it("labels canónicos siguen siendo kiosk / checkin-float", () => {
      expect(KIOSK_WINDOW_LABEL).toBe("kiosk");
      expect(CHECKIN_FLOAT_WINDOW_LABEL).toBe("checkin-float");
    });
  });

  describe("resultados sin superficie dedicada — toast CON tono", () => {
    it("permitido: toast success con el detalle canónico y tono", () => {
      renderAt("/");
      act(() => feedOpts!.onCheckin(makeEvent()));

      expect(toastSuccess).toHaveBeenCalledWith("✓ Ana López ingresó", {
        description: t.feedback.successActive(26),
      });
      expect(playCheckinTone).toHaveBeenCalledWith("success", 0.8);
    });

    it("por vencer: toast warning y tono warning", () => {
      renderAt("/");
      act(() =>
        feedOpts!.onCheckin(
          makeEvent({ result: "allowed_expiring_soon", days_until_expiry: 2 }),
        ),
      );

      expect(toastWarning).toHaveBeenCalledWith("⚠ Ana López ingresó", {
        description: t.feedback.successExpiringSoon(2),
      });
      expect(playCheckinTone).toHaveBeenCalledWith("warning", 0.8);
    });

    it("vencido: toast error y tono denied", () => {
      renderAt("/");
      act(() =>
        feedOpts!.onCheckin(
          makeEvent({ result: "denied_expired", days_until_expiry: -3 }),
        ),
      );

      expect(toastError).toHaveBeenCalledWith("✗ Ana López no puede entrar", {
        description: t.feedback.deniedExpired(3),
      });
      expect(playCheckinTone).toHaveBeenCalledWith("denied", 0.8);
    });

    it("no-match: toast error y tono denied", () => {
      renderAt("/");
      act(() => feedOpts!.onNoMatch!());

      expect(toastError).toHaveBeenCalledWith(
        "No reconocimos la huella",
        expect.objectContaining({ description: expect.any(String) }),
      );
      expect(playCheckinTone).toHaveBeenCalledWith("denied", 0.8);
    });
  });

  describe("resultados CON superficie dedicada abierta — toast SIN tono (la superficie suena)", () => {
    it("con la flotante abierta: toastea pero no suena", () => {
      floatPresent = true;
      renderAt("/");
      act(() => feedOpts!.onCheckin(makeEvent()));

      expect(toastSuccess).toHaveBeenCalledWith("✓ Ana López ingresó", {
        description: t.feedback.successActive(26),
      });
      expect(playCheckinTone).not.toHaveBeenCalled();
    });

    it("con el kiosko abierto: ídem para el no-match", () => {
      kioskPresent = true;
      renderAt("/");
      act(() => feedOpts!.onNoMatch!());

      expect(toastError).toHaveBeenCalled();
      expect(playCheckinTone).not.toHaveBeenCalled();
    });

    it("denegado con kiosko abierto: toast error sin tono", () => {
      kioskPresent = true;
      renderAt("/");
      act(() =>
        feedOpts!.onCheckin(
          makeEvent({ result: "denied_no_membership", days_until_expiry: null }),
        ),
      );

      expect(toastError).toHaveBeenCalledWith("✗ Ana López no puede entrar", {
        description: t.feedback.deniedNoMembership,
      });
      expect(playCheckinTone).not.toHaveBeenCalled();
    });
  });
});
