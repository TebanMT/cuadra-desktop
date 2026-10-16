import { isDev } from "@/lib/runtime";

// Mirrors gyms/domain/gym/features.go. Add new gated features explicitly;
// unknown feature names never receive access, even with a launch grant.
export const FEATURE_TIERS = {
  held_messages: "plus",
  daily_operations: "standard",
  recurring_expenses: "plus",
  analytics: "plus",
  report_exports: "plus",
  product_margins: "plus",
  promotions_roi: "plus",
  audit_log: "plus",
  branding: "plus",
  fiscal_details: "plus",
  access_hardware: "plus",
  own_whatsapp: "plus",
  broadcasts: "plus",
  extra_operators: "plus",
} as const;
export type Feature = keyof typeof FEATURE_TIERS;
export type FeatureAccess = string | { subscription_plan: string; all_features_access?: boolean } | null | undefined;

export function canAccessFeature(access: FeatureAccess, feature: Feature): boolean {
  if (!Object.hasOwn(FEATURE_TIERS, feature)) return false;
  const plan = typeof access === "string" ? access : access?.subscription_plan;
  const grant = typeof access === "object" && access?.all_features_access === true;
  if (FEATURE_TIERS[feature] === "standard") {
    return ["trial", "standard_monthly", "standard_annual", "plus_monthly", "plus_annual"].includes(plan ?? "");
  }
  return isDev || grant || plan === "plus_monthly" || plan === "plus_annual";
}
