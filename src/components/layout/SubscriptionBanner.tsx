import { useMemo } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, CreditCard, Hourglass } from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { bannerLevelFor, type SubscriptionBannerLevel } from "@/hooks/useSubscription";
import { cn } from "@/lib/utils";

const TONE: Record<SubscriptionBannerLevel, { bg: string; text: string; icon: typeof AlertTriangle }> = {
  ok: { bg: "", text: "", icon: AlertTriangle },
  trial_soon: {
    bg: "bg-warning/10 border-warning/40",
    text: "text-warning-foreground",
    icon: Hourglass,
  },
  trial_over: {
    bg: "bg-warning/15 border-warning/50",
    text: "text-warning-foreground",
    icon: Hourglass,
  },
  past_due: {
    bg: "bg-destructive/10 border-destructive/50",
    text: "text-destructive",
    icon: CreditCard,
  },
  cancelled: {
    bg: "bg-destructive/10 border-destructive/50",
    text: "text-destructive",
    icon: AlertTriangle,
  },
};

function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const end = new Date(iso);
  if (Number.isNaN(end.getTime())) return null;
  // Días calendario en TZ local — alineado con la fecha que muestra
  // SubscriptionPage en la card "Tu prueba termina el ___".
  const endMidnight = new Date(end.getFullYear(), end.getMonth(), end.getDate()).getTime();
  const now = new Date();
  const nowMidnight = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  return Math.round((endMidnight - nowMidnight) / (1000 * 60 * 60 * 24));
}

function copyFor(level: SubscriptionBannerLevel, daysLeft: number | null): string {
  switch (level) {
    case "trial_soon":
      if (daysLeft === null) return "Tu período de prueba está por terminar.";
      if (daysLeft <= 1) return "Tu período de prueba termina hoy.";
      return `Te quedan ${daysLeft} días de prueba. Activa tu plan para no perder acceso.`;
    case "trial_over":
      return "Tu período de prueba terminó. Activa tu plan para seguir cobrando con Tinta.";
    case "past_due":
      return "No pudimos cobrar tu mensualidad. Actualiza tu método de pago para evitar interrupciones.";
    case "cancelled":
      return "Tu suscripción fue cancelada. Reactiva el plan para seguir usando Tinta.";
    default:
      return "";
  }
}

/**
 * Sticky banner at the very top of the dashboard. Shows nothing for
 * subscriptions in good standing; otherwise renders an actionable warning
 * that links to /settings/subscription.
 *
 * Source data is the cached gym from useAuthStore (no extra fetch). When the
 * settings page mutates the subscription, the gym is refreshed via /auth/me.
 */
export function SubscriptionBanner() {
  const gym = useAuthStore((s) => s.gym);
  const level = useMemo<SubscriptionBannerLevel>(
    () =>
      bannerLevelFor({
        subscription_plan: gym?.subscription_plan,
        subscription_status: gym?.subscription_status,
        trial_ends_at: gym?.trial_ends_at,
        period_ends_at: gym?.subscription_ends_at,
      }),
    [gym]
  );

  if (level === "ok" || !gym) return null;

  const daysLeft =
    level === "trial_soon" || level === "trial_over"
      ? daysUntil(gym.trial_ends_at)
      : null;
  const copy = copyFor(level, daysLeft);
  const tone = TONE[level];
  const Icon = tone.icon;

  return (
    <div
      role="status"
      className={cn(
        "border-b text-sm flex items-center justify-between gap-3 px-6 py-2",
        tone.bg,
        tone.text
      )}
    >
      <div className="flex items-center gap-2 min-w-0">
        <Icon className="h-4 w-4 shrink-0" />
        <span className="truncate">{copy}</span>
      </div>
      <Link
        to="/settings/subscription"
        className="text-sm font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap"
      >
        Ver plan
      </Link>
    </div>
  );
}
