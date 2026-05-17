import { describe, it, expect } from "vitest";
import { isSubscriptionBlocked, type AuthGym } from "../useAuthStore";

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

  it("bloquea cancelled con grace vencida", () => {
    const past = new Date(Date.now() - 72 * 3600 * 1000).toISOString();
    expect(
      isSubscriptionBlocked(
        gym({
          subscription_status: "cancelled",
          subscription_ends_at: past,
        })
      )
    ).toBe(true);
  });

  it("bloquea cancelled sin grace (subscription_ends_at = null)", () => {
    expect(
      isSubscriptionBlocked(
        gym({
          subscription_status: "cancelled",
          subscription_ends_at: null,
        })
      )
    ).toBe(true);
  });
});
