import { describe, it, expect, afterEach } from "vitest";
import { isSubscriptionBlocked, isTrialReadOnly, useAuthStore, type AuthGym } from "../useAuthStore";

function gym(overrides: Partial<AuthGym>): AuthGym {
  return {
    gym_id: "00000000-0000-0000-0000-000000000000",
    name: "Test Gym",
    setup_completed: true,
    trial_ends_at: null,
    subscription_plan: "trial",
    subscription_status: "active",
    subscription_ends_at: null,
    ...overrides,
  };
}

describe("isSubscriptionBlocked", () => {
  it("no bloquea si gym es null/undefined", () => {
    expect(isSubscriptionBlocked(null)).toBe(false);
    expect(isSubscriptionBlocked(undefined)).toBe(false);
  });

  it("no bloquea status activo (trial o paid)", () => {
    expect(isSubscriptionBlocked(gym({ subscription_status: "active" }))).toBe(
      false
    );
  });

  it("no bloquea past_due (sólo banner)", () => {
    expect(
      isSubscriptionBlocked(gym({ subscription_status: "past_due" }))
    ).toBe(false);
  });

  it("no bloquea cancelled con grace period vigente", () => {
    const future = new Date(Date.now() + 72 * 3600 * 1000).toISOString();
    expect(
      isSubscriptionBlocked(
        gym({
          subscription_status: "cancelled",
          subscription_ends_at: future,
        })
      )
    ).toBe(false);
  });

  it("bloquea un plan de pago cancelled con grace vencida", () => {
    const past = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    expect(
      isSubscriptionBlocked(
        gym({
          subscription_plan: "standard",
          subscription_status: "cancelled",
          subscription_ends_at: past,
        })
      )
    ).toBe(true);
  });

  it("bloquea un plan de pago cancelled sin grace (subscription_ends_at = null)", () => {
    expect(
      isSubscriptionBlocked(
        gym({
          subscription_plan: "standard",
          subscription_status: "cancelled",
          subscription_ends_at: null,
        })
      )
    ).toBe(true);
  });
});

const past = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();
const future = () => new Date(Date.now() + 48 * 3600 * 1000).toISOString();

// Prueba terminada sin pago (UC-002): nunca bloqueo total, solo lectura
// después de los días de gracia.
describe("prueba terminada", () => {
  afterEach(() => {
    useAuthStore.setState({ user: null, gym: null, readOnly: false });
    localStorage.clear();
  });

  it("una prueba cancelada nunca bloquea por completo", () => {
    expect(isSubscriptionBlocked(gym({ subscription_status: "cancelled", subscription_ends_at: past() }))).toBe(false);
    expect(isSubscriptionBlocked(gym({ subscription_status: "cancelled", subscription_ends_at: null }))).toBe(false);
  });

  it("solo lectura solo cuando el cloud la cerró y pasó la gracia", () => {
    expect(isTrialReadOnly(null)).toBe(false);
    // Fecha vencida pero el cloud aún no la cierra: acceso completo.
    expect(isTrialReadOnly(gym({ trial_ends_at: past() }))).toBe(false);
    expect(isTrialReadOnly(gym({ subscription_status: "cancelled", subscription_ends_at: future() }))).toBe(false);
    expect(isTrialReadOnly(gym({ subscription_status: "cancelled", subscription_ends_at: past() }))).toBe(true);
    expect(isTrialReadOnly(gym({ subscription_status: "cancelled", subscription_ends_at: null }))).toBe(true);
    // Un plan de pago cancelado es bloqueo total, no solo lectura.
    expect(isTrialReadOnly(gym({ subscription_plan: "standard", subscription_status: "cancelled", subscription_ends_at: past() }))).toBe(false);
  });

  it("readOnly sigue al gym: entra al cerrarse y sale al pagar", () => {
    useAuthStore.getState().setGym(gym({ subscription_status: "cancelled", subscription_ends_at: past() }));
    expect(useAuthStore.getState().readOnly).toBe(true);
    useAuthStore.getState().setGym(gym({ subscription_plan: "standard", subscription_status: "active" }));
    expect(useAuthStore.getState().readOnly).toBe(false);
  });

  it("ignora un readOnly viejo guardado en la sesión y lo recalcula del gym", async () => {
    localStorage.setItem("tinta.session", JSON.stringify({ state: { user: null, gym: gym({}), readOnly: true }, version: 0 }));
    await useAuthStore.persist.rehydrate();
    expect(useAuthStore.getState().readOnly).toBe(false);
  });
});
