import { useCanWrite } from "@/lib/writeAccess";
import { usePermission } from "@/lib/permissions";
import { RestrictedNote } from "@/components/shared/RestrictedNote";
import { CheckinReadOnlyNotice } from "@/components/checkin/CheckinReadOnlyNotice";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Check, Fingerprint, KeyRound, Search as SearchIcon, X } from "lucide-react";
import { format, isSameDay } from "date-fns";
import { es } from "date-fns/locale";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { CheckinFeedback, eventToFeedback, feedbackTone, feedbackVigencia, useAutoFade, type FeedbackState, type FeedbackTone } from "@/components/checkin/CheckinFeedback";
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
  useBiometricCheckinFeed,
  useBiometricStatus,
  useReaderMissing,
} from "@/hooks/useBiometric";
import { useAuthStore } from "@/stores/useAuthStore";
import { playCheckinTone, unlockAudio } from "@/lib/audio";
import { useWindowPresence } from "@/hooks/useWindowPresence";
import {
  CHECKIN_FLOAT_WINDOW_LABEL,
  KIOSK_WINDOW_LABEL,
} from "@/lib/windowLabels";
import { useCheckinFeedbackSettings } from "@/hooks/useGym";
import { checkin as t } from "@/strings/checkin";
import { HelpHint } from "@/components/shared/HelpHint";

type Method = "fingerprint" | "number" | "manual";

export default function CheckinPage() {
  const canWrite = useCanWrite();
  // "Permitir de todos modos" needs the operator's "checkin_override"
  // permission (and a writable reception).
  const mayOverride = usePermission("checkin_override");
  const allowOverride = canWrite && mayOverride;
  const operator = useAuthStore((s) => s.user);
  const kioskOpen = useWindowPresence(KIOSK_WINDOW_LABEL);
  const floatOpen = useWindowPresence(CHECKIN_FLOAT_WINDOW_LABEL);
  const bio = useBiometricStatus();
  const readerMissing = useReaderMissing();
  const methods = useCheckinMethods();
  const recents = useRecentCheckins();

  // available = helper tinta-bio vivo + lector conectado, directo del
  // sidecar (dueño único del hardware). Ya no hay probe del JS SDK.
  const fingerprintAvailable = !!bio.data?.available;
  const numberAvailable = methods.data?.number_available ?? false;
  // Sin respuesta todavía no se elige método: evita abrir en «Buscar» (con
  // su campo enfocado) y saltar a «Número» un instante después.
  const methodsKnown = methods.data !== undefined || !!methods.isError;

  // «Número» por defecto: es el respaldo más rápido en mostrador y la huella
  // se registra igual en cualquier pestaña (la captura vive en el sidecar).
  // Si el operador elige otro método se respeta mientras siga disponible;
  // si deja de estarlo, se vuelve al preferido (auto-adapt).
  const preferredMethod: Method = numberAvailable ? "number" : fingerprintAvailable ? "fingerprint" : "manual";
  const [chosenMethod, setChosenMethod] = useState<Method | null>(null);
  const chosenAvailable =
    chosenMethod === "manual" ||
    (chosenMethod === "number" && numberAvailable) ||
    (chosenMethod === "fingerprint" && fingerprintAvailable);
  const method: Method = chosenMethod && chosenAvailable ? chosenMethod : preferredMethod;
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

  const idleMessage = method === "manual"
    ? "Busca al socio para registrar su entrada."
    : method === "number"
      ? fingerprintAvailable
        ? "Escribe su número de socio y confirma, o pídele que ponga su huella."
        : "Escribe su número de socio y confirma la entrada."
      : "Pídele que ponga su huella en el lector.";

  const reset = useCallback(() => {
    setFeedback({ kind: "idle" });
  }, []);

  // Duración del veredicto + volumen del tono — mismos knobs del kiosko
  // ("Duración del aviso de entrada" / "Volumen del kiosko" en
  // Ajustes → Perfil del gym). Antes esta página fijaba 5s en duro.
  const { ttlMs, volume } = useCheckinFeedbackSettings();

  // auto-fade after a result is shown
  useAutoFade(feedback, { ttlMs, onExpire: reset });

  // Con kiosko o flotante abiertos, el TONO del resultado de huella lo pone
  // esa superficie (el SSE le llega igual que a nosotros) — aquí sólo se
  // pinta. Manual y número no viajan por SSE, así que conservan su tono
  // siempre (la superficie dedicada no se entera de ellos).
  const dedicatedSurfaceOpen = kioskOpen || floatOpen;

  function announce(ev: CheckinEvent, withTone = true) {
    const fb = eventToFeedback(ev);
    setFeedback(fb);
    setLastEvent(ev);
    recents.prepend(ev);
    if (!withTone) return;
    const tone = feedbackTone(fb.kind);
    if (tone === "success") playCheckinTone("success", volume);
    else if (tone === "warning") playCheckinTone("warning", volume);
    else if (tone === "denied") playCheckinTone("denied", volume);
  }

  const checkinManual = useCheckinManual();
  const checkinByNumber = useCheckinByNumber();

  // La captura vive en el sidecar (motor tinta-bio): cada dedazo se
  // identifica y registra allá, y el resultado llega por SSE. Esta página
  // sólo pinta. El GlobalCheckinScanner se apaga en /checkin para que el
  // mismo evento no salga además como toast en esta misma ventana.
  useBiometricCheckinFeed({
    onAttempt: () => setFeedback({ kind: "processing" }),
    onCheckin: (ev) => announce(ev, !dedicatedSurfaceOpen),
    onNoMatch: () => {
      setFeedback({ kind: "denied_not_found" });
      if (!dedicatedSurfaceOpen) playCheckinTone("denied", volume);
    },
    onSampleRejected: () => setFeedback({ kind: "sample_rejected" }),
  });

  async function handleManualSelect(memberId: string) {
    if (checkinManual.isPending) return;
    setFeedback({ kind: "processing" });
    try {
      const ev = await checkinManual.mutateAsync({ member_id: memberId });
      announce(ev);
    } catch (err) {
      const msg = checkinErrorMessage(err, t.feedback.operationalError);
      setFeedback({ kind: "operational_error", detail: msg });
      playCheckinTone("denied", volume);
    }
  }

  async function submitNumber() {
    if (checkinByNumber.isPending || numberInput.length !== 4) return;
    setNumberError(null);
    setFeedback({ kind: "processing" });
    try {
      const ev = await checkinByNumber.mutateAsync({ member_number: parseInt(numberInput, 10) });
      announce(ev);
      setNumberInput("");
    } catch (err) {
      const msg = checkinErrorMessage(err, t.feedback.operationalError);
      setNumberError(msg);
      setFeedback({ kind: "operational_error", detail: msg });
      playCheckinTone("denied", volume);
      setNumberInput("");
    }
  }

  // O for override on a denied state
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!allowOverride || e.defaultPrevented || document.querySelector('[role="dialog"], [role="alertdialog"]')) return;
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
  }, [lastEvent, allowOverride]);

  // En solo lectura (prueba terminada, UC-002) las entradas siguen, pero
  // "Permitir de todos modos" no: dejaría pasar socios vencidos sin cobrar.
  const deniedMember =
    !!lastEvent &&
    !!lastEvent.member_id &&
    feedbackTone(eventToFeedback(lastEvent).kind) === "denied";
  const canOverride = allowOverride && deniedMember;

  return (
    <div
      className="flex h-full flex-col bg-background"
      onPointerDown={unlockAudio}
      onKeyDown={unlockAudio}
    >
      <header className="flex flex-wrap items-center justify-between gap-3 border-b px-6 py-6">
        <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1">
          <h1 className="font-display text-3xl text-foreground">
            {t.page.title}
          </h1>
          <span className="text-sm text-muted-foreground tabular">
            {format(now, "EEEE d MMM · HH:mm", { locale: es })}
          </span>
        </div>
        <HelpHint topic="entrada" task="registrar una entrada" />
      </header>

      <div className={cn("flex-1 min-h-0 grid grid-cols-1 overflow-y-auto", recents.items.length > 0 && "xl:grid-cols-[minmax(0,1fr)_280px]")}>
        <main className="px-6 py-4 space-y-3">

          {!canWrite && <CheckinReadOnlyNotice />}
          {!methodsKnown && <p role="status" className="text-sm text-muted-foreground">Consultando métodos de entrada…</p>}
          {methodsKnown && <MethodTabs
            method={method}
            onChange={setChosenMethod}
            fingerprintAvailable={fingerprintAvailable}
            numberAvailable={numberAvailable}
          />}

          {methodsKnown && method === "manual" && (
            <div className="max-w-2xl w-full">
              <MemberSearchInput
                size="lg"
                autoFocus
                disabled={checkinManual.isPending}
                onSelect={(m) => handleManualSelect(m.member_id)}
              />
            </div>
          )}

          {methodsKnown && method === "number" && (
            <div className="max-w-md mx-auto w-full space-y-3">
              <h2 className="text-center font-medium text-lg">{t.numberPad.title}</h2>
              <NumberPad adaptive
                value={numberInput}
                onChange={(v) => {
                  setNumberInput(v);
                  if (numberError) setNumberError(null);
                }}
                onSubmit={submitNumber}
                disabled={checkinByNumber.isPending}
              />
              {numberError && <p role="alert" className="text-sm text-destructive text-center">{numberError}</p>}
            </div>
          )}

          <div className={cn("flex py-4", feedback.kind !== "idle" && "justify-center")}>
            <CheckinFeedback state={feedback} idleMessage={idleMessage} idleMethod={method} compact />
          </div>

          {canOverride && (
            <p className="text-center text-sm text-muted-foreground">
              {t.page.overridePrompt}
            </p>
          )}
          {canWrite && !mayOverride && deniedMember && (
            <RestrictedNote permission="checkin_override" className="justify-center text-sm">
              No puedes autorizar su entrada.
            </RestrictedNote>
          )}
        </main>

        {recents.items.length > 0 ? (
          <aside className="border-t px-6 py-5 xl:border-l xl:border-t-0">
            <h2 className="text-base font-semibold mb-3">{t.page.recent}</h2>
            <RecentList items={recents.items} now={now} />
          </aside>
        ) : <p className="border-t px-6 py-4 text-sm text-muted-foreground">{recents.failed ? t.page.recentFailed : t.page.recentEmpty}</p>}

      </div>

      <footer className="border-t border-border px-6 py-2 flex items-center justify-between text-xs text-muted-foreground">
        <span>{operator?.full_name ? t.page.operator(operator.full_name) : ""}</span>
        {readerMissing && (
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
    <div role="group" aria-label="Método de registro de entrada" className="inline-flex flex-wrap gap-1 border-b pb-2">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          type="button"
          onClick={() => onChange(tab.key)}
          aria-pressed={method === tab.key}
          className={cn(
            "inline-flex min-h-11 items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors",
            method === tab.key
              ? "bg-accent text-accent-foreground ring-1 ring-inset ring-ring"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          <tab.icon aria-hidden="true" className="h-4 w-4" />
          {tab.label}
        </button>
      ))}
    </div>
  );
}

const RECENT_ICON: Record<FeedbackTone, { Icon: typeof Check; cls: string }> = {
  success: { Icon: Check, cls: "text-success-text" },
  warning: { Icon: AlertTriangle, cls: "text-warning" },
  denied: { Icon: X, cls: "text-destructive-text" },
  neutral: { Icon: SearchIcon, cls: "text-muted-foreground" },
};

// «Hoy · 21:55» o «11 nov · 21:55»: el historial trae entradas de otros
// días y sólo la hora hacía pasar una de antier por una de hoy. Otro año
// lleva el año («11 nov 2025 · 21:55»).
function entryWhen(iso: string, now: Date): string {
  const d = new Date(iso);
  const time = format(d, "HH:mm");
  if (isSameDay(d, now)) return `Hoy · ${time}`;
  const day = format(d, d.getFullYear() === now.getFullYear() ? "d MMM" : "d MMM yyyy", { locale: es });
  return `${day} · ${time}`;
}

// Qué pasó con cada entrada, en palabras (el color sólo refuerza).
function entryResult(ev: CheckinEvent): string {
  const fb = eventToFeedback(ev);
  if (fb.kind === "denied_not_found") return "Socio no reconocido";
  if (fb.kind === "success_override") return t.feedback.overrideBadge;
  const vigencia = feedbackVigencia(fb);
  if (feedbackTone(fb.kind) === "denied") return vigencia ? `${t.feedback.operator.denied} · ${vigencia.label}` : t.feedback.operator.denied;
  if (fb.kind === "success_expiring_soon") return `${t.feedback.operator.registered} · Por vencer`;
  return t.feedback.operator.registered;
}

function RecentList({ items, now }: { items: CheckinEvent[]; now: Date }) {
  if (items.length === 0) {
    return <p className="text-sm text-muted-foreground">{t.page.recentEmpty}</p>;
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((ev) => {
        const tone = feedbackTone(eventToFeedback(ev).kind);
        const { Icon, cls } = RECENT_ICON[tone];
        return (
          <li key={ev.id} className="flex items-start gap-2 py-2 text-sm first:pt-0">
            <Icon aria-hidden="true" className={cn("mt-0.5 h-4 w-4 shrink-0", cls)} strokeWidth={2.5} />
            <div className="min-w-0 flex-1">
              <div className="flex items-baseline gap-2">
                <span className="min-w-0 flex-1 truncate font-medium">{ev.member_name ?? "—"}</span>
                <time dateTime={ev.created_at} className="shrink-0 text-xs text-muted-foreground tabular">
                  {entryWhen(ev.created_at, now)}
                </time>
              </div>
              <p className="truncate text-xs text-muted-foreground">{entryResult(ev)}</p>
            </div>
          </li>
        );
      })}
    </ul>
  );
}
