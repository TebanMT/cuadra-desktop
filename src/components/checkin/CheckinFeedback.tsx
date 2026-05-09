import { useEffect, useRef, useState } from "react";
import { Check, AlertTriangle, X, Loader2, Fingerprint, Shield } from "lucide-react";
import { cn } from "@/lib/utils";
import { checkin as t } from "@/strings/checkin";
import type { CheckinEvent } from "@/hooks/useCheckin";

export type FeedbackKind =
  | "idle"
  | "processing"
  | "success_active"
  | "success_expiring_soon"
  | "denied_expired"
  | "denied_inactive"
  | "denied_no_membership"
  | "denied_not_found";

export type FeedbackTone = "neutral" | "success" | "warning" | "denied";

export interface FeedbackState {
  kind: FeedbackKind;
  memberName?: string;
  daysUntilExpiry?: number | null;
  override?: boolean;
  detail?: string;
}

export function eventToFeedback(ev: CheckinEvent): FeedbackState {
  const map: Record<string, FeedbackKind> = {
    allowed_active: "success_active",
    allowed_expiring_soon: "success_expiring_soon",
    denied_expired: "denied_expired",
    denied_inactive: "denied_inactive",
    denied_no_membership: "denied_no_membership",
    denied_not_found: "denied_not_found",
  };
  return {
    kind: map[ev.result] ?? "denied_not_found",
    memberName: ev.member_name ?? undefined,
    daysUntilExpiry: ev.days_until_expiry,
    override: ev.manual_override,
  };
}

export function feedbackTone(kind: FeedbackKind): FeedbackTone {
  switch (kind) {
    case "idle":
    case "processing":
      return "neutral";
    case "success_active":
      return "success";
    case "success_expiring_soon":
      return "warning";
    case "denied_expired":
    case "denied_inactive":
    case "denied_no_membership":
    case "denied_not_found":
      return "denied";
  }
}

function detailFor(state: FeedbackState): string {
  const days = state.daysUntilExpiry ?? 0;
  switch (state.kind) {
    case "success_active":
      return t.feedback.successActive(days);
    case "success_expiring_soon":
      return t.feedback.successExpiringSoon(Math.max(0, days));
    case "denied_expired":
      return t.feedback.deniedExpired(Math.abs(days));
    case "denied_inactive":
      return t.feedback.deniedInactive;
    case "denied_no_membership":
      return t.feedback.deniedNoMembership;
    case "denied_not_found":
      return t.feedback.deniedNotFound;
    default:
      return "";
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
    text: "text-success",
    iconBg: "bg-success text-success-foreground",
  },
  warning: {
    ring: "ring-warning/40",
    bg: "bg-warning/15",
    text: "text-warning",
    iconBg: "bg-warning text-warning-foreground",
  },
  denied: {
    ring: "ring-destructive/40",
    bg: "bg-destructive/10",
    text: "text-destructive",
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
}

export function CheckinFeedback({ state, size = "lg", idleMessage, className }: Props) {
  const tone = feedbackTone(state.kind);
  const styles = TONE_STYLES[tone];
  const detail = detailFor(state);

  const circleSize =
    size === "xl"
      ? "h-72 w-72"
      : "h-56 w-56";

  const nameSize =
    size === "xl" ? "text-5xl" : "text-3xl md:text-4xl";

  const detailSize =
    size === "xl" ? "text-2xl" : "text-lg md:text-xl";

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

  return (
    <div className={cn("flex flex-col items-center text-center gap-6", className)}>
      <div
        key={animationKey}
        className={cn(
          "flex items-center justify-center rounded-full ring-8 transition-colors duration-300",
          circleSize,
          styles.iconBg,
          styles.ring,
          popInAnim,
          pulseAnim,
          shakeAnim
        )}
        role="status"
        aria-live="polite"
      >
        <Icon tone={tone} kind={state.kind} />
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
              "font-bold uppercase tracking-tight leading-tight motion-safe:animate-kiosk-pop-in",
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
            className={cn("font-medium motion-safe:animate-kiosk-pop-in", styles.text, detailSize)}
          >
            {detail}
          </p>
        )}
        {state.override && (
          <span
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-success/15 px-3 py-1 text-sm font-medium text-success motion-safe:animate-kiosk-pop-in"
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
