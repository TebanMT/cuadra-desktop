import { useEffect, useState } from "react";
import { Loader2, Lock, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
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
import { useAlerts, useUpdateAlert, useWhatsappState, type AlertConfig, type AlertKey } from "@/hooks/useNotifications";
import { useAuthStore } from "@/stores/useAuthStore";
import { ApiError } from "@/lib/api";
import { settings as t } from "@/strings/settings";

// Datos de ejemplo para la vista previa — mismo set que TemplatesPage para
// que el tono y los placeholders sean idénticos entre Alertas y Plantillas.
const SAMPLE_DATA: Record<string, string> = {
  "{gym_name}": "Gym Bros",
  "{member_name}": "Juan Pérez García",
  "{member_first_name}": "Juan",
  "{product_name}": "Proteína Whey 2kg",
  "{stock}": "3",
  "{count}": "7",
  "{diff_amount}": "120.50",
  "{days_inactive}": "21",
  "{date}": "14 may 2026",
};

function renderPreview(body: string, sample: Record<string, string>): string {
  return body.replace(/\{[a-z_]+\}/g, (match) => sample[match] ?? match);
}

export default function AlertsPage() {
  const list = useAlerts();
  const gymName = useAuthStore((s) => s.gym?.name) ?? "Gym Bros";
  const sample = { ...SAMPLE_DATA, "{gym_name}": gymName };

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.alerts.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.alerts.subtitle}</p>
      </div>

      {list.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.alerts.loadError}</AlertDescription>
        </Alert>
      )}

      {list.data && (
        <div className="space-y-3">
          {list.data.items.map((cfg) => (
            <AlertCard key={cfg.key} cfg={cfg} sample={sample} />
          ))}
        </div>
      )}
    </div>
  );
}

function AlertCard({ cfg, sample }: { cfg: AlertConfig; sample: Record<string, string> }) {
  const update = useUpdateAlert(cfg.key as AlertKey);
  const meta = t.alerts.keys[cfg.key];
  const editor = t.alerts.editor;

  const [body, setBody] = useState(cfg.body);
  const [bodyError, setBodyError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  // El texto sólo se edita cuando el gym usa su PROPIO número de WhatsApp
  // (Plus + conectado). Si sale por el maestro de Tinta, llega la plantilla
  // aprobada por Meta — read-only mostrando el default. El switch on/off SÍ
  // funciona. Espeja el gate del BE (UsesOwnWhatsAppNumber).
  const whatsapp = useWhatsappState();
  const canEditText = whatsapp.data?.status === "connected";
  const effectiveBody = canEditText ? body : cfg.default_body;

  // Sincroniza el textarea cuando el server devuelve un valor nuevo (e.g.
  // después de un Restaurar o un guardado optimista resuelto). Si no, el
  // textarea se quedaría con texto stale tras un refresh.
  useEffect(() => {
    setBody(cfg.body);
    setBodyError(null);
  }, [cfg.body]);

  // Variables del wire del BE son la fuente de verdad; el map local
  // (TEMPLATE_VARIABLES) sólo aplica si el BE no manda nada.
  const variables = cfg.variables.map((v) => (v.startsWith("{") ? v : `{${v}}`));

  const dirty = body.trim() !== cfg.body.trim();
  // "Personalizada" lo decidimos comparando body vs default — así si el
  // dueño hace Restaurar y el override row sigue ahí, el badge desaparece.
  const customized = cfg.body.trim() !== cfg.default_body.trim();

  async function toggle(checked: boolean) {
    try {
      await update.mutateAsync({ enabled: checked });
      toast.success(t.alerts.saved);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.alerts.saveError);
    }
  }

  async function saveBody() {
    const trimmed = body.trim();
    if (!trimmed) {
      setBodyError(editor.empty);
      return;
    }
    if (trimmed.length > 1000) {
      setBodyError(editor.tooLong);
      return;
    }
    // Validación local rápida: cada variable requerida debe aparecer al
    // menos una vez. El BE re-valida; esto sólo evita un round-trip obvio.
    for (const v of variables) {
      if (!trimmed.includes(v)) {
        setBodyError(editor.missingVar);
        return;
      }
    }
    setBodyError(null);
    try {
      await update.mutateAsync({ body: trimmed });
      toast.success(editor.success);
    } catch (err) {
      const msg = err instanceof ApiError ? err.message : t.alerts.saveError;
      setBodyError(msg);
    }
  }

  async function restoreDefault() {
    setBodyError(null);
    try {
      await update.mutateAsync({ body: cfg.default_body });
      setBody(cfg.default_body);
      toast.success(editor.success);
      setConfirmReset(false);
    } catch (err) {
      setBodyError(err instanceof ApiError ? err.message : t.alerts.saveError);
    }
  }

  function insertVariable(v: string) {
    setBody((b) => b + (b.endsWith(" ") || !b ? "" : " ") + v);
  }

  return (
    <>
      <Card>
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="font-semibold">{meta?.title ?? cfg.key}</h3>
              <p className="text-sm text-muted-foreground">
                {meta?.description ?? cfg.description}
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {customized && <Badge variant="outline">{t.alerts.customized}</Badge>}
              {update.isPending && (
                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
              )}
              <div className="flex items-center gap-2">
                <Switch
                  id={`alert-toggle-${cfg.key}`}
                  checked={cfg.enabled}
                  onCheckedChange={toggle}
                  disabled={update.isPending}
                />
                <Label
                  htmlFor={`alert-toggle-${cfg.key}`}
                  className="text-xs cursor-pointer"
                >
                  {editor.enabledLabel}
                </Label>
              </div>
            </div>
          </div>

          <div className="grid gap-4 lg:grid-cols-[2fr_1fr]">
            <div className="space-y-3">
              {bodyError && (
                <Alert variant="destructive">
                  <AlertDescription>{bodyError}</AlertDescription>
                </Alert>
              )}
              <Label htmlFor={`alert-body-${cfg.key}`}>{editor.bodyLabel}</Label>
              <Textarea
                id={`alert-body-${cfg.key}`}
                rows={4}
                value={effectiveBody}
                onChange={(e) => setBody(e.target.value)}
                readOnly={!canEditText}
                className={
                  "font-mono text-sm" +
                  (!canEditText ? " opacity-70 cursor-not-allowed bg-muted/40" : "")
                }
              />
              {!canEditText && (
                <p className="flex items-start gap-1.5 text-xs text-muted-foreground">
                  <Lock className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                  <span>{editor.plusOnlyBody}</span>
                </p>
              )}
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground mb-1">
                  {editor.previewLabel}
                </p>
                <p className="text-sm whitespace-pre-wrap">
                  {renderPreview(effectiveBody, sample)}
                </p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {editor.previewHint}
                </p>
              </div>
              {/* Editar el texto es Plus — en Standard sólo el switch on/off
                  (arriba, que autoguarda). Sin Plus no hay fila de guardar. */}
              {canEditText && (
                <div className="flex justify-between pt-1">
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => setConfirmReset(true)}
                    disabled={!customized || update.isPending}
                  >
                    <RotateCcw className="h-4 w-4" />
                    {editor.reset}
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    onClick={saveBody}
                    disabled={!dirty || update.isPending}
                  >
                    {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {update.isPending ? editor.saving : editor.save}
                  </Button>
                </div>
              )}
            </div>

            <div className="rounded-md border bg-muted/30 px-3 py-3 self-start">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {editor.variablesLabel}
              </p>
              <ul className="space-y-1 text-sm font-mono">
                {variables.map((v) => (
                  <li key={v}>
                    {canEditText ? (
                      <button
                        type="button"
                        className="text-primary hover:underline"
                        onClick={() => insertVariable(v)}
                      >
                        {v}
                      </button>
                    ) : (
                      <span className="text-muted-foreground">{v}</span>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{editor.resetConfirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{editor.resetConfirm.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={update.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                restoreDefault();
              }}
              disabled={update.isPending}
            >
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {editor.resetConfirm.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
