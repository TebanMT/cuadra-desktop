import { useEffect, useState } from "react";
import { Loader2, Pencil, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
  TEMPLATE_VARIABLES,
  useResetTemplate,
  useTemplates,
  useUpdateTemplate,
  type NotificationTemplate,
  type TemplateKey,
} from "@/hooks/useNotifications";
import { useAuthStore } from "@/stores/useAuthStore";
import { ApiError } from "@/lib/api";
import { settings as t } from "@/strings/settings";

const SAMPLE_DATA: Record<string, string> = {
  "{gym_name}": "Gym Bros",
  "{member_name}": "Juan Pérez García",
  "{member_first_name}": "Juan",
  "{expiry_date}": "12 may 2026",
  "{new_expiry_date}": "12 jun 2026",
  "{membership_type}": "Mensual",
  "{gym_address}": "Av. Reforma 123, Col. Centro",
  "{gym_whatsapp}": "+52 55 1234 5678",
  "{amount}": "$500.00",
  "{concept}": "Mensualidad",
  "{balance}": "$200.00",
};

function renderPreview(body: string): string {
  return body.replace(/\{[a-z_]+\}/g, (match) => SAMPLE_DATA[match] ?? match);
}

// Llaves que NO se muestran en Plantillas:
//   - owner_alert_*  → ahora se editan desde Alertas (con su toggle).
//   - whatsapp_connect_otp / operator_temp_password → mensajes del sistema
//     no editables por el dueño en términos prácticos (reglas estrictas de
//     Twilio + auth). Esconderlas evita prometer una edición que rompería
//     el flujo.
// Filtramos en FE; en BE siguen existiendo en notification_templates para
// no romper renders, overrides ya creados ni el listado interno.
const TEMPLATES_HIDDEN_KEYS = new Set<string>([
  "owner_alert_low_stock",
  "owner_alert_expired_batch",
  "owner_alert_cash_close_diff",
  "owner_alert_vip_no_visit",
  "owner_alert_no_payments_today",
  "whatsapp_connect_otp",
  "operator_temp_password",
]);

export default function TemplatesPage() {
  const list = useTemplates();
  const gymName = useAuthStore((s) => s.gym?.name) ?? "Gym Bros";
  const [editing, setEditing] = useState<NotificationTemplate | null>(null);

  const sample = { ...SAMPLE_DATA, "{gym_name}": gymName };
  const visibleItems = list.data?.items.filter(
    (tpl) => !TEMPLATES_HIDDEN_KEYS.has(tpl.key),
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.templates.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.templates.subtitle}</p>
      </div>

      {list.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.templates.loadError}</AlertDescription>
        </Alert>
      )}

      {visibleItems && (
        <div className="space-y-3">
          {visibleItems.map((tpl) => (
            <TemplateRow key={tpl.key} tpl={tpl} onEdit={() => setEditing(tpl)} sample={sample} />
          ))}
        </div>
      )}

      {editing && (
        <TemplateEditModal
          template={editing}
          open={!!editing}
          onOpenChange={(o) => !o && setEditing(null)}
          sample={sample}
        />
      )}
    </div>
  );
}

// humanizeTemplateKey convierte una key snake_case en algo legible para el
// fallback cuando el BE introduce una llave nueva todavía no traducida en
// settings.ts. No queremos crashear (el bug original de TemplatesPage), pero
// tampoco esconderlo con `?.title` — el badge "key cruda" hace obvio que
// falta traducción y no compromete el render.
function humanizeTemplateKey(key: string): string {
  return key
    .split("_")
    .map((w) => (w.length > 0 ? w.charAt(0).toUpperCase() + w.slice(1) : w))
    .join(" ");
}

function TemplateRow({
  tpl,
  onEdit,
  sample,
}: {
  tpl: NotificationTemplate;
  onEdit(): void;
  sample: Record<string, string>;
}) {
  const meta = t.templates.keys[tpl.key as keyof typeof t.templates.keys];
  const title = meta?.title ?? humanizeTemplateKey(tpl.key);
  const description = meta?.description ?? `Plantilla del sistema (clave: ${tpl.key}).`;
  // Decidimos "Personalizada" comparando body vs default_body en vez de
  // confiar en is_default — así, después de Restaurar (que hace PATCH con
  // el default body), el badge desaparece aunque el override row siga ahí.
  const customized = tpl.body.trim() !== tpl.default_body.trim();

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <h3 className="font-semibold">{title}</h3>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
          <div className="flex items-center gap-2">
            {tpl.enabled ? (
              <Badge variant="success">{t.templates.enabled}</Badge>
            ) : (
              <Badge variant="secondary">{t.templates.disabled}</Badge>
            )}
            {customized && <Badge variant="outline">{t.templates.customized}</Badge>}
          </div>
        </div>
        <p className="rounded-md border bg-muted/30 px-3 py-2 text-sm whitespace-pre-wrap">
          {renderPreview(tpl.body || "—").replace(/\{gym_name\}/g, sample["{gym_name}"])}
        </p>
        <div className="flex justify-end">
          <Button variant="outline" size="sm" onClick={onEdit}>
            <Pencil className="h-4 w-4" />
            {t.templates.edit}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

function TemplateEditModal({
  template,
  open,
  onOpenChange,
  sample,
}: {
  template: NotificationTemplate;
  open: boolean;
  onOpenChange(o: boolean): void;
  sample: Record<string, string>;
}) {
  const update = useUpdateTemplate(template.key);
  const reset = useResetTemplate(template.key);
  const [body, setBody] = useState(template.body);
  const [enabled, setEnabled] = useState(template.enabled);
  const [error, setError] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState(false);

  useEffect(() => {
    if (open) {
      setBody(template.body);
      setEnabled(template.enabled);
      setError(null);
    }
  }, [open, template]);

  const meta = t.templates.keys[template.key as keyof typeof t.templates.keys];
  const title = meta?.title ?? humanizeTemplateKey(template.key);
  const description = meta?.description ?? `Plantilla del sistema (clave: ${template.key}).`;
  // Preferimos las variables del wire (autoritativas BE-side); las del map
  // local son fallback por si el BE no las manda en alguna versión.
  const variables = template.variables.length > 0
    ? template.variables.map((v) => (v.startsWith("{") ? v : `{${v}}`))
    : TEMPLATE_VARIABLES[template.key as TemplateKey] ?? [];

  function previewBody(): string {
    return body.replace(/\{[a-z_]+\}/g, (m) => sample[m] ?? m);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!body.trim()) {
      setError(t.templates.modal.empty);
      return;
    }
    if (body.length > 1000) {
      setError(t.templates.modal.tooLong);
      return;
    }
    try {
      await update.mutateAsync({ body: body.trim(), enabled });
      toast.success(t.templates.modal.success);
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.templates.modal.error);
    }
  }

  async function doReset() {
    try {
      const fresh = await reset.mutateAsync(template.default_body);
      setBody(fresh.body);
      setEnabled(fresh.enabled);
      toast.success(t.templates.modal.successReset);
      setConfirmReset(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.templates.modal.error);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            <DialogDescription>{description}</DialogDescription>
          </DialogHeader>

          <form onSubmit={submit} className="grid gap-4 lg:grid-cols-[2fr_1fr]" noValidate>
            <div className="space-y-3">
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="flex items-center justify-between">
                <Label htmlFor="tpl-body">{t.templates.modal.bodyLabel}</Label>
                <div className="flex items-center gap-2">
                  <Switch id="tpl-enabled" checked={enabled} onCheckedChange={setEnabled} />
                  <Label htmlFor="tpl-enabled" className="text-xs cursor-pointer">
                    {t.templates.modal.enabledLabel}
                  </Label>
                </div>
              </div>
              <Textarea
                id="tpl-body"
                rows={7}
                value={body}
                onChange={(e) => setBody(e.target.value)}
                className="font-mono text-sm"
              />
              <div className="rounded-md border bg-muted/30 px-3 py-2">
                <p className="text-xs text-muted-foreground mb-1">
                  {t.templates.modal.previewLabel}
                </p>
                <p className="text-sm whitespace-pre-wrap">{previewBody()}</p>
                <p className="text-[10px] text-muted-foreground mt-2">
                  {t.templates.modal.previewHint}
                </p>
              </div>
              <div className="flex justify-between pt-2">
                <Button
                  type="button"
                  variant="ghost"
                  className="text-muted-foreground"
                  onClick={() => setConfirmReset(true)}
                  disabled={
                    template.body.trim() === template.default_body.trim() ||
                    reset.isPending
                  }
                >
                  <RotateCcw className="h-4 w-4" />
                  {t.templates.modal.reset}
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => onOpenChange(false)}
                    disabled={update.isPending}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={update.isPending}>
                    {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                    {update.isPending ? t.templates.modal.submitting : t.templates.modal.submit}
                  </Button>
                </div>
              </div>
            </div>

            <div className="rounded-md border bg-muted/30 px-3 py-3 self-start">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground mb-2">
                {t.templates.modal.variablesLabel}
              </p>
              <ul className="space-y-1 text-sm font-mono">
                {variables.map((v) => (
                  <li key={v}>
                    <button
                      type="button"
                      className="text-primary hover:underline"
                      onClick={() => setBody((b) => b + (b.endsWith(" ") || !b ? "" : " ") + v)}
                    >
                      {v}
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmReset} onOpenChange={setConfirmReset}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.templates.modal.resetConfirm.title}</AlertDialogTitle>
            <AlertDialogDescription>{t.templates.modal.resetConfirm.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reset.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doReset();
              }}
              disabled={reset.isPending}
            >
              {reset.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t.templates.modal.resetConfirm.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
