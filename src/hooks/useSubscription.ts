import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type SubscriptionStatus = "active" | "past_due" | "cancelled";
export type SubscriptionPlan = "trial" | "pro_monthly" | "pro_annual";

export interface SubscriptionEvent {
  id: string;
  provider: "stripe" | "mercadopago" | "manual";
  type: "activated" | "renewed" | "past_due" | "cancelled" | "trial_extended";
  plan: string;
  amount?: number;
  currency?: string;
  occurred_at: string;
  period_ends_at?: string | null;
}

export interface SubscriptionDetail {
  plan: SubscriptionPlan | string;
  status: SubscriptionStatus;
  trial_ends_at?: string | null;
  period_ends_at?: string | null;
  has_active_access: boolean;
  is_trial_expired: boolean;
  history: SubscriptionEvent[];
}

const KEY = ["subscription", "me"] as const;

/** Read the gym's current subscription state + recent processor events. */
export function useSubscription(enabled = true) {
  return useQuery<SubscriptionDetail>({
    queryKey: KEY,
    queryFn: () => api.get<SubscriptionDetail>("/api/v1/subscriptions/me"),
    enabled,
    staleTime: 60_000,
  });
}

export interface ExtendTrialInput {
  days: number;
}

/** Manual sales tool — extends the trial window (owner-only). */
export function useExtendTrial() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ExtendTrialInput) =>
      api.post<{ applied: boolean; event_id?: string }>(
        "/api/v1/subscriptions/me/extend-trial",
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEY });
      qc.invalidateQueries({ queryKey: ["auth", "me"] });
    },
  });
}

export type CheckoutProvider = "stripe" | "mercadopago";

export interface StartCheckoutInput {
  provider: CheckoutProvider;
  plan: "pro_monthly" | "pro_annual";
}

export interface StartCheckoutResult {
  url: string;
  session_id?: string;
}

/**
 * Owner-only — asks cloud to create a Stripe Checkout Session (mode=subscription)
 * or a Mercado Pago preapproval and returns the hosted URL. The caller is
 * responsible for opening the URL in the system browser; subscription state
 * only flips to "active" once the corresponding webhook lands.
 */
export function useStartCheckout() {
  return useMutation({
    mutationFn: (input: StartCheckoutInput) =>
      api.post<StartCheckoutResult>("/api/v1/subscriptions/checkout-session", input),
  });
}

/**
 * Effective access banner level — the FE uses this to decide whether to show
 * the orange "trial expirando" banner, the red "past_due" banner, or nothing.
 *
 * Returns one of:
 *  - "ok"           → no banner
 *  - "trial_soon"   → banner: "te quedan N días de prueba"
 *  - "trial_over"   → banner: "el período de prueba terminó"
 *  - "past_due"     → banner: "no pudimos cobrar tu mensualidad"
 *  - "cancelled"    → banner: "tu suscripción fue cancelada"
 */
export type SubscriptionBannerLevel =
  | "ok"
  | "trial_soon"
  | "trial_over"
  | "past_due"
  | "cancelled";

export function bannerLevelFor(detail: {
  subscription_plan?: string;
  subscription_status?: SubscriptionStatus;
  trial_ends_at?: string | null;
  period_ends_at?: string | null;
}): SubscriptionBannerLevel {
  const status = detail.subscription_status ?? "active";
  if (status === "past_due") return "past_due";
  if (status === "cancelled") return "cancelled";
  if (detail.subscription_plan === "trial") {
    const ends = detail.trial_ends_at ? new Date(detail.trial_ends_at).getTime() : 0;
    if (!ends) return "ok";
    const now = Date.now();
    if (ends < now) return "trial_over";
    const days = Math.ceil((ends - now) / (1000 * 60 * 60 * 24));
    if (days <= 7) return "trial_soon";
  }
  return "ok";
}
