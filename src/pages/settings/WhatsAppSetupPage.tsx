import { useEffect, useState } from "react";
import { CheckCircle2, Loader2, MessageCircle, PhoneCall, PlugZap, Power } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  useConfirmWhatsappConnect,
  useDisconnectWhatsapp,
  useStartWhatsappConnect,
  useWhatsappState,
} from "@/hooks/useNotifications";
import { ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { settings as t } from "@/strings/settings";

const PHONE_REGEX = /^\+?[0-9\s-]{10,}$/;

export default function WhatsAppSetupPage() {
  const state = useWhatsappState();

  if (state.isLoading) {
    return (
      <div className="p-8 flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="p-8 max-w-2xl">
        <Alert variant="destructive">
          <AlertDescription>{t.whatsapp.errors.loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.whatsapp.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.whatsapp.subtitle}</p>
      </div>

      {state.data?.status === "connected" ? (
        <ConnectedView state={state.data} />
      ) : (
        <ConnectFlow />
      )}
    </div>
  );
}

type StateLike = NonNullable<ReturnType<typeof useWhatsappState>["data"]>;

function ConnectedView({ state }: { state: StateLike }) {
  const disconnect = useDisconnectWhatsapp();
  const [confirm, setConfirm] = useState(false);

  const stats = state.stats;
  const successRate =
    stats && stats.sent_last_30d > 0
      ? Math.round((stats.delivered_last_30d / stats.sent_last_30d) * 100)
      : null;

  async function doDisconnect() {
    try {
      await disconnect.mutateAsync();
      toast.success(t.whatsapp.successDisconnected);
      setConfirm(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.whatsapp.errors.generic);
    }
  }

  return (
    <>
      <Card>
        <CardContent className="pt-6 pb-6 space-y-4">
          <div className="flex items-center gap-3">
            <CheckCircle2 className="h-7 w-7 text-success" />
            <div>
              <h2 className="text-lg font-semibold">
                {t.whatsapp.connected.hero(state.phone_number ?? "")}
              </h2>
              {state.connected_at && (
                <p className="text-sm text-muted-foreground">
                  {t.whatsapp.connected.since(fmtDate(state.connected_at))}
                </p>
              )}
            </div>
          </div>

          {stats && (
            <div className="grid gap-3 grid-cols-2 sm:grid-cols-4 pt-2">
              <Stat label={t.whatsapp.connected.stats.sent} value={stats.sent_last_30d.toString()} />
              <Stat
                label={t.whatsapp.connected.stats.delivered}
                value={stats.delivered_last_30d.toString()}
              />
              <Stat
                label={t.whatsapp.connected.stats.failed}
                value={stats.failed_last_30d.toString()}
                variant={stats.failed_last_30d > 0 ? "destructive" : undefined}
              />
              <Stat
                label={t.whatsapp.connected.stats.successRate}
                value={successRate !== null ? `${successRate}%` : "—"}
              />
            </div>
          )}

          {state.last_error && (
            <Alert variant="warning">
              <AlertDescription>
                {t.whatsapp.connected.lastError}: {state.last_error}
              </AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end pt-2">
            <Button
              variant="outline"
              className="text-destructive border-destructive hover:bg-destructive/10"
              onClick={() => setConfirm(true)}
              disabled={disconnect.isPending}
            >
              <Power className="h-4 w-4" />
              {disconnect.isPending
                ? t.whatsapp.connected.disconnecting
                : t.whatsapp.connected.disconnect}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirm} onOpenChange={setConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.whatsapp.connected.disconnectConfirm.title}</AlertDialogTitle>
            <AlertDialogDescription>
              {t.whatsapp.connected.disconnectConfirm.body}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={disconnect.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doDisconnect();
              }}
              disabled={disconnect.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {t.whatsapp.connected.disconnectConfirm.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Stat({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: "destructive";
}) {
  return (
    <div className="rounded-md border bg-muted/30 px-3 py-2">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p
        className={`text-xl font-bold tabular-nums mt-1 ${variant === "destructive" ? "text-destructive" : ""}`}
      >
        {value}
      </p>
    </div>
  );
}

function ConnectFlow() {
  const start = useStartWhatsappConnect();
  const confirm = useConfirmWhatsappConnect();
  const [step, setStep] = useState<"intro" | "phone" | "code">("intro");
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (step === "intro") {
      setError(null);
    }
  }, [step]);

  async function sendCode() {
    setError(null);
    if (!PHONE_REGEX.test(phone.trim())) {
      setError(t.whatsapp.errors.phoneInvalid);
      return;
    }
    try {
      await start.mutateAsync({ phone_number: phone.trim() });
      setStep("code");
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.whatsapp.errors.generic);
    }
  }

  async function submitCode() {
    setError(null);
    if (!code.trim()) {
      setError(t.whatsapp.errors.codeInvalid);
      return;
    }
    try {
      await confirm.mutateAsync({ phone_number: phone.trim(), code: code.trim() });
      toast.success(t.whatsapp.successConnected);
    } catch (err) {
      if (err instanceof ApiError && (err.status === 400 || err.code === "invalid_code")) {
        setError(t.whatsapp.errors.codeInvalid);
      } else {
        setError(err instanceof ApiError ? err.message : t.whatsapp.errors.generic);
      }
    }
  }

  return (
    <Card>
      <CardContent className="pt-6 pb-6 space-y-5">
        <div className="flex items-start gap-3">
          <PlugZap className="h-7 w-7 text-primary mt-1" />
          <div>
            <h2 className="text-lg font-semibold">{t.whatsapp.notConnected.hero}</h2>
            <p className="text-sm text-muted-foreground mt-1">{t.whatsapp.notConnected.copy}</p>
          </div>
        </div>

        {step === "intro" && (
          <div className="space-y-4">
            <div className="aspect-video rounded-md overflow-hidden border bg-muted">
              <iframe
                title="Cómo conectar WhatsApp"
                src="https://www.youtube-nocookie.com/embed/dQw4w9WgXcQ"
                className="w-full h-full"
                allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
                allowFullScreen
              />
            </div>
            <Step
              icon={MessageCircle}
              title={t.whatsapp.notConnected.step1Title}
              body={t.whatsapp.notConnected.step1Body}
              footer={
                <a
                  href="https://www.youtube.com/results?search_query=whatsapp+business+vs+whatsapp"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-xs text-primary hover:underline"
                >
                  {t.whatsapp.notConnected.step1Link}
                </a>
              }
            />
            <Step
              icon={PhoneCall}
              title={t.whatsapp.notConnected.step2Title}
              body={t.whatsapp.notConnected.step2Body}
            />
            <div className="flex justify-end">
              <Button onClick={() => setStep("phone")} size="lg">
                {t.whatsapp.notConnected.start}
              </Button>
            </div>
          </div>
        )}

        {step === "phone" && (
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-1">
              <Label htmlFor="wa-phone">{t.whatsapp.notConnected.phoneLabel}</Label>
              <Input
                id="wa-phone"
                placeholder={t.whatsapp.notConnected.phonePlaceholder}
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                autoFocus
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("intro")} disabled={start.isPending}>
                {t.whatsapp.notConnected.back}
              </Button>
              <Button onClick={sendCode} disabled={start.isPending}>
                {start.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {start.isPending
                  ? t.whatsapp.notConnected.phoneSending
                  : t.whatsapp.notConnected.phoneSend}
              </Button>
            </div>
          </div>
        )}

        {step === "code" && (
          <div className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <p className="text-sm">{t.whatsapp.notConnected.sentTo(phone)}</p>
            <div className="space-y-1">
              <Label htmlFor="wa-code">{t.whatsapp.notConnected.codeLabel}</Label>
              <Input
                id="wa-code"
                inputMode="numeric"
                maxLength={6}
                placeholder={t.whatsapp.notConnected.codePlaceholder}
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
                className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                autoFocus
              />
            </div>
            <div className="flex justify-between">
              <Button variant="outline" onClick={() => setStep("phone")} disabled={confirm.isPending}>
                {t.whatsapp.notConnected.back}
              </Button>
              <Button onClick={submitCode} disabled={confirm.isPending}>
                {confirm.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirm.isPending
                  ? t.whatsapp.notConnected.codeSubmitting
                  : t.whatsapp.notConnected.codeSubmit}
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function Step({
  icon: Icon,
  title,
  body,
  footer,
}: {
  icon: typeof MessageCircle;
  title: string;
  body: string;
  footer?: React.ReactNode;
}) {
  return (
    <div className="flex items-start gap-3 rounded-md border bg-muted/30 px-4 py-3">
      <Icon className="h-5 w-5 text-primary mt-0.5" />
      <div className="flex-1 space-y-1">
        <p className="font-semibold text-sm">{title}</p>
        <p className="text-sm text-muted-foreground">{body}</p>
        {footer}
      </div>
    </div>
  );
}

