import { useMemo } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  CreditCard,
  Hourglass,
  RefreshCw,
  WifiOff,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  bannerLevelFor,
  calendarDaysUntil,
  type SubscriptionBannerLevel,
} from "@/hooks/useSubscription";
import { useSyncStatus, useTriggerSync } from "@/hooks/useSyncStatus";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/dates";

const TONE: Record<SubscriptionBannerLevel, { bg: string; text: string; icon: typeof AlertTriangle }> = {
  ok: { bg: "", text: "", icon: AlertTriangle },
  // Aviso calmado durante el grueso de la prueba: informa sin alarmar, para
  // que el operador no piense que Tinta es gratis.
  trial_info: {
    bg: "bg-muted/60 border-border",
    text: "text-foreground",
    icon: Hourglass,
  },
  trial_soon: {
    bg: "bg-warning-soft border-warning/40",
    text: "text-warning-foreground",
    icon: Hourglass,
  },
  // Prueba vencida confirmada: recordatorio suave permanente, no bloqueo.
  trial_over: {
    bg: "bg-warning-soft border-warning/40",
    text: "text-warning-foreground",
    icon: CreditCard,
  },
  // Prueba vencida sin sync reciente: neutro, no acusatorio. Pide sincronizar.
  trial_unconfirmed: {
    bg: "bg-muted/60 border-border",
    text: "text-muted-foreground",
    icon: WifiOff,
  },
  // Prueba cerrada por el cloud, con días de gracia: ámbar con fecha de corte.
  trial_grace: {
    bg: "bg-warning-soft border-warning/40",
    text: "text-warning-foreground",
    icon: Hourglass,
  },
  // Solo lectura: ámbar, no rojo. La recepción sigue registrando entradas.
  trial_read_only: {
    bg: "bg-warning-soft border-warning/40",
    text: "text-warning-foreground",
    icon: CreditCard,
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

// The operator cannot pay or change the plan: tell them who can, never
// "actualiza tu método de pago" as if they were the owner.
function operatorCopyFor(
  level: SubscriptionBannerLevel,
  daysLeft: number | null,
  graceEndsAt: string | null
): string {
  const ask = "Avísale al dueño para que active el plan";
  switch (level) {
    case "trial_info":
      if (daysLeft === null) return "Tinta está en versión de prueba.";
      return `Versión de prueba · ${daysLeft === 1 ? "queda" : "quedan"} ${daysLeft} ${daysLeft === 1 ? "día" : "días"}.`;
    case "trial_soon":
      if (daysLeft === null) return `La prueba está por terminar. ${ask}.`;
      if (daysLeft <= 1) return `La prueba termina hoy. ${ask}.`;
      return `Quedan ${daysLeft} días de prueba. ${ask}.`;
    case "trial_over":
      return `La prueba terminó. ${ask}; en unos días la recepción quedará en solo lectura.`;
    case "trial_grace":
      return `La prueba terminó. ${ask} antes del ${fmtDate(graceEndsAt)}; después la recepción queda en solo lectura.`;
    case "trial_read_only":
      return `Prueba terminada · Solo lectura: puedes consultar y registrar entradas. ${ask}.`;
    case "trial_unconfirmed":
      return "No pudimos confirmar el plan. Conéctate a internet para sincronizar.";
    case "past_due":
      return "No se pudo cobrar la mensualidad de Tinta. Avísale al dueño para que revise su método de pago.";
    case "cancelled":
      return "La suscripción de Tinta fue cancelada. Avísale al dueño para reactivar el plan.";
    default:
      return "";
  }
}

function copyFor(
  level: SubscriptionBannerLevel,
  daysLeft: number | null,
  graceEndsAt: string | null
): string {
  switch (level) {
    case "trial_info":
      if (daysLeft === null) return "Estás en la versión de prueba.";
      return `Versión de prueba · te ${daysLeft === 1 ? "queda" : "quedan"} ${daysLeft} ${
        daysLeft === 1 ? "día" : "días"
      }. Activa tu plan cuando estés listo.`;
    case "trial_soon":
      if (daysLeft === null) return "Tu período de prueba está por terminar.";
      if (daysLeft <= 1) return "Tu período de prueba termina hoy.";
      return `Te quedan ${daysLeft} días de prueba. Activa tu plan para no perder acceso.`;
    case "trial_over":
      return "Tu prueba terminó. Activa tu plan; en unos días la recepción quedará en solo lectura.";
    case "trial_grace":
      return `Tu prueba terminó. Activa tu plan antes del ${fmtDate(graceEndsAt)}; después la recepción queda en solo lectura.`;
    case "trial_read_only":
      return "Prueba terminada · Solo lectura: puedes consultar y registrar entradas. Activa tu plan para cobrar y hacer cambios.";
    case "trial_unconfirmed":
      return "No pudimos confirmar tu plan. Conéctate a internet para sincronizar.";
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
 * subscriptions in good standing; otherwise renders un aviso accionable.
 *
 * NUNCA bloquea ni limita funcionalidad — eso lo decide el cloud
 * (isSubscriptionBlocked / isTrialReadOnly). Este banner es puro aviso:
 * visibilidad, no candado.
 *
 * Fuentes de datos (ambas locales, funcionan offline):
 *  - gym cacheado en useAuthStore (plan/status/trial_ends_at, refrescado por
 *    /auth/me; se actualiza solo cuando el sync trae una suscripción nueva);
 *  - last_synced_at de useSyncStatus, para decidir si una prueba vencida está
 *    confirmada o si seguimos offline sin saber (caso "se suscribió en otra
 *    laptop"). El estado se auto-corrige en cuanto sincroniza.
 */
export function SubscriptionBanner() {
  const gym = useAuthStore((s) => s.gym);
  const isOwner = useAuthStore((s) => s.user?.role === "owner");
  const { data: sync } = useSyncStatus();
  const trigger = useTriggerSync();
  const syncing = trigger.isPending || sync?.sync_in_progress === true;

  const level = useMemo<SubscriptionBannerLevel>(
    () =>
      bannerLevelFor({
        subscription_plan: gym?.subscription_plan,
        subscription_status: gym?.subscription_status,
        trial_ends_at: gym?.trial_ends_at,
        period_ends_at: gym?.subscription_ends_at,
        last_synced_at: sync?.last_synced_at,
      }),
    [gym, sync?.last_synced_at]
  );

  if (level === "ok" || !gym) return null;

  const daysLeft =
    level === "trial_info" || level === "trial_soon"
      ? calendarDaysUntil(gym.trial_ends_at)
      : null;
  const copy = (isOwner ? copyFor : operatorCopyFor)(level, daysLeft, gym.subscription_ends_at);
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
      {/* Wraps instead of truncating: the part that says what to do is at
          the end of the sentence. */}
      <div className="flex items-center gap-2 min-w-0">
        <Icon aria-hidden="true" className="h-4 w-4 shrink-0" />
        <span className="min-w-0">{copy}</span>
      </div>
      {level === "trial_unconfirmed" ? (
        // La acción que de verdad resuelve la duda: sincronizar. Si ya pagó en
        // otra laptop, el sync trae el plan nuevo y el banner desaparece.
        <button
          onClick={() => trigger.mutate()}
          disabled={syncing}
          aria-busy={syncing}
          className="flex items-center gap-1 text-sm font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap disabled:opacity-50"
        >
          <RefreshCw aria-hidden="true" className={cn("h-3.5 w-3.5 motion-reduce:animate-none", syncing && "animate-spin")} />
          {syncing ? "Sincronizando…" : "Sincronizar"}
        </button>
      ) : isOwner ? (
        // «Ver plan» opens an owner-only route: the operator would be bounced.
        <Link
          to="/settings/subscription"
          className="text-sm font-semibold underline underline-offset-2 hover:no-underline whitespace-nowrap"
        >
          Ver plan
        </Link>
      ) : null}
    </div>
  );
}
