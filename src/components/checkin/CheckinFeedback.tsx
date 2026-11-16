import { useEffect, useRef, useState } from "react";
import { Check, AlertTriangle, X, Loader2, Fingerprint, Shield, Search, Hash } from "lucide-react";
import { cn } from "@/lib/utils";
import { vigenciaFrom, type Vigencia } from "@/lib/vigencia";
import { VigenciaBadge } from "@/components/members/VigenciaBadge";
import { checkin as t } from "@/strings/checkin";
import type { CheckinEvent, CheckinResult } from "@/hooks/useCheckin";
import type { AccessStatus } from "@/hooks/useMembers";

export type FeedbackKind =
  | "idle"
  | "processing"
  | "operational_error"
  // sample_rejected del sidecar: el dedazo no se leyó bien — "vuelve a
  // apoyar", tono warning. No es un rechazo de acceso.
  | "sample_rejected"
  | "success_active"
  | "success_expiring_soon"
  // allowed_override: el operador forzó la entrada. Es una entrada
  // permitida: verde y sonido de éxito, con el badge "Permitido por
  // operador" (state.override).
  | "success_override"
  | "denied_expired"
  | "denied_inactive"
  | "denied_no_membership"
  | "denied_unpaid_enrollment"
  | "denied_not_found";

export type FeedbackTone = "neutral" | "success" | "warning" | "denied";

export interface FeedbackState {
  kind: FeedbackKind;
  memberName?: string;
  daysUntilExpiry?: number | null;
  // ISO date (YYYY-MM-DD) o full timestamp. Se muestra como pill "Vence:
  // 12 jun 2026" cuando hay una membership en juego (vigente, por
  // vencer, vencida). Da contexto explícito además del "vence en N
  // días" del detalle textual.
  expiryDate?: string | null;
  override?: boolean;
  detail?: string;
}

// Record exhaustivo: si el backend agrega un resultado y se suma a
// CheckinResult, TypeScript obliga a decidir aquí cómo se ve. Antes un
// resultado sin mapear caía en "No encontramos a este socio".
const RESULT_TO_KIND: Record<CheckinResult, FeedbackKind> = {
  allowed_active: "success_active",
  allowed_expiring_soon: "success_expiring_soon",
  allowed_override: "success_override",
  denied_expired: "denied_expired",
  denied_inactive: "denied_inactive",
  denied_no_membership: "denied_no_membership",
  denied_unpaid_enrollment: "denied_unpaid_enrollment",
  denied_not_found: "denied_not_found",
};

export function eventToFeedback(ev: CheckinEvent): FeedbackState {
  return {
    kind: RESULT_TO_KIND[ev.result] ?? "denied_not_found",
    memberName: ev.member_name ?? undefined,
    daysUntilExpiry: ev.days_until_expiry,
    expiryDate: ev.expiry_date,
    override: ev.manual_override,
  };
}

export function feedbackTone(kind: FeedbackKind): FeedbackTone {
  switch (kind) {
    case "idle":
    case "processing":
      return "neutral";
    case "success_active":
    case "success_override":
      return "success";
    case "operational_error":
    case "sample_rejected":
    case "success_expiring_soon":
      return "warning";
    case "denied_expired":
    case "denied_inactive":
    case "denied_no_membership":
    case "denied_unpaid_enrollment":
    case "denied_not_found":
      return "denied";
  }
}

// Exportada para superficies que pintan el resultado con su propio layout
// (p.ej. la tarjeta compacta de la ventana flotante) pero DEBEN decir
// exactamente lo mismo que el kiosko — un socio que ve mensajes distintos
// en cada pantalla desconfía del sistema.
export function feedbackDetail(state: FeedbackState): string {
  if (state.detail) return state.detail;
  const days = state.daysUntilExpiry ?? 0;
  switch (state.kind) {
    case "operational_error":
      return "No pudimos confirmar la entrada. Revisa el historial antes de repetirla.";
    case "sample_rejected":
      return t.feedback.sampleRejected;
    case "success_active":
      return t.feedback.successActive(days);
    case "success_expiring_soon":
      return t.feedback.successExpiringSoon(Math.max(0, days));
    case "success_override":
      return t.feedback.successOverride;
    case "denied_expired":
      return t.feedback.deniedExpired(Math.abs(days));
    case "denied_inactive":
      return t.feedback.deniedInactive;
    case "denied_no_membership":
      return t.feedback.deniedNoMembership;
    case "denied_unpaid_enrollment":
      return t.feedback.deniedUnpaidEnrollment;
    case "denied_not_found":
      return t.feedback.deniedNotFound;
    default:
      return "";
  }
}

// Vigencia del socio detrás de un resultado, con la misma insignia que
// búsqueda, lista, ficha y cobro. null cuando no hay socio identificado o
// el resultado no habla de su membresía (error, huella ilegible).
const KIND_TO_ACCESS: Partial<Record<FeedbackKind, AccessStatus | undefined>> = {
  success_active: "allowed_active",
  success_expiring_soon: "allowed_expiring_soon",
  // Entrada forzada: la vigencia real se infiere de la fecha.
  success_override: undefined,
  denied_expired: "denied_expired",
  denied_inactive: "denied_inactive",
  denied_no_membership: "denied_no_membership",
  denied_unpaid_enrollment: "denied_unpaid_enrollment",
};

export function feedbackVigencia(state: FeedbackState): Vigencia | null {
  if (!state.memberName || !(state.kind in KIND_TO_ACCESS)) return null;
  if (state.kind === "success_override" && !state.expiryDate) return null;
  return vigenciaFrom({ accessStatus: KIND_TO_ACCESS[state.kind], expiryDate: state.expiryDate });
}

// Línea de decisión para recepción (vista compacta): qué pasó con la
// entrada. El porqué lo dice la insignia de vigencia.
function operatorDecision(state: FeedbackState): string {
  switch (state.kind) {
    // En una entrada forzada, la insignia «Permitido por operador» ya dice
    // que fue autorizada por recepción.
    case "success_active":
    case "success_override":
      return t.feedback.operator.registered;
    case "success_expiring_soon":
      return t.feedback.operator.registeredExpiring;
    case "denied_expired":
    case "denied_inactive":
    case "denied_no_membership":
    case "denied_unpaid_enrollment":
      return t.feedback.operator.denied;
    default:
      return feedbackDetail(state);
  }
}

interface ToneStyles {
  ring: string;
  bg: string;
  text: string;
  iconBg: string;
}

const TONE_STYLES: Record<FeedbackTone, ToneStyles> = {
  neutral: {
    ring: "ring-border",
    bg: "bg-muted",
    text: "text-muted-foreground",
    iconBg: "bg-muted-foreground/10 text-muted-foreground",
  },
  success: {
    ring: "ring-success/40",
    bg: "bg-success/10",
    text: "text-success-text",
    iconBg: "bg-success text-success-foreground",
  },
  warning: {
    ring: "ring-warning/40",
    bg: "bg-warning/15",
    text: "text-warning",
    iconBg: "bg-warning-soft text-warning-foreground",
  },
  denied: {
    ring: "ring-destructive/40",
    bg: "bg-destructive/10",
    text: "text-destructive-text",
    iconBg: "bg-destructive text-destructive-foreground",
  },
};

function Icon({ tone, kind }: { tone: FeedbackTone; kind: FeedbackKind }) {
  const sizeClass = "h-20 w-20";
  if (kind === "processing") return <Loader2 className={cn(sizeClass, "animate-spin")} />;
  if (kind === "idle") return <Fingerprint className={sizeClass} strokeWidth={1.4} />;
  if (tone === "success") return <Check className={sizeClass} strokeWidth={3} />;
  if (tone === "warning") return <AlertTriangle className={sizeClass} strokeWidth={2.5} />;
  return <X className={sizeClass} strokeWidth={3} />;
}

interface Props {
  state: FeedbackState;
  size?: "lg" | "xl";
  idleMessage?: string;
  className?: string;
  idleMethod?: "fingerprint" | "number" | "manual";
  compact?: boolean;
}

export function CheckinFeedback({ state, size = "lg", idleMessage, className, idleMethod = "fingerprint", compact = false }: Props) {
  const tone = feedbackTone(state.kind);
  const styles = TONE_STYLES[tone];
  const detail = compact ? operatorDecision(state) : feedbackDetail(state);
  const vigencia = feedbackVigencia(state);
  // En recepción (compacta) la insignia dice el porqué de la decisión. En
  // el kiosco la frase ya dice los días: la insignia sólo agrega la fecha
  // de un socio vigente («Vigente · hasta 3 dic»).
  const showVigencia = !!vigencia && (compact || state.kind === "success_active");

  const circleSize =
    compact ? "h-20 w-20" : size === "xl"
      ? "h-72 w-72"
      : "h-56 w-56";

  const nameSize =
    compact ? "text-2xl" : size === "xl" ? "text-5xl" : "text-3xl md:text-4xl";

  const detailSize =
    compact ? "text-base" : size === "xl" ? "text-2xl" : "text-lg md:text-xl";

  // Animation key forzada al cambiar de tone — re-monta el círculo y dispara
  // el pop-in. React reusa el mismo div sino y la animation no se replay.
  // Excluimos idle/processing para no popear cuando vuelve a idle (post fade).
  const animationKey = state.kind === "idle" || state.kind === "processing"
    ? "static"
    : `${state.kind}-${state.memberName ?? "anon"}`;

  // motion-safe:* solo aplica si el browser/OS NO tiene prefers-reduced-motion.
  // Tailwind v3 expone esto built-in. Garantiza accesibilidad para users con
  // sensibilidad vestibular sin perder el efecto para el resto.
  const popInAnim = "motion-safe:animate-kiosk-pop-in";
  const pulseAnim = tone === "success" ? "motion-safe:animate-kiosk-pulse-success" : "";
  const shakeAnim = tone === "denied" ? "motion-safe:animate-kiosk-shake" : "";

  if (compact && state.kind === "idle") {
    return <p role="status" aria-live="polite" className={cn("text-sm text-muted-foreground", className)}>{idleMessage ?? t.feedback.idle}</p>;
  }

  return (
    <div role="status" aria-live="polite" aria-atomic="true" className={cn("flex flex-col items-center text-center", compact ? "gap-4" : "gap-6", className)}>
      <div
        key={animationKey}
        className={cn(
          "flex items-center justify-center rounded-full transition-colors duration-300",
          compact ? "[&_svg]:h-9 [&_svg]:w-9" : "ring-8",
          compact && state.kind === "idle" ? "h-16 w-16" : circleSize,
          styles.iconBg,
          styles.ring,
          !compact && popInAnim,
          !compact && pulseAnim,
          !compact && shakeAnim
        )}
        aria-hidden="true"
      >
        {state.kind === "idle" && idleMethod === "manual" ? <Search className="h-7 w-7" /> : state.kind === "idle" && idleMethod === "number" ? <Hash className="h-7 w-7" /> : state.kind === "idle" && compact ? <Fingerprint className="h-7 w-7" /> : <Icon tone={tone} kind={state.kind} />}
      </div>

      <div className="space-y-3 max-w-3xl">
        {state.kind === "idle" && (
          <p className={cn("font-medium", styles.text, detailSize)}>
            {idleMessage ?? t.feedback.idle}
          </p>
        )}
        {state.kind === "processing" && (
          <p className={cn("font-medium", styles.text, detailSize)}>{t.feedback.processing}</p>
        )}
        {state.memberName && (
          <h2
            key={`name-${animationKey}`}
            className={cn(
              "font-bold tracking-tight leading-tight",
              !compact && "motion-safe:animate-kiosk-pop-in",
              nameSize,
              tone === "denied" ? "text-destructive" : "text-foreground"
            )}
          >
            {state.memberName}
          </h2>
        )}
        {detail && state.kind !== "idle" && state.kind !== "processing" && (
          <p
            key={`detail-${animationKey}`}
            className={cn("font-medium", !compact && "motion-safe:animate-kiosk-pop-in", styles.text, detailSize)}
          >
            {detail}
          </p>
        )}
        {showVigencia && vigencia && (
          <div key={`vigencia-${animationKey}`} className={cn("flex justify-center", !compact && "motion-safe:animate-kiosk-pop-in")}>
            <VigenciaBadge
              vigencia={vigencia}
              size="md"
              className={compact ? undefined : "h-11 px-4 text-lg [&_svg]:h-5 [&_svg]:w-5"}
            />
          </div>
        )}
        {state.override && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-success-soft px-3 py-1 text-sm font-medium text-success-text motion-safe:animate-kiosk-pop-in"
            )}
          >
            <Shield className="h-4 w-4" />
            {t.feedback.overrideBadge}
          </span>
        )}
      </div>
    </div>
  );
}

interface AutoFadeOptions {
  ttlMs: number;
  enabled?: boolean;
  onExpire(): void;
}

export function useAutoFade(state: FeedbackState, opts: AutoFadeOptions): FeedbackState {
  const { ttlMs, enabled = true, onExpire } = opts;
  const [shown, setShown] = useState<FeedbackState>(state);
  const handlerRef = useRef(onExpire);
  handlerRef.current = onExpire;

  useEffect(() => {
    setShown(state);
    if (!enabled) return;
    if (state.kind === "idle" || state.kind === "processing") return;
    const id = window.setTimeout(() => {
      handlerRef.current();
    }, ttlMs);
    return () => window.clearTimeout(id);
  }, [state, ttlMs, enabled]);

  return shown;
}
