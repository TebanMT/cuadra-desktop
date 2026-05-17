import { memo, useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { CheckinFeedback, eventToFeedback, feedbackTone, useAutoFade, type FeedbackState } from "@/components/checkin/CheckinFeedback";
import { PinPad } from "@/components/checkin/PinPad";
import { KioskExitDialog } from "@/components/checkin/KioskExitDialog";
import {
  checkinErrorMessage,
  useCheckinByPin,
  useCheckinCountToday,
  useCheckinMethods,
} from "@/hooks/useCheckin";
import {
  useBiometricCheckinLoop,
  useBiometricStatus,
  useReaderConnected,
} from "@/hooks/useBiometric";
import { useSyncStatus, levelOf } from "@/hooks/useSyncStatus";
import { playCheckinTone, unlockAudio } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { closeCurrentWindow, isCurrentWindowKiosk } from "@/lib/kioskWindow";
import { checkin as t } from "@/strings/checkin";

const AUTOFADE_MS = 3500;

/**
 * Reloj memoizado — re-render solo cuando cambia el minuto, no cada
 * segundo. Optimización para el kiosko que vive horas en pantalla:
 * 60× menos renders del árbol de KioskPage.
 *
 * Muestra HH:mm grande + fecha en español debajo (ej. "lun 8 de mayo").
 */
const KioskClock = memo(function KioskClock({ now }: { now: Date }) {
  return (
    <div className="flex flex-col" aria-live="off">
      <div className="text-7xl font-bold tracking-tight tabular-nums text-foreground leading-none">
        {format(now, "HH:mm")}
      </div>
      <div className="mt-1 text-sm font-medium text-muted-foreground capitalize">
        {format(now, "EEEE d 'de' MMMM", { locale: es })}
      </div>
    </div>
  );
});

export default function KioskPage() {
  const navigate = useNavigate();
  // Matcher (sidecar) availability — does the BE have NBIS binaries + a
  // gym keyed in? Separate from physical scanner presence (Lite Client +
  // USB), which the JS SDK reports via useReaderConnected.
  const bio = useBiometricStatus();
  const readerConnected = useReaderConnected();
  const methods = useCheckinMethods();
  const sync = useSyncStatus();
  const count = useCheckinCountToday();

  const [feedback, setFeedback] = useState<FeedbackState>({ kind: "idle" });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinShake, setPinShake] = useState(false);
  const [exitOpen, setExitOpen] = useState(false);
  // Tick por minuto en lugar de por segundo — el reloj solo necesita
  // precisión al minuto. Reduce wakeups + repaints en el OS host.
  const [now, setNow] = useState(() => new Date());

  // "available" = sidecar matcher is ready AND physical scanner is plugged
  // in (the SDK can talk to the Lite Client + sees a device). The pre-ADR
  // flow only checked the sidecar; now we need both.
  const fingerprintAvailable =
    !!bio.data?.available && readerConnected === true;
  const pinAvailable = methods.data?.pin_available ?? false;

  // Clock tick al cambio de minuto. El primer setTimeout calcula los ms
  // hasta el próximo minuto exacto (HH:MM:00) y desde ahí cada 60s.
  useEffect(() => {
    let intervalId: number | undefined;
    const msUntilNextMinute = 60000 - (Date.now() % 60000);
    const initialId = window.setTimeout(() => {
      setNow(new Date());
      intervalId = window.setInterval(() => setNow(new Date()), 60000);
    }, msUntilNextMinute);
    return () => {
      window.clearTimeout(initialId);
      if (intervalId) window.clearInterval(intervalId);
    };
  }, []);

  // Hide cursor in kiosk mode despues de 3s sin movimiento — sutil
  // pero hace ver el kiosko más "appliance" y menos "computadora con
  // el browser abierto". El cursor reaparece con cualquier movimiento.
  useEffect(() => {
    let timeoutId: number | undefined;
    const hideCursor = () => {
      document.body.style.cursor = "none";
    };
    const showCursor = () => {
      document.body.style.cursor = "";
      window.clearTimeout(timeoutId);
      timeoutId = window.setTimeout(hideCursor, 3000);
    };
    showCursor();
    window.addEventListener("mousemove", showCursor);
    window.addEventListener("touchstart", showCursor);
    return () => {
      window.clearTimeout(timeoutId);
      window.removeEventListener("mousemove", showCursor);
      window.removeEventListener("touchstart", showCursor);
      document.body.style.cursor = "";
    };
  }, []);

  // Lock body scroll mientras estamos en kiosko.
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const reset = useCallback(() => {
    setFeedback({ kind: "idle" });
    setPin("");
    setPinError(null);
  }, []);

  useAutoFade(feedback, { ttlMs: AUTOFADE_MS, onExpire: reset });

  function announceTone(state: FeedbackState) {
    const tone = feedbackTone(state.kind);
    if (tone === "success") playCheckinTone("success");
    else if (tone === "warning") playCheckinTone("warning");
    else if (tone === "denied") playCheckinTone("denied");
  }

  // Capture vive en el frontend per ADR-004-bis. El JS SDK habla con el
  // Lite Client local; cada huella detectada POST-ea a /biometric/checkin
  // y el backend ejecuta UC-029 contra la galería del gym activo.
  useBiometricCheckinLoop({
    enabled: fingerprintAvailable,
    onAttempt: () => setFeedback({ kind: "processing" }),
    onCheckin: (ev) => {
      const fb = eventToFeedback(ev);
      setFeedback(fb);
      announceTone(fb);
    },
    onNoMatch: () => {
      const fb: FeedbackState = { kind: "denied_not_found" };
      setFeedback(fb);
      announceTone(fb);
    },
    onError: () => {
      // SDK / matcher failure mid-stream. El banner ya refleja el estado
      // del lector vía useReaderConnected; no duplicamos aquí.
    },
  });

  const checkinPin = useCheckinByPin();

  async function submitPin(value?: string) {
    const candidate = value ?? pin;
    if (candidate.length !== 4) return;
    setFeedback({ kind: "processing" });
    setPinError(null);
    try {
      const ev = await checkinPin.mutateAsync({ pin: candidate });
      const fb = eventToFeedback(ev);
      setFeedback(fb);
      announceTone(fb);
      setPin("");
    } catch (err) {
      const msg = checkinErrorMessage(err, t.pinPad.invalid);
      setPinError(msg);
      setFeedback({ kind: "denied_not_found", detail: msg });
      // Shake brief en el PinPad como feedback haptico-visual
      // de "intento incorrecto". 360ms total, sin acumular si
      // hay clics rápidos.
      setPinShake(true);
      window.setTimeout(() => setPinShake(false), 400);
      playCheckinTone("denied");
      setPin("");
    }
  }

  // Auto-submit al llegar a 4 dígitos — saves el OK tap y baja ~0.5s
  // del roundtrip del kiosko. Solo en kiosk-mode.
  useEffect(() => {
    if (pin.length === 4 && !checkinPin.isPending) {
      submitPin(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  // Hidden Ctrl+Shift+K combo to exit
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.shiftKey && e.key.toLowerCase() === "k") {
        e.preventDefault();
        setExitOpen(true);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  // Mensaje del idle priorizando el contexto: ambos métodos > solo huella
  // > solo PIN > nada configurado (último caso es edge: gym sin operadores
  // con PIN ni huella registrada — mejor un mensaje que un kiosko mudo).
  const idleMessage =
    fingerprintAvailable && pinAvailable
      ? t.kiosk.waitingPin
      : fingerprintAvailable
      ? t.kiosk.waiting
      : pinAvailable
      ? t.kiosk.waitingNoReader
      : t.kiosk.waitingNoReaderNoPin;

  const syncLevel = levelOf(sync.data);
  const SyncIcon =
    syncLevel === "ok" ? CheckCircle2 : syncLevel === "warn" ? AlertTriangle : AlertCircle;
  const syncColor =
    syncLevel === "ok" ? "text-success" : syncLevel === "warn" ? "text-warning" : "text-destructive";

  return (
    <div
      className="fixed inset-0 z-50 flex h-screen w-screen flex-col bg-background"
      onPointerDown={unlockAudio}
      onKeyDown={unlockAudio}
    >
      {/* Top bar — reloj + fecha a la izquierda; counter + reader status a la derecha. */}
      <div className="absolute top-6 left-6 right-6 flex items-start justify-between text-muted-foreground pointer-events-none">
        <KioskClock now={now} />
        <div className="flex flex-col items-end gap-2">
          <div
            className="text-base font-medium tabular-nums"
            aria-live="polite"
            aria-atomic="true"
          >
            {t.page.todayCount(count.data?.count_today ?? 0)}
          </div>
          {readerConnected === false && (
            <div className="text-xs text-warning bg-warning/10 px-2 py-1 rounded-md font-medium">
              {t.reader.disconnectedBanner}
            </div>
          )}
        </div>
      </div>

      {/* Main feedback area — central, large, animated. */}
      <main className="flex flex-1 items-center justify-center px-12">
        <div className="flex flex-col items-center gap-10 w-full max-w-3xl">
          <CheckinFeedback state={feedback} idleMessage={idleMessage} size="xl" />

          {pinAvailable && feedback.kind === "idle" && (
            <div
              className={cn(
                "w-full max-w-md space-y-3",
                pinShake && "motion-safe:animate-kiosk-shake"
              )}
            >
              <PinPad
                value={pin}
                onChange={(v) => {
                  setPin(v);
                  if (pinError) setPinError(null);
                }}
                onSubmit={submitPin}
                disabled={checkinPin.isPending}
                size="lg"
              />
              {pinError && (
                <p
                  className="text-sm text-destructive text-center font-medium"
                  role="alert"
                >
                  {pinError}
                </p>
              )}
            </div>
          )}
        </div>
      </main>

      {/* Bottom bar — sync status + exit hint. Sutil, no distrae. */}
      <div className="absolute bottom-4 left-6 right-6 flex items-center justify-between text-xs text-muted-foreground pointer-events-none">
        {/* Brand mark sutil — confirma "esto corre con Tinta" sin
            competir con el branding visual del gym. */}
        <span className="font-display font-semibold opacity-40 inline-flex items-baseline relative" style={{ letterSpacing: "-0.02em" }}>
          T<span className="relative inline-block">
            <span aria-hidden="true" className="absolute bg-brick-500 rounded-full" style={{ width: "0.18em", height: "0.18em", top: "-0.05em", left: "0.10em" }} />
            inta
          </span>
        </span>
        <div className="flex items-center gap-3">
          <span className="inline-flex items-center gap-1.5 opacity-70">
            <SyncIcon className={cn("h-4 w-4", syncColor)} />
            <span>{syncLevel === "fail" ? t.kiosk.syncOffline : t.kiosk.sync}</span>
          </span>
          <span className="opacity-50" aria-hidden="true">·</span>
          <span className="opacity-70">{t.kiosk.exitHint}</span>
        </div>
      </div>

      <KioskExitDialog
        open={exitOpen}
        onOpenChange={setExitOpen}
        onAuthorized={async () => {
          // En producción, el kiosko vive en su propia WebviewWindow —
          // cerrar la ventana lo saca del modo kiosko sin afectar la main.
          // En el flujo legacy (navegación directa a /kiosk en la main),
          // volvemos al checkin.
          if (await isCurrentWindowKiosk()) {
            await closeCurrentWindow();
          } else {
            navigate("/checkin");
          }
        }}
      />
    </div>
  );
}
