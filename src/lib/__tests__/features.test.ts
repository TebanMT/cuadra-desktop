import { describe, expect, it, vi } from "vitest";
vi.mock("@/lib/runtime", () => ({ isDev: false }));
import { canAccessFeature, FEATURE_TIERS, type Feature } from "../features";
import { canAccessPlusFeatures, isPaidPlan, isPlusPlan } from "@/hooks/useSubscription";

describe("launch entitlements", () => {
  it.each(["trial", "standard_monthly", "standard_annual", "plus_monthly", "plus_annual"])("opens registered features without changing the %s SKU", (plan) => {
    const gym = { subscription_plan: plan, all_features_access: true };
    for (const feature of Object.keys(FEATURE_TIERS) as Feature[]) expect(canAccessFeature(gym, feature)).toBe(true);
    expect(canAccessPlusFeatures(gym)).toBe(true);
    expect(isPlusPlan(plan)).toBe(plan.startsWith("plus_"));
    expect(isPaidPlan(plan)).toBe(plan !== "trial");
    expect(canAccessFeature(gym, "unknown" as Feature)).toBe(false);
  });
  it("gives trial and Standard every built feature without a grant", () => {
    const plusOnly: Feature[] = ["own_whatsapp", "broadcasts"];
    for (const plan of ["trial", "standard_monthly", "standard_annual"]) {
      for (const feature of Object.keys(FEATURE_TIERS) as Feature[]) {
        expect(canAccessFeature({ subscription_plan: plan, all_features_access: false }, feature)).toBe(!plusOnly.includes(feature));
      }
      expect(canAccessPlusFeatures({ subscription_plan: plan })).toBe(true);
    }
    expect(canAccessFeature("plus_monthly", "own_whatsapp")).toBe(true);
    expect(canAccessPlusFeatures(null)).toBe(false);
    expect(canAccessFeature("", "daily_operations")).toBe(false);
  });
});
