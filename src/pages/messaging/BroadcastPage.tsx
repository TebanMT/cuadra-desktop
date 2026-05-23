import { useEffect, useState } from "react";
import { Loader2, Megaphone, Send } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
  useBroadcastPreview,
  useSendBroadcast,
  useWhatsappState,
  type BroadcastAudience,
} from "@/hooks/useNotifications";
import { useAuthStore } from "@/stores/useAuthStore";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";
import { PlusFeatureLock } from "@/components/shared/PlusFeatureLock";
import { ApiError } from "@/lib/api";
import { messaging as t } from "@/strings/messaging";

const AUDIENCES: BroadcastAudience[] = [
  "all_active",
  "expiring_this_week",
  "expired_recoverable",
  "inactive_21d",
  "vip",
];

const SAMPLE = {
  "{gym_name}": "Gym Bros",
  "{member_name}": "Juan Pérez",
  "{member_first_name}": "Juan",
};

export default function BroadcastPage() {
  const whatsapp = useWhatsappState();
  const send = useSendBroadcast();
  const gymName = useAuthStore((s) => s.gym?.name) ?? "tu gym";
  const plan = useAuthStore((s) => s.gym?.subscription_plan);
  const isPlus = canAccessPlusFeatures(plan);

  const [audience, setAudience] = useState<BroadcastAudience | null>(null);
  const [body, setBody] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const preview = useBroadcastPreview(audience);

  useEffect(() => {
    setError(null);
  }, [audience, body]);

  const sample = { ...SAMPLE, "{gym_name}": gymName };
  const previewBody = body.replace(/\{[a-z_]+\}/g, (m) => sample[m as keyof typeof sample] ?? m);
  const recipientsCount = preview.data?.recipients_count ?? 0;
  const isWhatsappConnected = whatsapp.data?.status === "connected";

  function validate(): string | null {
    if (!audience) return t.broadcast.noAudience;
    if (!body.trim()) return t.broadcast.empty;
    if (body.length > 1000) return t.broadcast.tooLong;
    return null;
  }

  function openConfirm() {
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setConfirmOpen(true);
  }

  async function doSend() {
    if (!audience) return;
    try {
      const res = await send.mutateAsync({ audience, body: body.trim() });
      toast.success(t.broadcast.success(res.recipients_count));
      setConfirmOpen(false);
      setBody("");
      setAudience(null);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.broadcast.error);
      setConfirmOpen(false);
    }
  }

  // Broadcast (envío masivo a socios) es Plus por pricing — Standard sólo
  // envía mensajes transaccionales (recordatorios, comprobantes). El
  // SettingsIndex ya bloquea el card de Mensajes para Standard, pero un
  // deep-link a /messaging/broadcast o un menú futuro podrían saltarse
  // ese gate. Defensa-en-profundidad con PlusFeatureLock.
  if (!isPlus) {
    return (
      <PlusFeatureLock
        icon={Megaphone}
        title="Envío masivo a socios es parte de Plus"
        body="Manda recordatorios, promociones y avisos a grupos completos (todos los activos, por vencer, inactivos, VIP). Disponible al mejorar a Plus."
      />
    );
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.broadcast.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.broadcast.subtitle}</p>
      </div>
      <div className="space-y-4">
        {!isWhatsappConnected && !whatsapp.isLoading && (
        <Alert variant="warning">
          <AlertDescription>{t.broadcast.notConnected}</AlertDescription>
        </Alert>
      )}

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="space-y-1">
            <Label htmlFor="bc-audience">{t.broadcast.audienceLabel}</Label>
            <Select
              value={audience ?? ""}
              onValueChange={(v) => setAudience(v as BroadcastAudience)}
            >
              <SelectTrigger id="bc-audience">
                <SelectValue placeholder="Elige el grupo" />
              </SelectTrigger>
              <SelectContent>
                {AUDIENCES.map((a) => (
                  <SelectItem key={a} value={a}>
                    {t.broadcast.audiences[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {audience && (
              <p className="text-xs text-muted-foreground mt-1">
                {preview.isLoading
                  ? t.broadcast.loadingPreview
                  : t.broadcast.recipientsCount(recipientsCount)}
                {preview.data?.sample_phones && preview.data.sample_phones.length > 0 && (
                  <span className="ml-2">
                    · {t.broadcast.samplePhones} {preview.data.sample_phones.slice(0, 3).join(", ")}…
                  </span>
                )}
              </p>
            )}
          </div>

          <div className="space-y-1">
            <Label htmlFor="bc-body">{t.broadcast.bodyLabel}</Label>
            <Textarea
              id="bc-body"
              rows={6}
              value={body}
              placeholder={t.broadcast.bodyPlaceholder}
              onChange={(e) => setBody(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t.broadcast.bodyHelp}</p>
          </div>

          {body && (
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-1">
                {t.broadcast.previewLabel}
              </p>
              <div className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
                {previewBody}
              </div>
            </div>
          )}

          <div className="flex justify-end pt-2">
            <Button
              onClick={openConfirm}
              disabled={!isWhatsappConnected || send.isPending || !audience || !body.trim()}
            >
              <Send className="h-4 w-4" />
              {send.isPending ? t.broadcast.submitting : t.broadcast.submit}
            </Button>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.broadcast.confirm.title(recipientsCount)}</AlertDialogTitle>
            <AlertDialogDescription>{t.broadcast.confirm.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={send.isPending}>
              {t.broadcast.confirm.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doSend();
              }}
              disabled={send.isPending || recipientsCount === 0}
            >
              {send.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t.broadcast.confirm.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      </div>
    </div>
  );
}
