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
  it("keeps the plan rules when a grant is missing or false", () => {
    expect(canAccessPlusFeatures({ subscription_plan: "standard_monthly" })).toBe(false);
    expect(canAccessPlusFeatures({ subscription_plan: "standard_monthly", all_features_access: false })).toBe(false);
    expect(canAccessPlusFeatures(null)).toBe(false);
    expect(canAccessFeature("standard_monthly", "daily_operations")).toBe(true);
  });
});
