import { useEffect, useState } from "react";
import { Loader2, RefreshCw, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  DEFAULT_DIAL_CODE,
  PhoneInput,
  formatE164,
  splitE164,
} from "@/components/shared/PhoneInput";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  TAX_REGIMES_MX,
  TIMEZONES_MX,
  useGymProfile,
  useUpdateGymProfile,
  type UpdateGymProfileInput,
} from "@/hooks/useGym";
import { useRefreshIdentity } from "@/hooks/useAuth";
import { isPlusPlan } from "@/hooks/useSubscription";
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";
import { settings as t } from "@/strings/settings";
import { TransferOwnershipModal } from "@/components/settings/TransferOwnershipModal";
import { Link } from "react-router-dom";
import { Lock } from "lucide-react";

const RFC_REGEX = /^[A-Z&Ñ]{3,4}[0-9]{6}[A-Z0-9]{3}$/;
const HEX_REGEX = /^#[0-9A-Fa-f]{6}$/;

interface FormState {
  name: string;
  city: string;
  whatsapp_number: string;
  timezone: string;
  rfc: string;
  legal_name: string;
  postal_code: string;
  tax_regime: string;
  logo_url: string;
  primary_color: string;
  secondary_color: string;
  open_time: string;
  close_time: string;
  kiosk_volume: number;
  kiosk_feedback_ttl_ms: number;
  access_webhook_url: string;
  access_webhook_secret: string; // empty = unchanged; "—CLEAR—" sentinel handled in submit
  access_webhook_secret_set: boolean;
}

export default function GymProfilePage() {
  const profile = useGymProfile();
  const update = useUpdateGymProfile();
  const refreshIdentity = useRefreshIdentity();
  const role = useAuthStore((s) => s.user?.role);
  const canEdit = role === "owner";
  const subscriptionPlan = useAuthStore((s) => s.gym?.subscription_plan);
  const isPlus = isPlusPlan(subscriptionPlan);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);
  // Phone se edita con dial + number locales (UX no-técnica) y se serializa
  // a E.164 hacia form.whatsapp_number, que es lo que viaja al BE.
  const [phoneDialCode, setPhoneDialCode] = useState<string>(DEFAULT_DIAL_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");

  async function onRefresh() {
    try {
      await refreshIdentity.mutateAsync();
      // El query de gym profile se invalida adentro del hook; el form
      // se re-hidrata cuando profile.data cambie (useEffect existente).
      // Forzamos a re-leer reseteando el form para que el useEffect dispare.
      setForm(null);
      toast.success("Datos del gym actualizados desde la nube.");
    } catch (e) {
      if (e instanceof ApiError && e.status === 412) {
        toast.error("Esta laptop no está vinculada a la nube. Re-pareo necesario.");
      } else if (e instanceof ApiError && e.status === 503) {
        toast.error("Necesitas internet para volver a leer los datos.");
      } else {
        toast.error("No pudimos refrescar los datos. Vuelve a intentar.");
      }
    }
  }

  useEffect(() => {
    if (profile.data && !form) {
      const p = profile.data;
      const split = splitE164(p.whatsapp_number ?? "");
      setPhoneDialCode(split.dialCode);
      setPhoneNumber(split.number);
      setForm({
        name: p.name ?? "",
        city: p.city ?? "",
        whatsapp_number: p.whatsapp_number ?? "",
        timezone: p.timezone ?? "America/Mexico_City",
        rfc: p.rfc ?? "",
        legal_name: p.legal_name ?? "",
        postal_code: p.postal_code ?? "",
        tax_regime: p.tax_regime ?? "",
        logo_url: p.logo_url ?? "",
        primary_color: p.primary_color ?? "",
        secondary_color: p.secondary_color ?? "",
        open_time: p.open_time ?? "",
        close_time: p.close_time ?? "",
        kiosk_volume: p.kiosk_volume ?? 80,
        kiosk_feedback_ttl_ms: p.kiosk_feedback_ttl_ms ?? 5000,
        access_webhook_url: p.access_webhook_url ?? "",
        access_webhook_secret: "",
        access_webhook_secret_set: p.access_webhook_secret_set ?? false,
      });
    }
  }, [profile.data, form]);

  // Sincroniza form.whatsapp_number con los dos sub-campos. El form sigue
  // siendo la fuente de verdad para el submit; los dos sub-campos son sólo
  // UI. useEffect (no inline) para no perder dígitos en typing rápido.
  useEffect(() => {
    if (!form) return;
    const e164 = formatE164(phoneDialCode, phoneNumber);
    if (e164 !== form.whatsapp_number) {
      setForm((f) => (f ? { ...f, whatsapp_number: e164 } : f));
    }
  }, [phoneDialCode, phoneNumber, form]);

  if (profile.isLoading || !form) {
    return (
      <div className="p-8 flex items-center justify-center py-20">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profile.error) {
    return (
      <div className="p-8 max-w-2xl">
        <Alert variant="destructive">
          <AlertDescription>{t.gymProfile.loadError}</AlertDescription>
        </Alert>
      </div>
    );
  }

  function update_<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((f) => (f ? { ...f, [key]: value } : f));
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!form) return;
    setError(null);

    if (!form.name.trim()) {
      setError(t.gymProfile.errors.nameRequired);
      return;
    }
    if (form.rfc.trim() && !RFC_REGEX.test(form.rfc.trim().toUpperCase())) {
      setError(t.gymProfile.errors.rfcInvalid);
      return;
    }
    if (form.primary_color && !HEX_REGEX.test(form.primary_color)) {
      setError(t.gymProfile.errors.colorInvalid);
      return;
    }
    if (form.secondary_color && !HEX_REGEX.test(form.secondary_color)) {
      setError(t.gymProfile.errors.colorInvalid);
      return;
    }

    // Light validation for the access webhook URL (BE re-validates).
    const webhookUrl = form.access_webhook_url.trim();
    if (webhookUrl && !/^https?:\/\//i.test(webhookUrl)) {
      setError("La URL del webhook de acceso debe empezar con http:// o https://");
      return;
    }

    const payload: UpdateGymProfileInput = {
      name: form.name.trim(),
      city: form.city.trim() || undefined,
      whatsapp_number: form.whatsapp_number.trim() || null,
      timezone: form.timezone,
      rfc: form.rfc.trim().toUpperCase() || null,
      legal_name: form.legal_name.trim() || null,
      postal_code: form.postal_code.trim() || null,
      tax_regime: form.tax_regime || null,
      logo_url: form.logo_url || null,
      primary_color: form.primary_color || null,
      secondary_color: form.secondary_color || null,
      open_time: form.open_time || null,
      close_time: form.close_time || null,
      kiosk_volume: form.kiosk_volume,
      kiosk_feedback_ttl_ms: form.kiosk_feedback_ttl_ms,
      access_webhook_url: webhookUrl || "",
    };
    // Only include the secret if the user typed something — empty input keeps
    // the existing secret. Sending "" explicitly clears it (handled by a
    // dedicated "Borrar secreto" button).
    if (form.access_webhook_secret.trim()) {
      payload.access_webhook_secret = form.access_webhook_secret.trim();
    }

    try {
      await update.mutateAsync(payload);
      toast.success(t.gymProfile.saved);
    } catch (err) {
      // Conflict de WhatsApp: el BE devuelve 422 con mensaje del sentinel
      // ErrWhatsAppAlreadyTaken. Lo traducimos a copy específica para que
      // el dueño sepa qué corregir, en lugar del mensaje crudo del BE.
      if (
        err instanceof ApiError &&
        err.status === 422 &&
        (/whatsapp.*registr|registr.*whatsapp/i.test(err.message) ||
          /uq_gyms_whatsapp/i.test(err.message))
      ) {
        setError(t.gymProfile.errors.whatsappTaken);
        return;
      }
      setError(err instanceof ApiError ? err.message : t.gymProfile.saveError);
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t.gymProfile.title}
          </h1>
          <p className="text-sm text-muted-foreground">{t.gymProfile.subtitle}</p>
        </div>
        {/* Nivel 1 de re-pareo: bota al cloud, baja los datos frescos
            del gym + dueño, re-mirrorea el SQLite local. No revoca
            credenciales — sólo refresca identidad. Útil cuando ves
            nombre vacío / phone null tras un setup desde otro device. */}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={onRefresh}
          disabled={refreshIdentity.isPending}
          title="Volver a leer los datos del gym desde la nube"
        >
          {refreshIdentity.isPending ? (
            <Loader2 className="h-4 w-4 mr-2 animate-spin" />
          ) : (
            <RefreshCw className="h-4 w-4 mr-2" />
          )}
          Refrescar datos
        </Button>
      </div>

      {!canEdit && (
        // Banner read-only para operadores. La razón se explica explícita:
        // "el dueño es quien edita los datos del gym". El BE también enforce
        // owner-only en PATCH /gyms/me — esto es la otra cara de la moneda
        // para que el operador no llene un form que va a recibir 403.
        <Alert>
          <AlertDescription>{t.gymProfile.readOnlyForOperator}</AlertDescription>
        </Alert>
      )}

      {/* Envolver el form en <fieldset disabled> propaga el disabled a todos
          los inputs/selects/buttons descendientes sin tener que tocar cada
          uno individualmente. Es HTML nativo, accesible (screen readers
          anuncian "disabled") y a prueba de inputs nuevos que se agreguen. */}
      <fieldset disabled={!canEdit} className="contents">
      <form onSubmit={submit} className="space-y-4" noValidate>
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Card>
          <CardContent className="pt-5 pb-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.gymProfile.sections.general}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t.gymProfile.fields.name}>
                <Input value={form.name} onChange={(e) => update_("name", e.target.value)} />
              </Field>
              <Field label={t.gymProfile.fields.city}>
                <Input value={form.city} onChange={(e) => update_("city", e.target.value)} />
              </Field>
              <Field label={t.gymProfile.fields.whatsapp}>
                <PhoneInput
                  dialCode={phoneDialCode}
                  number={phoneNumber}
                  onDialCodeChange={setPhoneDialCode}
                  onNumberChange={setPhoneNumber}
                />
              </Field>
              <Field label={t.gymProfile.fields.timezone}>
                <Select
                  value={form.timezone}
                  onValueChange={(v) => update_("timezone", v)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder={t.gymProfile.placeholders.timezone} />
                  </SelectTrigger>
                  <SelectContent>
                    {TIMEZONES_MX.map((tz) => (
                      <SelectItem key={tz} value={tz}>
                        {tz.replace("America/", "")}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Datos fiscales — feature Plus. Mientras Plus no se vende, la
            sección entera se oculta para Standard (sin placeholder
            "Próximamente"). Cuando Plus se libere, revertir al patrón
            isPlus ? Card : PlusLockedCard — ver git history y comentario
            `CUANDO PLUS SE LIBERE` en src/hooks/useSubscription.ts. */}
        {isPlus && (
          <Card>
            <CardContent className="pt-5 pb-5 space-y-4">
              <div className="flex items-baseline justify-between">
                <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                  {t.gymProfile.sections.tax}
                </h2>
                <p className="text-xs text-muted-foreground">{t.gymProfile.help.taxOptional}</p>
              </div>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t.gymProfile.fields.rfc}>
                  <Input
                    value={form.rfc}
                    onChange={(e) => update_("rfc", e.target.value.toUpperCase())}
                    placeholder={t.gymProfile.placeholders.rfc}
                    className="uppercase tracking-wider"
                  />
                </Field>
                <Field label={t.gymProfile.fields.legalName}>
                  <Input
                    value={form.legal_name}
                    onChange={(e) => update_("legal_name", e.target.value)}
                  />
                </Field>
                <Field label={t.gymProfile.fields.postalCode}>
                  <Input
                    value={form.postal_code}
                    onChange={(e) => update_("postal_code", e.target.value)}
                    inputMode="numeric"
                    maxLength={5}
                  />
                </Field>
                <Field label={t.gymProfile.fields.taxRegime}>
                  <Select
                    value={form.tax_regime}
                    onValueChange={(v) => update_("tax_regime", v)}
                  >
                    <SelectTrigger>
                      <SelectValue placeholder={t.gymProfile.placeholders.taxRegime} />
                    </SelectTrigger>
                    <SelectContent>
                      {TAX_REGIMES_MX.map((r) => (
                        <SelectItem key={r.code} value={r.code}>
                          {r.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </Field>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Branding (logo + colores) — feature Plus, mismo trato que Tax.
            El BE sigue gateando inline en PATCH /gyms/me cuando vienen
            LogoURL / PrimaryColor / SecondaryColor (gym.HasPlusOnlyFields),
            así que la defensa en profundidad sigue activa. */}
        {isPlus && (
          <Card>
            <CardContent className="pt-5 pb-5 space-y-4">
              <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
                {t.gymProfile.sections.branding}
              </h2>
              <div className="grid gap-4 md:grid-cols-2">
                <Field label={t.gymProfile.fields.logo}>
                  <Input
                    value={form.logo_url}
                    onChange={(e) => update_("logo_url", e.target.value)}
                    placeholder="https://…"
                  />
                  <p className="text-xs text-muted-foreground mt-1">{t.gymProfile.help.logo}</p>
                </Field>
                <div className="grid grid-cols-2 gap-4">
                  <Field label={t.gymProfile.fields.primaryColor}>
                    <ColorInput
                      value={form.primary_color}
                      onChange={(v) => update_("primary_color", v)}
                    />
                  </Field>
                  <Field label={t.gymProfile.fields.secondaryColor}>
                    <ColorInput
                      value={form.secondary_color}
                      onChange={(v) => update_("secondary_color", v)}
                    />
                  </Field>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        <Card>
          <CardContent className="pt-5 pb-5 space-y-4">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
              {t.gymProfile.sections.operations}
            </h2>
            <div className="grid gap-4 md:grid-cols-2">
              <Field label={t.gymProfile.fields.openTime}>
                <Input
                  type="time"
                  value={form.open_time}
                  onChange={(e) => update_("open_time", e.target.value)}
                />
              </Field>
              <Field label={t.gymProfile.fields.closeTime}>
                <Input
                  type="time"
                  value={form.close_time}
                  onChange={(e) => update_("close_time", e.target.value)}
                />
              </Field>
              <Field label={t.gymProfile.fields.kioskVolume}>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[form.kiosk_volume]}
                    min={0}
                    max={100}
                    step={5}
                    onValueChange={([v]) => update_("kiosk_volume", v)}
                  />
                  <span className="w-10 text-sm tabular-nums text-muted-foreground">
                    {t.gymProfile.help.kioskVolume(form.kiosk_volume)}
                  </span>
                </div>
              </Field>
              <Field label={t.gymProfile.fields.kioskFeedbackTtl}>
                <div className="flex items-center gap-3">
                  <Slider
                    value={[form.kiosk_feedback_ttl_ms]}
                    min={3000}
                    max={10000}
                    step={500}
                    onValueChange={([v]) => update_("kiosk_feedback_ttl_ms", v)}
                  />
                  <span className="w-12 text-sm tabular-nums text-muted-foreground">
                    {t.gymProfile.help.kioskFeedbackTtl(form.kiosk_feedback_ttl_ms / 1000)}
                  </span>
                </div>
              </Field>
            </div>
          </CardContent>
        </Card>

        {/* Access webhook — feature Plus. Mismo trato que Tax/Branding:
            sección oculta entera para Standard mientras Plus no se vende.
            Cuando Plus se libere, revertir al patrón isPlus ? Card :
            PlusLockedCard. */}
        {isPlus && (
        <Card>
          <CardContent className="pt-5 pb-5 space-y-3">
            <div>
              <h2 className="font-semibold">Acceso por hardware (avanzado)</h2>
              <p className="text-sm text-muted-foreground mt-1">
                Tinta envía una notificación a la URL que configures cada vez que un
                socio entra correctamente. Tu electricista o instalador puede usar eso
                para abrir un torniquete, cerradura, etc. Si no usas hardware, déjalo
                vacío.
              </p>
            </div>
            <Field label="URL del webhook">
              <Input
                type="url"
                placeholder="https://192.168.1.50/door/open"
                value={form.access_webhook_url}
                onChange={(e) => update_("access_webhook_url", e.target.value)}
                autoComplete="off"
              />
            </Field>
            <Field label={`Secreto compartido${form.access_webhook_secret_set ? " (ya configurado)" : ""}`}>
              <div className="flex gap-2">
                <Input
                  type="text"
                  placeholder={
                    form.access_webhook_secret_set
                      ? "Pegar nuevo para rotar"
                      : "Opcional — firma HMAC-SHA256"
                  }
                  value={form.access_webhook_secret}
                  onChange={(e) => update_("access_webhook_secret", e.target.value)}
                  autoComplete="off"
                />
                {form.access_webhook_secret_set && (
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => {
                      // Submitting `access_webhook_secret: ""` explicitly
                      // clears the stored secret server-side. We use a
                      // dedicated mutation call so the user can clear
                      // without filling in a new value.
                      update.mutate(
                        { access_webhook_secret: "" },
                        {
                          onSuccess: () => {
                            toast.success("Secreto eliminado.");
                            update_("access_webhook_secret_set", false);
                          },
                        }
                      );
                    }}
                    disabled={update.isPending}
                  >
                    Borrar
                  </Button>
                )}
              </div>
              <p className="text-xs text-muted-foreground mt-1">
                Cuando configures un secreto, cada llamada llevará el header{" "}
                <code className="text-xs">X-Tinta-Signature</code> con el HMAC-SHA256
                del cuerpo. Tu hardware puede validarlo para evitar llamadas falsas.
              </p>
            </Field>
          </CardContent>
        </Card>
        )}

        {canEdit && (
          <div className="flex justify-end gap-2">
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {update.isPending ? t.gymProfile.saving : t.gymProfile.save}
            </Button>
          </div>
        )}
      </form>
      </fieldset>

      {role === "owner" && (
        <Card className="border-destructive/40">
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-start gap-3">
              <ShieldAlert className="h-5 w-5 text-destructive mt-0.5 shrink-0" />
              <div className="flex-1">
                <h2 className="font-semibold">{t.gymProfile.sections.danger}</h2>
                <p className="text-sm text-muted-foreground mt-1">
                  {t.gymProfile.transferDescription}
                </p>
              </div>
            </div>
            <div className="flex justify-end">
              <Button
                variant="outline"
                className="border-destructive text-destructive hover:bg-destructive/10"
                onClick={() => setTransferOpen(true)}
              >
                {t.gymProfile.transferOwnership}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      <TransferOwnershipModal open={transferOpen} onOpenChange={setTransferOpen} />
    </div>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      {children}
    </div>
  );
}

// PlusLockedCard reemplaza una sección Plus-only cuando el gym no está en
// Plus. Mensaje neutro (no upsell agresivo) + link discreto a la página de
// Suscripción donde puede comparar tiers y hacer upgrade. Decisión de
// producto: el dueño en Standard ya sabe que existe Plus — repetirle "compra
// más" en cada sección sólo lo molesta.
function PlusLockedCard({
  sectionTitle,
  description,
}: {
  sectionTitle: string;
  description: string;
}) {
  return (
    <Card className="border-dashed">
      <CardContent className="pt-5 pb-5 space-y-3">
        <div className="flex items-baseline justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {sectionTitle}
          </h2>
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Lock className="h-3 w-3" />
            {t.plus.badge}
          </span>
        </div>
        <p className="text-sm text-muted-foreground">{description}</p>
        <div>
          <Link
            to="/settings/subscription"
            className="text-sm font-medium text-primary hover:underline"
          >
            {t.plus.cta} →
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}

function ColorInput({ value, onChange }: { value: string; onChange(v: string): void }) {
  const safe = HEX_REGEX.test(value) ? value : "#000000";
  return (
    <div className="flex items-center gap-2">
      <input
        type="color"
        value={safe}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        className="h-11 w-14 rounded-md border border-input cursor-pointer"
      />
      <Input
        value={value}
        onChange={(e) => onChange(e.target.value.toUpperCase())}
        placeholder="#000000"
        maxLength={7}
        className="font-mono"
      />
    </div>
  );
}
