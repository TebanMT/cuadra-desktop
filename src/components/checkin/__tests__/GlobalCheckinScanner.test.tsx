import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, act } from "@testing-library/react";
import type { CheckinEvent } from "@/hooks/useCheckin";
import {
  CHECKIN_FLOAT_WINDOW_LABEL,
  KIOSK_WINDOW_LABEL,
} from "@/lib/windowLabels";

// ── mocks de todo el I/O: el scanner se prueba como wiring puro ────────
// CheckinFeedback (eventToFeedback / feedbackTone / feedbackDetail) va SIN
// mock a propósito: el toast debe decir exactamente lo mismo que el kiosko.
interface LoopOpts {
  enabled: boolean;
  suppressed?: boolean;
  onCheckin(ev: CheckinEvent): void;
  onNoMatch?(): void;
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

let floatPresent = false;
let kioskPresent = false;
vi.mock("@/hooks/useWindowPresence", () => ({
  useWindowPresence: (label: string) =>
    label === "kiosk" ? kioskPresent : label === "checkin-float" ? floatPresent : false,
}));

interface RelayOpts {
  onCheckin(ev: CheckinEvent): void;
  onNoMatch(): void;
}
let relayOpts: RelayOpts | null = null;
vi.mock("@/hooks/useKioskCheckinRelay", () => ({
  useKioskCheckinRelay: (opts: RelayOpts) => {
    relayOpts = opts;
  },
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

describe("GlobalCheckinScanner", () => {
  beforeEach(() => {
    loopOpts = null;
    relayOpts = null;
    bioAvailable = true;
    readerConnected = true;
    floatPresent = false;
    kioskPresent = false;
    toastSuccess.mockClear();
    toastWarning.mockClear();
    toastError.mockClear();
    playCheckinTone.mockClear();
  });

  describe("supresión por ventanas dedicadas", () => {
    it("sin kiosko ni flotante corre sin suprimir", () => {
      render(<GlobalCheckinScanner />);
      expect(loopOpts?.enabled).toBe(true);
      expect(loopOpts?.suppressed).toBe(false);
    });

    it("con la flotante abierta se suprime", () => {
      floatPresent = true;
      render(<GlobalCheckinScanner />);
      expect(loopOpts?.suppressed).toBe(true);
    });

    it("con el kiosko abierto se suprime (anti doble-POST del multiplex)", () => {
      kioskPresent = true;
      render(<GlobalCheckinScanner />);
      expect(loopOpts?.suppressed).toBe(true);
    });

    it("sin lector utilizable apaga el loop", () => {
      readerConnected = false;
      render(<GlobalCheckinScanner />);
      expect(loopOpts?.enabled).toBe(false);
    });

    // Sanity de los labels que el mock de useWindowPresence hardcodea.
    it("labels canónicos siguen siendo kiosk / checkin-float", () => {
      expect(KIOSK_WINDOW_LABEL).toBe("kiosk");
      expect(CHECKIN_FLOAT_WINDOW_LABEL).toBe("checkin-float");
    });
  });

  describe("resultados propios (el scanner posteó) — toast CON tono", () => {
    it("permitido: toast success con el detalle canónico y tono", () => {
      render(<GlobalCheckinScanner />);
      act(() => loopOpts!.onCheckin(makeEvent()));

      expect(toastSuccess).toHaveBeenCalledWith("✓ Ana López ingresó", {
        description: t.feedback.successActive(26),
      });
      expect(playCheckinTone).toHaveBeenCalledWith("success");
    });

    it("por vencer: toast warning y tono warning", () => {
      render(<GlobalCheckinScanner />);
      act(() =>
        loopOpts!.onCheckin(
          makeEvent({ result: "allowed_expiring_soon", days_until_expiry: 2 }),
        ),
      );

      expect(toastWarning).toHaveBeenCalledWith("⚠ Ana López ingresó", {
        description: t.feedback.successExpiringSoon(2),
      });
      expect(playCheckinTone).toHaveBeenCalledWith("warning");
    });

    it("vencido: toast error y tono denied", () => {
      render(<GlobalCheckinScanner />);
      act(() =>
        loopOpts!.onCheckin(
          makeEvent({ result: "denied_expired", days_until_expiry: -3 }),
        ),
      );

      expect(toastError).toHaveBeenCalledWith("✗ Ana López no puede entrar", {
        description: t.feedback.deniedExpired(3),
      });
      expect(playCheckinTone).toHaveBeenCalledWith("denied");
    });

    it("no-match: toast error y tono denied", () => {
      render(<GlobalCheckinScanner />);
      act(() => loopOpts!.onNoMatch!());

      expect(toastError).toHaveBeenCalledWith(
        "No reconocimos la huella",
        expect.objectContaining({ description: expect.any(String) }),
      );
      expect(playCheckinTone).toHaveBeenCalledWith("denied");
    });
  });

  describe("resultados relayados del kiosko — toast SIN tono", () => {
    it("permitido relayado: mismo toast, cero tono (el kiosko ya sonó)", () => {
      kioskPresent = true;
      render(<GlobalCheckinScanner />);
      act(() => relayOpts!.onCheckin(makeEvent()));

      expect(toastSuccess).toHaveBeenCalledWith("✓ Ana López ingresó", {
        description: t.feedback.successActive(26),
      });
      expect(playCheckinTone).not.toHaveBeenCalled();
    });

    it("denegado relayado: toast error sin tono", () => {
      kioskPresent = true;
      render(<GlobalCheckinScanner />);
      act(() =>
        relayOpts!.onCheckin(
          makeEvent({ result: "denied_no_membership", days_until_expiry: null }),
        ),
      );

      expect(toastError).toHaveBeenCalledWith("✗ Ana López no puede entrar", {
        description: t.feedback.deniedNoMembership,
      });
      expect(playCheckinTone).not.toHaveBeenCalled();
    });

    it("no-match relayado: toast error sin tono", () => {
      kioskPresent = true;
      render(<GlobalCheckinScanner />);
      act(() => relayOpts!.onNoMatch());

      expect(toastError).toHaveBeenCalledWith(
        "No reconocimos la huella",
        expect.objectContaining({ description: expect.any(String) }),
      );
      expect(playCheckinTone).not.toHaveBeenCalled();
    });
  });
});
