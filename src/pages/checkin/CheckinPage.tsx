import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Fingerprint, KeyRound, PictureInPicture2, Search as SearchIcon } from "lucide-react";
import { format } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckinFeedback, eventToFeedback, feedbackTone, useAutoFade, type FeedbackState } from "@/components/checkin/CheckinFeedback";
import { MemberSearchInput } from "@/components/checkin/MemberSearchInput";
import { NumberPad } from "@/components/checkin/NumberPad";
import { OverrideDialog } from "@/components/checkin/OverrideDialog";
import {
  checkinErrorMessage,
  useCheckinByNumber,
  useCheckinManual,
  useCheckinMethods,
  useRecentCheckins,
  type CheckinEvent,
} from "@/hooks/useCheckin";
import {
  useBiometricCheckinLoop,
  useBiometricStatus,
  useReaderConnected,
} from "@/hooks/useBiometric";
import { useAuthStore } from "@/stores/useAuthStore";
import { playCheckinTone, unlockAudio } from "@/lib/audio";
import { openKioskWindow } from "@/lib/kioskWindow";
import { openCheckinFloatWindow } from "@/lib/floatWindow";
import { useWindowPresence } from "@/hooks/useWindowPresence";
import { emitCheckinResult } from "@/hooks/useCheckinResultRelay";
import { KIOSK_WINDOW_LABEL } from "@/lib/windowLabels";
import { useCheckinFeedbackSettings } from "@/hooks/useGym";
import { checkin as t } from "@/strings/checkin";

type Method = "fingerprint" | "number" | "manual";

export default function CheckinPage() {
  const operator = useAuthStore((s) => s.user);
  const kioskOpen = useWindowPresence(KIOSK_WINDOW_LABEL);
  const bio = useBiometricStatus();
  const readerConnected = useReaderConnected();
  const methods = useCheckinMethods();
  const recents = useRecentCheckins();

  // Sidecar matcher ready + physical scanner plugged in. Mirror del kiosk.
  const fingerprintAvailable =
    !!bio.data?.available && readerConnected === true;
  const numberAvailable = methods.data?.number_available ?? false;

  const initialMethod: Method = fingerprintAvailable ? "fingerprint" : numberAvailable ? "number" : "manual";
  const [method, setMethod] = useState<Method>(initialMethod);
  const [feedback, setFeedback] = useState<FeedbackState>({ kind: "idle" });
  const [lastEvent, setLastEvent] = useState<CheckinEvent | null>(null);
  const [overrideOpen, setOverrideOpen] = useState(false);
  const [numberInput, setNumberInput] = useState("");
  const [numberError, setNumberError] = useState<string | null>(null);
  const [now, setNow] = useState(() => new Date());

  // keep tab/clock fresh
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 30_000);
    return () => window.clearInterval(id);
  }, []);

  // sync method to availability changes (auto-adapt)
  useEffect(() => {
    if (method === "fingerprint" && !fingerprintAvailable) {
      setMethod(numberAvailable ? "number" : "manual");
    }
    if (method === "number" && !numberAvailable) {
      setMethod(fingerprintAvailable ? "fingerprint" : "manual");
    }
  }, [fingerprintAvailable, numberAvailable, method]);

  const idleMessage = fingerprintAvailable ? t.feedback.idle : t.feedback.idleNoReader;

  const reset = useCallback(() => {
    setFeedback({ kind: "idle" });
  }, []);

  // Duración del veredicto + volumen del tono — mismos knobs del kiosko
  // ("Duración del feedback al check-in" / "Volumen del kiosko" en
  // Ajustes → Perfil del gym). Antes esta página fijaba 5s en duro.
  const { ttlMs, volume } = useCheckinFeedbackSettings();

  // auto-fade after a result is shown
  useAutoFade(feedback, { ttlMs, onExpire: reset });

  function announce(ev: CheckinEvent) {
    const fb = eventToFeedback(ev);
    setFeedback(fb);
    setLastEvent(ev);
    recents.prepend(ev);
    const tone = feedbackTone(fb.kind);
    if (tone === "success") playCheckinTone("success", volume);
    else if (tone === "warning") playCheckinTone("warning", volume);
    else if (tone === "denied") playCheckinTone("denied", volume);
  }

  const checkinManual = useCheckinManual();
  const checkinByNumber = useCheckinByNumber();

  // Fingerprint capture vive en el frontend (ADR-004-bis). El JS SDK fire
  // un sample por dedazo; el hook lo POST-ea a /biometric/checkin y
  // devuelve el match real (announce) o un no-match (feedback denied sin
  // tocar la lista de recientes).
  //
  // En esta ruta ESTA página es dueña del loop de la ventana main — el
  // GlobalCheckinScanner se apaga en /checkin para que la misma huella no
  // registre dos check-ins (el provider multiplexa samples a todos los
  // subscribers de la ventana). Cada resultado de huella se emite al relay
  // para que la flotante/kiosko lo pinten al socio si están abiertos.
  useBiometricCheckinLoop({
    enabled: fingerprintAvailable,
    onAttempt: () => setFeedback({ kind: "processing" }),
    onCheckin: (ev) => {
      announce(ev);
      void emitCheckinResult({ kind: "checkin", event: ev });
    },
    onNoMatch: () => {
      setFeedback({ kind: "denied_not_found" });
      playCheckinTone("denied", volume);
      void emitCheckinResult({ kind: "no_match" });
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
      playCheckinTone("denied", volume);
    }
  }

  async function submitNumber() {
    if (numberInput.length !== 4) return;
    setNumberError(null);
    setFeedback({ kind: "processing" });
    try {
      const ev = await checkinByNumber.mutateAsync({ member_number: parseInt(numberInput, 10) });
      announce(ev);
      setNumberInput("");
    } catch (err) {
      const msg = checkinErrorMessage(err, t.numberPad.invalid);
      setNumberError(msg);
      setFeedback({ kind: "denied_not_found", detail: msg });
      playCheckinTone("denied", volume);
      setNumberInput("");
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
        {/* Accesos a las dos superficies del socio. La exclusión mutua
            (kiosko ↔ flotante) vive en los open* de lib — si el otro modo
            está activo, avisan con toast en lugar de abrir. */}
        <div className="flex items-center gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void openCheckinFloatWindow()}
            className="rounded-md"
          >
            <PictureInPicture2 className="h-4 w-4" />
            {t.float.launcher}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void openKioskWindow()}
            className="rounded-md"
          >
            <Maximize2 className="h-4 w-4" />
            {kioskOpen ? t.page.goToKiosk : t.page.openKiosk}
          </Button>
        </div>
      </header>

      <div className="flex-1 grid grid-cols-1 lg:grid-cols-[1fr_320px] overflow-hidden">
        <main className="overflow-y-auto px-6 py-6 space-y-6">
          <MethodTabs
            method={method}
            onChange={setMethod}
            fingerprintAvailable={fingerprintAvailable}
            numberAvailable={numberAvailable}
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

          {method === "number" && (
            <div className="max-w-md mx-auto w-full space-y-3">
              <h2 className="text-center font-medium text-lg">{t.numberPad.title}</h2>
              <NumberPad
                value={numberInput}
                onChange={(v) => {
                  setNumberInput(v);
                  if (numberError) setNumberError(null);
                }}
                onSubmit={submitNumber}
                disabled={checkinByNumber.isPending}
              />
              {numberError && <p className="text-sm text-destructive text-center">{numberError}</p>}
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
        {bio.data && !bio.data.connected && (
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
  numberAvailable: boolean;
}

function MethodTabs({ method, onChange, fingerprintAvailable, numberAvailable }: MethodTabsProps) {
  const allTabs: Array<{ key: Method; icon: typeof Fingerprint; label: string; show: boolean }> = [
    { key: "fingerprint", icon: Fingerprint, label: t.page.methods.fingerprint, show: fingerprintAvailable },
    { key: "number", icon: KeyRound, label: t.page.methods.number, show: numberAvailable },
    { key: "manual", icon: SearchIcon, label: t.page.methods.manual, show: true },
  ];
  const tabs = allTabs.filter((tab) => tab.show);

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
