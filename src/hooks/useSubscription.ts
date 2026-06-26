import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { isDev } from "@/lib/runtime";

export type SubscriptionStatus = "active" | "past_due" | "cancelled";
export type SubscriptionPlan =
  | "trial"
  | "standard_monthly"
  | "standard_annual"
  | "plus_monthly"
  | "plus_annual";

/** Tier-only SKU (sin cadence). Útil para gating de features Plus. */
export type CheckoutPlan =
  | "standard_monthly"
  | "standard_annual"
  | "plus_monthly"
  | "plus_annual";

/** Devuelve true si el plan pertenece al tier Plus (cualquier cadencia). */
export function isPlusPlan(plan: string | undefined | null): boolean {
  return plan === "plus_monthly" || plan === "plus_annual";
}

/**
 * True si el gym debe ver las features Plus.
 *
 * HOY (Plus aún no se vende — landing dice "Próximamente"): trial NO pasa.
 * Mientras el bundle Plus no esté completo (faltan rutinas + app del socio),
 * mostrar features Plus al trial es prometer algo que no se vende. Trial
 * opera como Standard hasta que se libere Plus.
 *
 * CUANDO PLUS SE LIBERE: añadir `plan === "trial"` aquí — el trial debe
 * poder probar Plus para evaluar el upgrade (estrategia ADR-009). Buscar
 * este comentario al hacer el cambio.
 *
 * DEV-MODE BYPASS: cuando `VITE_TINTA_MODE=dev`, devuelve true para
 * cualquier plan. Espeja el bypass equivalente del backend en
 * `gymDomain.CanAccessPlusFeatures`. `isPlusPlan` e `isPaidPlan` NO se
 * tocan — billing y SubscriptionPage siguen viendo el SKU real.
 *
 * Espeja `gymDomain.CanAccessPlusFeatures` del backend — si cambia allá,
 * cambia acá.
 */
export function canAccessPlusFeatures(plan: string | undefined | null): boolean {
  if (isDev) return true;
  return plan === "plus_monthly" || plan === "plus_annual";
}

/** Devuelve true si el gym está en cualquier SKU pagado (no trial). */
export function isPaidPlan(plan: string | undefined | null): boolean {
  return (
    plan === "standard_monthly" ||
    plan === "standard_annual" ||
    plan === "plus_monthly" ||
    plan === "plus_annual"
  );
}

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

// El flow de checkout vive end-to-end en el dashboard cloud (entinta.app).
// El desktop sólo abre la URL del dashboard via tauri shell.open en lugar
// de hablar con un endpoint local de checkout. Si en algún futuro queremos
// originar checkouts desde el desktop, el hook iría aquí — pero implica
// proxy del sidecar al cloud con refresh de tokens, lo cual no aporta UX
// real (Stripe/MP siempre abren browser, así que el dueño YA está saliendo
// del desktop).

/**
 * Effective access banner level — el FE lo usa para decidir qué banner pintar
 * en el desktop. NUNCA implica bloqueo (eso lo decide el cloud, ver
 * isSubscriptionBlocked en useAuthStore); es puro aviso.
 *
 * Returns one of:
 *  - "ok"                → sin banner (plan pagado, o trial sin fecha)
 *  - "trial_info"        → en prueba con margen (>7 días): aviso calmado, para
 *                          que el operador no piense que Tinta es gratis
 *  - "trial_soon"        → en prueba, última semana (≤7 días): ámbar
 *  - "trial_over"        → prueba vencida Y confirmada por un sync reciente:
 *                          recordatorio suave permanente (sin bloqueo)
 *  - "trial_unconfirmed" → prueba vencida pero sin sync reciente: NO afirmamos
 *                          impago (el dueño pudo suscribirse en otra laptop
 *                          mientras este sidecar estaba offline) — mensaje
 *                          neutro que pide sincronizar y se auto-corrige
 *  - "past_due"          → no pudimos cobrar la mensualidad
 *  - "cancelled"         → suscripción cancelada
 */
export type SubscriptionBannerLevel =
  | "ok"
  | "trial_info"
  | "trial_soon"
  | "trial_over"
  | "trial_unconfirmed"
  | "past_due"
  | "cancelled";

// Ventana de confianza del sync para una prueba vencida. Si sincronizamos
// dentro de este margen, el "sigue en trial" del cloud es de fiar — el cloud
// es la única fuente de verdad entre todas las laptops del gym, así que un
// sync reciente que aún ve trial significa que de verdad no han pagado. Si
// llevamos más tiempo offline, el dueño pudo suscribirse en otro lado y este
// sidecar no se ha enterado → no acusamos impago, pedimos sincronizar.
export const TRIAL_SYNC_TRUST_MS = 48 * 60 * 60 * 1000; // 48h

/** Días calendario (TZ local) hasta `iso`. Coherente con SubscriptionPage. */
export function calendarDaysUntil(
  iso: string | null | undefined,
  nowMs: number = Date.now()
): number | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const now = new Date(nowMs);
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((endMidnight - nowMidnight) / (1000 * 60 * 60 * 24));
}

function syncedRecently(iso: string | null | undefined, nowMs: number): boolean {
  if (!iso) return false;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return false;
  return nowMs - t <= TRIAL_SYNC_TRUST_MS;
}

export function bannerLevelFor(
  detail: {
    subscription_plan?: string;
    subscription_status?: SubscriptionStatus;
    trial_ends_at?: string | null;
    period_ends_at?: string | null;
    // Última sincronización exitosa (de useSyncStatus). Decide si una prueba
    // vencida está confirmada o si seguimos offline sin saber.
    last_synced_at?: string | null;
  },
  nowMs: number = Date.now()
): SubscriptionBannerLevel {
  const status = detail.subscription_status ?? "active";
  if (status === "past_due") return "past_due";
  if (status === "cancelled") return "cancelled";
  if (detail.subscription_plan === "trial") {
    if (!detail.trial_ends_at) return "ok";
    const end = new Date(detail.trial_ends_at);
    if (Number.isNaN(end.getTime())) return "ok";
    if (end.getTime() < nowMs) {
      // Prueba vencida localmente. NUNCA bloqueamos (eso es decisión del
      // cloud). Sólo afirmamos "terminó" si un sync reciente lo confirma; si
      // llevamos rato offline, mensaje neutro que pide sincronizar.
      return syncedRecently(detail.last_synced_at, nowMs)
        ? "trial_over"
        : "trial_unconfirmed";
    }
    // En prueba todavía: avisamos SIEMPRE (no sólo la última semana), calmado
    // de inicio y escalando a ámbar en los últimos 7 días.
    const days = calendarDaysUntil(detail.trial_ends_at, nowMs) ?? 0;
    return days <= 7 ? "trial_soon" : "trial_info";
  }
  return "ok";
}
