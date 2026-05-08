import { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CheckCircle2, AlertTriangle, AlertCircle } from "lucide-react";
import { format } from "date-fns";
import { CheckinFeedback, eventToFeedback, feedbackTone, useAutoFade, type FeedbackState } from "@/components/checkin/CheckinFeedback";
import { PinPad } from "@/components/checkin/PinPad";
import { KioskExitDialog } from "@/components/checkin/KioskExitDialog";
import {
  checkinErrorMessage,
  useCheckinByPin,
  useCheckinCountToday,
  useCheckinMethods,
  useKioskEvents,
} from "@/hooks/useCheckin";
import { useBiometricStatus } from "@/hooks/useBiometric";
import { useSyncStatus, levelOf } from "@/hooks/useSyncStatus";
import { playCheckinTone, unlockAudio } from "@/lib/audio";
import { cn } from "@/lib/utils";
import { checkin as t } from "@/strings/checkin";

const AUTOFADE_MS = 3500;

export default function KioskPage() {
  const navigate = useNavigate();
  const bio = useBiometricStatus();
  const methods = useCheckinMethods();
  const sync = useSyncStatus();
  const count = useCheckinCountToday();

  const [feedback, setFeedback] = useState<FeedbackState>({ kind: "idle" });
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [exitOpen, setExitOpen] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const fingerprintAvailable = !!bio.data?.reader?.connected;
  const pinAvailable = methods.data?.pin_available ?? false;

  // Clock tick (every second for the big display)
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000);
    return () => window.clearInterval(id);
  }, []);

  // Lock to fullscreen-ish: hide cursor while idle? Just keep layout fullscreen via CSS.
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

  useKioskEvents({
    enabled: fingerprintAvailable,
    onEvent: (ev) => {
      if (ev.kind === "attempt_started") {
        setFeedback({ kind: "processing" });
        return;
      }
      if (ev.kind === "checkin_result" && ev.checkin) {
        const fb = eventToFeedback(ev.checkin);
        setFeedback(fb);
        announceTone(fb);
      }
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
      playCheckinTone("denied");
      setPin("");
    }
  }

  // Auto-submit the moment the operator reaches 4 digits — saves the extra
  // OK tap and shaves ~0.5s off the kiosk roundtrip. Kiosk-mode only.
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

  const idleMessage = fingerprintAvailable && pinAvailable
    ? t.kiosk.waitingPin
    : fingerprintAvailable
    ? t.kiosk.waiting
    : t.kiosk.waitingNoReader;

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
      <div className="absolute top-6 left-6 right-6 flex items-start justify-between text-muted-foreground pointer-events-none">
        <div className="text-7xl font-bold tracking-tight tabular-nums text-foreground">
          {format(now, "HH:mm")}
        </div>
        <div className="flex flex-col items-end gap-2">
          <div className="text-base font-medium tabular-nums">
            {t.page.todayCount(count.data?.count_today ?? 0)}
          </div>
          {bio.data && !bio.data.reader?.connected && (
            <div className="text-xs text-warning bg-warning/10 px-2 py-1 rounded">
              {t.reader.disconnectedBanner}
            </div>
          )}
        </div>
      </div>

      <main className="flex flex-1 items-center justify-center px-12">
        <div className="flex flex-col items-center gap-10 w-full max-w-3xl">
          <CheckinFeedback state={feedback} idleMessage={idleMessage} size="xl" />

          {pinAvailable && feedback.kind === "idle" && (
            <div className="w-full max-w-md space-y-3">
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
              {pinError && <p className="text-sm text-destructive text-center">{pinError}</p>}
            </div>
          )}
        </div>
      </main>

      <div className="absolute bottom-4 right-6 flex items-center gap-2 text-xs text-muted-foreground pointer-events-none">
        <SyncIcon className={cn("h-4 w-4", syncColor)} />
        <span className="opacity-70">{t.kiosk.exitHint}</span>
      </div>

      <KioskExitDialog
        open={exitOpen}
        onOpenChange={setExitOpen}
        onAuthorized={() => navigate("/checkin")}
      />
    </div>
  );
}
