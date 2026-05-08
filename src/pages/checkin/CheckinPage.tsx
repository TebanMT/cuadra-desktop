import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Maximize2, Fingerprint, KeyRound, Search as SearchIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckinFeedback, eventToFeedback, feedbackTone, useAutoFade, type FeedbackState } from "@/components/checkin/CheckinFeedback";
import { MemberSearchInput } from "@/components/checkin/MemberSearchInput";
import { PinPad } from "@/components/checkin/PinPad";
import { OverrideDialog } from "@/components/checkin/OverrideDialog";
import {
  checkinErrorMessage,
  useCheckinByPin,
  useCheckinManual,
  useCheckinMethods,
  useKioskEvents,
  useRecentCheckins,
  type CheckinEvent,
} from "@/hooks/useCheckin";
import { useBiometricStatus } from "@/hooks/useBiometric";
import { useAuthStore } from "@/stores/useAuthStore";
import { playCheckinTone, unlockAudio } from "@/lib/audio";
import { checkin as t } from "@/strings/checkin";

type Method = "fingerprint" | "pin" | "manual";

const AUTOFADE_MS = 5000;

export default function CheckinPage() {
  const navigate = useNavigate();
  const operator = useAuthStore((s) => s.user);
  const bio = useBiometricStatus();
  const methods = useCheckinMethods();
  const recents = useRecentCheckins();

  const fingerprintAvailable = !!bio.data?.reader?.connected;
  const pinAvailable = methods.data?.pin_available ?? false;

  const initialMethod: Method = fingerprintAvailable ? "fingerprint" : pinAvailable ? "pin" : "manual";
  const [method, setMethod] = useState<Method>(initialMethod);
  const [feedback, setFeedback] = useState<FeedbackState>({ kind: "idle" });
  const [lastEvent, setLastEvent] = useState<CheckinEvent | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [pin, setPin] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // keep tab/clock fresh
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // sync method to availability changes (auto-adapt)
  useEffect(() => {
    if (method === "fingerprint" && !fingerprintAvailable) {
      setMethod(pinAvailable ? "pin" : "manual");
    }
    if (method === "pin" && !pinAvailable) {
      setMethod(fingerprintAvailable ? "fingerprint" : "manual");
    }
  }, [fingerprintAvailable, pinAvailable, method]);

  const idleMessage = fingerprintAvailable ? t.feedback.idle : t.feedback.idleNoReader;

  const reset = useCallback(() => {
    setFeedback({ kind: "idle" });
  }, []);

  // auto-fade after a result is shown
  useAutoFade(feedback, { ttlMs: AUTOFADE_MS, onExpire: reset });

  function announce(ev: CheckinEvent) {
    const fb = eventToFeedback(ev);
    setFeedback(fb);
    setLastEvent(ev);
    recents.prepend(ev);
    const tone = feedbackTone(fb.kind);
    if (tone === "success") playCheckinTone("success");
    else if (tone === "warning") playCheckinTone("warning");
    else if (tone === "denied") playCheckinTone("denied");
  }

  const checkinManual = useCheckinManual();
  const checkinPin = useCheckinByPin();

  // Fingerprint events arrive via long-poll; backend reports attempts and results.
  useKioskEvents({
    enabled: fingerprintAvailable,
    onEvent: (ev) => {
      if (ev.kind === "attempt_started") {
        setFeedback({ kind: "processing" });
        return;
      }
      if (ev.kind === "checkin_result" && ev.checkin) {
        announce(ev.checkin);
        return;
      }
    },
  });

  async function handleManualSelect(memberId: string) {
    setFeedback({ kind: "processing" });
    try {
      const ev = await checkinManual.mutateAsync({ member_id: memberId });
      announce(ev);
    } catch (err) {
      const msg = checkinErrorMessage(err, t.feedback.deniedNotFound);
      setFeedback({ kind: "denied_not_found", detail: msg });
      playCheckinTone("denied");
    }
  }

  async function submitPin() {
    if (pin.length !== 4) return;
    setPinError(null);
    setFeedback({ kind: "processing" });
    try {
      const ev = await checkinPin.mutateAsync({ pin });
      announce(ev);
      setPin("");
    } catch (err) {
      const msg = checkinErrorMessage(err, t.pinPad.invalid);
      setPinError(msg);
      setFeedback({ kind: "denied_not_found", detail: msg });
      playCheckinTone("denied");
      setPin("");
    }
  }

  // O for override on a denied state
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
      }
      if (e.key.toLowerCase() === "o") {
        if (lastEvent && lastEvent.member_id && feedbackTone(eventToFeedback(lastEvent).kind) === "denied") {
          e.preventDefault();
          setOverrideOpen(true);
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [lastEvent]);

  const canOverride =
    !!lastEvent &&
    !!lastEvent.member_id &&
    feedbackTone(eventToFeedback(lastEvent).kind) === "denied";

  return (
    <div
      className="flex h-full flex-col bg-background"
      onPointerDown={unlockAudio}
      onKeyDown={unlockAudio}
    >
      <header className="flex items-center justify-between border-b border-foreground/10 px-6 py-5">
        <div className="flex items-baseline gap-4">
          <h1
            className="text-3xl font-semibold text-foreground"
            style={{ letterSpacing: "-0.025em" }}
          >
            {t.page.title}
          </h1>
          <span className="text-sm text-muted-foreground tabular">
            {format(now, "EEEE d MMM · HH:mm", { locale: es })}
          </span>
        </div>
        <Button variant="outline" size="sm" onClick={() => navigate("/kiosk")} className="rounded-md">
          <Maximize2 className="h-4 w-4" />
          {t.page.openKiosk}
        </Button>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">
        <main className="overflow-y-auto px-6 py-6 space-y-6">
          <MethodTabs
            method={method}
            onChange={setMethod}
            fingerprintAvailable={fingerprintAvailable}
            pinAvailable={pinAvailable}
          />

          {method === "manual" && (
            <div className="max-w-2xl mx-auto w-full">
              <MemberSearchInput
                size="lg"
                autoFocus
                onSelect={(m) => handleManualSelect(m.member_id)}
              />
            </div>
          )}

          {method === "pin" && (
            <div className="max-w-md mx-auto w-full space-y-3">
              <h2 className="text-center font-medium text-lg">{t.pinPad.title}</h2>
              <PinPad
                value={pin}
                onChange={(v) => {
                  setPin(v);
                  if (pinError) setPinError(null);
                }}
                onSubmit={submitPin}
                disabled={checkinPin.isPending}
              />
              {pinError && <p className="text-sm text-destructive text-center">{pinError}</p>}
            </div>
          )}

          <div className="flex justify-center pt-2">
            <CheckinFeedback state={feedback} idleMessage={idleMessage} />
          </div>

          {canOverride && (
            <p className="text-center text-sm text-muted-foreground">
              {t.page.overridePrompt}
            </p>
          )}
        </main>

        <aside className="border-l border-border bg-muted/30 overflow-y-auto px-4 py-4">
          <h2 className="text-[11px] uppercase tracking-[0.12em] text-muted-foreground font-medium mb-3">
            {t.page.recent}
          </h2>
          <RecentList items={recents.items} />
        </aside>
      </div>

      <footer className="border-t border-border px-6 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{operator?.full_name ? t.page.operator(operator.full_name) : ""}</span>
        {bio.data && !bio.data.reader?.connected && (
          <span className="text-warning">{t.reader.disconnectedBanner}</span>
        )}
      </footer>

      {canOverride && lastEvent && lastEvent.member_id && (
        <OverrideDialog
          memberId={lastEvent.member_id}
          memberName={lastEvent.member_name ?? ""}
          originalCheckinId={lastEvent.id}
          open={overrideOpen}
          onOpenChange={setOverrideOpen}
          onSuccess={(ev) => announce({ ...ev, manual_override: true })}
        />
      )}
    </div>
  );
}

interface MethodTabsProps {
  method: Method;
  onChange(m: Method): void;
  fingerprintAvailable: boolean;
  pinAvailable: boolean;
}

function MethodTabs({ method, onChange, fingerprintAvailable, pinAvailable }: MethodTabsProps) {
  const tabs: Array<{ key: Method; icon: typeof Fingerprint; label: string; show: boolean }> = [
    { key: "fingerprint", icon: Fingerprint, label: t.page.methods.fingerprint, show: fingerprintAvailable },
    { key: "pin", icon: KeyRound, label: t.page.methods.pin, show: pinAvailable },
    { key: "manual", icon: SearchIcon, label: t.page.methods.manual, show: true },
  ].filter((tab) => tab.show);

  if (tabs.length <= 1) return null;

  return (
    <div className="mx-auto inline-flex rounded-md border bg-muted/40 p-1 gap-1 min-h-[44px]">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          className={cn(
            "inline-flex items-center gap-2 px-4 py-1.5 rounded text-sm font-medium transition-colors",
            method === tab.key
              ? "bg-background text-foreground shadow-sm"
              : "text-muted-foreground hover:text-foreground"
          )}
        >
          <tab.icon className="h-4 w-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

function RecentList({ items }: { items: CheckinEvent[] }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.page.recentEmpty}</p>;
  }
  return (
    <ul className="space-y-2">
      {items.map((ev) => {
        const tone = feedbackTone(eventToFeedback(ev).kind);
        const dotClass =
          tone === "success"
            ? "bg-success"
            : tone === "warning"
            ? "bg-warning"
            : tone === "denied"
            ? "bg-destructive"
            : "bg-muted-foreground";
        const time = format(new Date(ev.created_at), "HH:mm");
        return (
          <li key={ev.id} className="flex items-center gap-2 text-sm">
            <span className={cn("h-2 w-2 rounded-full shrink-0", dotClass)} />
            <span className="flex-1 truncate font-medium">
              {ev.member_name ?? "—"}
              {ev.manual_override && (
                <span className="ml-1 text-xs uppercase text-success">[O]</span>
              )}
            </span>
            <span className="text-xs text-muted-foreground tabular-nums">{time}</span>
          </li>
        );
      })}
    </ul>
  );
}
