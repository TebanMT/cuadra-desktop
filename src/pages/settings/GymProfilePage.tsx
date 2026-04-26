import { useEffect, useState } from "react";
import { Loader2, ShieldAlert } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
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
import { ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";
import { settings as t } from "@/strings/settings";
import { TransferOwnershipModal } from "@/components/settings/TransferOwnershipModal";

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
}

export default function GymProfilePage() {
  const profile = useGymProfile();
  const update = useUpdateGymProfile();
  const role = useAuthStore((s) => s.user?.role);
  const [form, setForm] = useState<FormState | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [transferOpen, setTransferOpen] = useState(false);

  useEffect(() => {
    if (profile.data && !form) {
      const p = profile.data;
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
      });
    }
  }, [profile.data, form]);

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
    };

    try {
      await update.mutateAsync(payload);
      toast.success(t.gymProfile.saved);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.gymProfile.saveError);
    }
  }

  return (
    <div className="p-8 space-y-6 max-w-3xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.gymProfile.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.gymProfile.subtitle}</p>
      </div>

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
                <Input
                  value={form.whatsapp_number}
                  onChange={(e) => update_("whatsapp_number", e.target.value)}
                  placeholder={t.gymProfile.placeholders.whatsapp}
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

        <div className="flex justify-end gap-2">
          <Button type="submit" disabled={update.isPending}>
            {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {update.isPending ? t.gymProfile.saving : t.gymProfile.save}
          </Button>
        </div>
      </form>

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
