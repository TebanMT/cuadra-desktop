import { useEffect, useState } from "react";
import { format } from "date-fns";
import { AlertTriangle, Check, Fingerprint, Loader2, X } from "lucide-react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MemberPhoto } from "@/components/members/MemberPhoto";
import {
  eventToFeedback,
  feedbackDetail,
  feedbackTone,
  type FeedbackState,
  type FeedbackTone,
} from "@/components/checkin/CheckinFeedback";
import {
  useBiometricCheckinLoop,
  useBiometricStatus,
  useReaderConnected,
} from "@/hooks/useBiometric";
import { useCheckinResultRelay } from "@/hooks/useCheckinResultRelay";
import { useWindowPresence } from "@/hooks/useWindowPresence";
import { useBiometricStreamStatus } from "@/lib/biometricStreamProvider";
import { playCheckinTone, unlockAudio } from "@/lib/audio";
import { closeCurrentWindow } from "@/lib/kioskWindow";
import { saveFloatWindowPosition } from "@/lib/floatWindow";
import { KIOSK_WINDOW_LABEL } from "@/lib/windowLabels";
import { getAvatarPalette, getInitials } from "@/lib/avatar";
import { cn, isTauri } from "@/lib/utils";
import { checkin as t } from "@/strings/checkin";
import type { CheckinEvent } from "@/hooks/useCheckin";

// CheckinFloatPage — contenido de la ventana "checkin-float" (ver
// floatWindow.ts). Superficie PERSISTENTE y visible para el socio del
// resultado de cada check-in por huella, pensada para gyms con una sola PC
// y una sola pantalla: el lector vive en el mostrador, el socio apoya el
// dedo sin tocar la PC, y esta mini-ventana always-on-top le muestra el
// veredicto aunque el operador esté a media venta en la ventana principal.
//
// Decisiones clave:
//   - El Lite Client entrega los samples a la ventana CON FOCO (verificado
//     en gym piloto, 6-jul-2026). Como el operador casi siempre tiene el
//     foco en la main, es la MAIN quien procesa el check-in y nos lo relaya
//     (useCheckinResultRelay); esta ventana lo pinta y pone el tono. El
//     loop propio existe para el caso en que ESTA ventana tenga el foco
//     (recién abierta, o el operador la movió) — ahí procesamos nosotros.
//   - El último resultado queda visible hasta el siguiente. Sin auto-fade:
//     el punto de la feature es que el resultado no muera a los 3s bajo un
//     modal como le pasa al toast.
//   - v1 huella-only: sin NumberPad. Un teclado aquí robaría el foco del
//     teclado físico al operador a media venta (los dígitos del socio
//     caerían en el formulario que el operador tenga abierto). El número
//     de socio sigue viviendo en CheckinPage y en el kiosko.
//   - paused_by_enroll se muestra explícito: durante un registro de huella
//     el provider pausa el stream; sin este estado la ventana se vería
//     congelada justo frente al socio. La reanudación es sola (backoff del
//     provider) — no hay botón de reconectar.

// Tinte de fondo por tono — versión compacta de la semántica del kiosko.
// El socio lee el color desde lejos antes que el texto.
const TONE_BG: Record<FeedbackTone, string> = {
  neutral: "",
  success: "bg-success/10",
  warning: "bg-warning/15",
  denied: "bg-destructive/10",
};

const TONE_TEXT: Record<FeedbackTone, string> = {
  neutral: "text-muted-foreground",
  success: "text-success",
  warning: "text-warning",
  denied: "text-destructive",
};

function ToneIcon({ tone }: { tone: FeedbackTone }) {
  const cls = "h-5 w-5 shrink-0";
  if (tone === "success") return <Check className={cls} strokeWidth={3} />;
  if (tone === "warning") return <AlertTriangle className={cls} strokeWidth={2.5} />;
  if (tone === "denied") return <X className={cls} strokeWidth={3} />;
  return null;
}

interface LastResult {
  feedback: FeedbackState;
  memberId: string | null;
  at: string; // HH:mm local del gym (tz de la PC)
}

export default function CheckinFloatPage() {
  const bio = useBiometricStatus();
  const readerConnected = useReaderConnected();
  const streamStatus = useBiometricStreamStatus();
  const kioskPresent = useWindowPresence(KIOSK_WINDOW_LABEL);

  const fingerprintAvailable =
    !!bio.data?.available && readerConnected === true;

  const [processing, setProcessing] = useState(false);
  const [last, setLast] = useState<LastResult | null>(null);

  // Lock de scroll — misma razón que el kiosko: la ventana es un appliance,
  // no una página.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  // Persistir la posición al arrastrar, para que la próxima sesión abra la
  // ventana donde el operador la dejó (la esquina que no estorba a SU
  // layout de mostrador). Debounce corto: onMoved dispara continuo durante
  // el drag y localStorage es escritura síncrona.
  useEffect(() => {
    if (!isTauri()) return;
    let unlisten: (() => void) | undefined;
    let timer: number | undefined;
    let disposed = false;
    (async () => {
      try {
        const { getCurrentWebviewWindow } = await import(
          "@tauri-apps/api/webviewWindow"
        );
        const win = getCurrentWebviewWindow();
        const un = await win.onMoved(({ payload }) => {
          window.clearTimeout(timer);
          timer = window.setTimeout(async () => {
            try {
              // onMoved reporta píxeles físicos; la creación de la ventana
              // recibe lógicos — convertimos con el scale factor actual.
              const factor = await win.scaleFactor();
              saveFloatWindowPosition({
                x: Math.round(payload.x / factor),
                y: Math.round(payload.y / factor),
              });
            } catch {
              // best effort — perder una posición no rompe nada
            }
          }, 150);
        });
        if (disposed) un();
        else unlisten = un;
      } catch {
        // fuera de Tauri o API no disponible — la posición no se persiste
      }
    })();
    return () => {
      disposed = true;
      window.clearTimeout(timer);
      unlisten?.();
    };
  }, []);

  function announceTone(state: FeedbackState) {
    const tone = feedbackTone(state.kind);
    if (tone === "success") playCheckinTone("success");
    else if (tone === "warning") playCheckinTone("warning");
    else if (tone === "denied") playCheckinTone("denied");
  }

  // Pintar un resultado + tono — mismo camino para los check-ins que esta
  // ventana procesó (loop propio, cuando tuvo el foco) y para los que la
  // main procesó y nos relaya. El socio no distingue quién posteó.
  function showCheckin(ev: CheckinEvent) {
    const fb = eventToFeedback(ev);
    const when = new Date(ev.created_at);
    setLast({
      feedback: fb,
      memberId: ev.member_id,
      at: format(Number.isNaN(when.getTime()) ? new Date() : when, "HH:mm"),
    });
    setProcessing(false);
    announceTone(fb);
  }

  function showNoMatch() {
    const fb: FeedbackState = { kind: "denied_not_found" };
    setLast({ feedback: fb, memberId: null, at: format(new Date(), "HH:mm") });
    setProcessing(false);
    announceTone(fb);
  }

  // Loop propio — sólo recibe samples cuando ESTA ventana tiene el foco
  // (enrutamiento por foco del Lite Client). Se apaga si el kiosko está
  // abierto (exclusión mutua) o si no hay lector utilizable.
  useBiometricCheckinLoop({
    enabled: fingerprintAvailable && !kioskPresent,
    onAttempt: () => setProcessing(true),
    onCheckin: showCheckin,
    onNoMatch: showNoMatch,
    onError: () => {
      // El header ya refleja el estado del lector vía el dot + el estado
      // "lector desconectado" del body; un sample fallido no borra el
      // último resultado.
      setProcessing(false);
    },
  });

  // Resultados procesados por la main (o el kiosko) — el camino NORMAL en
  // operación real: el operador tiene el foco en la main, la main postea y
  // esta ventana sólo exhibe. Esta ventana no emite nada (vive en la misma
  // pantalla del operador), así que no hay echo que filtrar aquí, pero el
  // hook lo hace de todos modos por si eso cambia.
  useCheckinResultRelay({
    onCheckin: showCheckin,
    onNoMatch: showNoMatch,
  });

  const readerDotOn = streamStatus === "running";

  return (
    // unlockAudio en pointer/keydown: el AudioContext del webview puede
    // nacer suspendido hasta un gesto; arrastrar la ventana ya cuenta.
    <div
      className="flex h-screen w-screen flex-col overflow-hidden border border-border bg-background select-none"
      onPointerDown={unlockAudio}
      onKeyDown={unlockAudio}
    >
      {/* Header = chrome propio (la ventana no tiene decoraciones):
          drag-region para mover + dot de estado del lector + cerrar.
          data-tauri-drag-region sólo aplica al elemento que recibe el
          mousedown, por eso los hijos informativos llevan
          pointer-events-none y el botón de cerrar lo re-activa. */}
      <header
        data-tauri-drag-region
        className="flex h-9 shrink-0 items-center gap-2 border-b border-border px-3 cursor-move"
      >
        <span
          aria-hidden="true"
          className={cn(
            "pointer-events-none h-2.5 w-2.5 rounded-full transition-colors",
            readerDotOn ? "bg-success" : "bg-muted-foreground/40",
          )}
        />
        <span className="pointer-events-none text-xs font-semibold text-muted-foreground">
          {t.float.title}
        </span>
        {last && (
          <span className="pointer-events-none ml-1 text-[11px] tabular-nums text-muted-foreground/70">
            {t.float.lastResultAt(last.at)}
          </span>
        )}
        <button
          type="button"
          aria-label={t.float.closeAria}
          onClick={() => void closeCurrentWindow()}
          className="pointer-events-auto ml-auto inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
        >
          <X className="h-4 w-4" />
        </button>
      </header>

      <main className="min-h-0 flex-1">
        <FloatBody
          kioskPresent={kioskPresent}
          pausedByEnroll={streamStatus === "paused_by_enroll"}
          fingerprintAvailable={fingerprintAvailable}
          processing={processing}
          last={last}
        />
      </main>
    </div>
  );
}

// Estado del cuerpo por prioridad: kiosko activo > pausa por enroll >
// lector caído > identificando > último resultado > esperando huella.
// La pausa por enroll gana sobre el resultado viejo a propósito: es el
// estado que evita que la ventana se vea "congelada" frente al socio
// mientras recepción registra una huella nueva.
function FloatBody({
  kioskPresent,
  pausedByEnroll,
  fingerprintAvailable,
  processing,
  last,
}: {
  kioskPresent: boolean;
  pausedByEnroll: boolean;
  fingerprintAvailable: boolean;
  processing: boolean;
  last: LastResult | null;
}) {
  if (kioskPresent) {
    return (
      <CenteredState
        icon={<Fingerprint className="h-9 w-9" strokeWidth={1.4} />}
        title={t.float.kioskActiveTitle}
        subtitle={t.float.kioskActiveBody}
      />
    );
  }
  if (pausedByEnroll) {
    return (
      <CenteredState
        tone="warning"
        icon={
          <Fingerprint
            className="h-9 w-9 motion-safe:animate-pulse"
            strokeWidth={1.4}
          />
        }
        title={t.float.enrollPauseTitle}
        subtitle={t.float.enrollPauseBody}
      />
    );
  }
  if (!fingerprintAvailable) {
    return (
      <CenteredState
        icon={<Fingerprint className="h-9 w-9" strokeWidth={1.4} />}
        title={t.float.readerDisconnected}
      />
    );
  }
  if (processing) {
    return (
      <CenteredState
        icon={<Loader2 className="h-9 w-9 animate-spin" />}
        title={t.feedback.processing}
      />
    );
  }
  if (last) {
    return <ResultCard last={last} />;
  }
  return (
    <CenteredState
      icon={<Fingerprint className="h-9 w-9" strokeWidth={1.4} />}
      title={t.float.waiting}
    />
  );
}

function CenteredState({
  icon,
  title,
  subtitle,
  tone = "neutral",
}: {
  icon: React.ReactNode;
  title: string;
  subtitle?: string;
  tone?: FeedbackTone;
}) {
  return (
    <div
      className={cn(
        "flex h-full flex-col items-center justify-center gap-2 px-4 text-center",
        TONE_BG[tone],
        TONE_TEXT[tone],
      )}
      role="status"
      aria-live="polite"
    >
      {icon}
      <p className="text-sm font-semibold leading-snug">{title}</p>
      {subtitle && <p className="text-xs opacity-80">{subtitle}</p>}
    </div>
  );
}

// Tarjeta del resultado: foto + nombre + veredicto con el MISMO texto que
// el kiosko (feedbackDetail). Legible a ~1.5 m: nombre grande y color de
// fondo por tono para leer el veredicto antes que el texto.
function ResultCard({ last }: { last: LastResult }) {
  const { feedback, memberId } = last;
  const tone = feedbackTone(feedback.kind);
  const detail = feedbackDetail(feedback);
  const name = feedback.memberName;
  const palette = getAvatarPalette(name);

  // key fuerza remount al cambiar de resultado → replay del pop-in aunque
  // dos socios consecutivos compartan tono (mismo truco que CheckinFeedback).
  const animKey = `${feedback.kind}-${name ?? "anon"}-${last.at}`;

  return (
    <div
      key={animKey}
      className={cn(
        "flex h-full items-center gap-3 px-4 transition-colors motion-safe:animate-kiosk-pop-in",
        TONE_BG[tone],
      )}
      role="status"
      aria-live="polite"
    >
      {name ? (
        <Avatar className="h-16 w-16 shrink-0 ring-2 ring-background">
          <MemberPhoto memberId={memberId ?? undefined} />
          <AvatarFallback
            className="text-lg font-semibold"
            style={{ backgroundColor: palette.bg, color: palette.text }}
          >
            {getInitials(name)}
          </AvatarFallback>
        </Avatar>
      ) : (
        <div
          className={cn(
            "flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-destructive/15",
            TONE_TEXT[tone],
          )}
        >
          <Fingerprint className="h-8 w-8" strokeWidth={1.6} />
        </div>
      )}
      <div className="min-w-0 flex-1">
        <div className={cn("flex items-center gap-1.5", TONE_TEXT[tone])}>
          <ToneIcon tone={tone} />
          <p className="truncate text-lg font-bold leading-tight text-foreground">
            {name ?? t.float.noMatchTitle}
          </p>
        </div>
        {detail && (
          <p
            className={cn(
              "mt-1 text-[13px] font-medium leading-snug",
              TONE_TEXT[tone],
            )}
          >
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}
