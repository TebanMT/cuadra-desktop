import { describe, it, expect } from "vitest";
import {
  bannerLevelFor,
  calendarDaysUntil,
  TRIAL_SYNC_TRUST_MS,
} from "../useSubscription";

// Reloj fijo a mediodía UTC para que el cálculo de días calendario no se
// voltee por la TZ de la máquina de CI (±12h desde mediodía no cruza día).
const NOW = new Date("2026-06-20T12:00:00Z").getTime();
const iso = (ms: number) => new Date(ms).toISOString();
const inDays = (n: number) => NOW + n * 24 * 60 * 60 * 1000;
const hoursAgo = (h: number) => NOW - h * 60 * 60 * 1000;

describe("bannerLevelFor", () => {
  it("plan pagado → ok (sin banner)", () => {
    expect(
      bannerLevelFor(
        { subscription_plan: "standard_monthly", subscription_status: "active" },
        NOW
      )
    ).toBe("ok");
  });

  it("trial con margen (>7 días) → trial_info (no sólo la última semana)", () => {
    expect(
      bannerLevelFor(
        {
          subscription_plan: "trial",
          subscription_status: "active",
          trial_ends_at: iso(inDays(20)),
        },
        NOW
      )
    ).toBe("trial_info");
  });

  it("trial en la última semana (≤7 días) → trial_soon", () => {
    expect(
      bannerLevelFor(
        {
          subscription_plan: "trial",
          subscription_status: "active",
          trial_ends_at: iso(inDays(3)),
        },
        NOW
      )
    ).toBe("trial_soon");
  });

  it("trial vencido + sync reciente → trial_over (confirmado, recordatorio suave)", () => {
    expect(
      bannerLevelFor(
        {
          subscription_plan: "trial",
          subscription_status: "active",
          trial_ends_at: iso(inDays(-2)),
          last_synced_at: iso(hoursAgo(1)),
        },
        NOW
      )
    ).toBe("trial_over");
  });

  it("trial vencido + sync viejo → trial_unconfirmed (no acusamos impago)", () => {
    expect(
      bannerLevelFor(
        {
          subscription_plan: "trial",
          subscription_status: "active",
          trial_ends_at: iso(inDays(-2)),
          last_synced_at: iso(NOW - (TRIAL_SYNC_TRUST_MS + 60_000)),
        },
        NOW
      )
    ).toBe("trial_unconfirmed");
  });

  it("trial vencido + nunca sincronizó → trial_unconfirmed", () => {
    expect(
      bannerLevelFor(
        {
          subscription_plan: "trial",
          subscription_status: "active",
          trial_ends_at: iso(inDays(-2)),
          last_synced_at: null,
        },
        NOW
      )
    ).toBe("trial_unconfirmed");
  });

  it("past_due gana sobre cualquier estado de trial", () => {
    expect(
      bannerLevelFor(
        {
          subscription_plan: "trial",
          subscription_status: "past_due",
          trial_ends_at: iso(inDays(10)),
        },
        NOW
      )
    ).toBe("past_due");
  });

  it("cancelled → cancelled", () => {
    expect(
      bannerLevelFor(
        {
          subscription_plan: "trial",
          subscription_status: "cancelled",
          trial_ends_at: iso(inDays(10)),
        },
        NOW
      )
    ).toBe("cancelled");
  });

  it("trial sin fecha de fin → ok (no inventamos countdown)", () => {
    expect(
      bannerLevelFor(
        {
          subscription_plan: "trial",
          subscription_status: "active",
          trial_ends_at: null,
        },
        NOW
      )
    ).toBe("ok");
  });
});

describe("calendarDaysUntil", () => {
  it("redondea a días calendario", () => {
    expect(calendarDaysUntil(iso(inDays(5)), NOW)).toBe(5);
  });
  it("null para fecha vacía o inválida", () => {
    expect(calendarDaysUntil(null, NOW)).toBeNull();
    expect(calendarDaysUntil("not-a-date", NOW)).toBeNull();
  });
});
