import { useEffect, useMemo, useState } from "react";
import { Loader2, Image as ImageIcon, X as XIcon } from "lucide-react";
import { open as openDialog } from "@tauri-apps/plugin-dialog";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { WhatsappInput } from "@/components/shared/WhatsappInput";
import { useMembershipTypes, type MembershipType } from "@/hooks/useMembershipTypes";
import { isTauri, formatMoney } from "@/lib/utils";
import { previewExpiry, todayIso } from "@/lib/dates";
import { members as t } from "@/strings/members";

export type FormMode = "create" | "edit";

export interface MemberFormValues {
  full_name: string;
  phone: string;
  email: string;
  birthdate: string;
  photo_url: string;
  notes: string;
  membership_type_id: string;
  start_date: string;
  charge_first_payment: boolean;
  payment_method: "cash" | "transfer" | "card" | "";
}

export interface MemberFormSubmitPayload {
  values: MemberFormValues;
  totalCharge: number;
}

interface Props {
  mode: FormMode;
  initial?: Partial<MemberFormValues>;
  submitting: boolean;
  onSubmit(payload: MemberFormSubmitPayload): void;
  onCancel(): void;
  serverError?: string | null;
}

const MAX_PHOTO_BYTES = 2 * 1024 * 1024;
const PHONE_DIGITS = /^\d{10}$/;

const baseSchema = z.object({
  full_name: z.string().trim().min(3, t.form.errors.nameLength).max(100, t.form.errors.nameLength),
  phone: z
    .string()
    .transform((s) => s.replace(/\D/g, "").slice(-10))
    .refine((s) => PHONE_DIGITS.test(s), { message: t.form.errors.phoneInvalid }),
  email: z
    .string()
    .trim()
    .optional()
    .refine((s) => !s || z.string().email().safeParse(s).success, { message: t.form.errors.emailInvalid }),
  birthdate: z.string().optional(),
  photo_url: z.string().optional(),
  notes: z.string().optional(),
});

const createSchema = baseSchema.extend({
  membership_type_id: z.string().min(1, t.form.errors.typeRequired),
  start_date: z.string().min(1, t.form.errors.startDateInvalid),
  charge_first_payment: z.boolean(),
  payment_method: z.string(),
});

const editSchema = baseSchema;

const emptyValues: MemberFormValues = {
  full_name: "",
  phone: "",
  email: "",
  birthdate: "",
  photo_url: "",
  notes: "",
  membership_type_id: "",
  start_date: todayIso(),
  charge_first_payment: true,
  payment_method: "cash",
};

function calcTotal(plan: MembershipType | undefined): number {
  if (!plan) return 0;
  let total = plan.price + (plan.enrollment_fee || 0);
  if (plan.maintenance_fee && plan.maintenance_frequency) {
    total += plan.maintenance_fee;
  }
  return total;
}

export function MemberForm({ mode, initial, submitting, onSubmit, onCancel, serverError }: Props) {
  const [values, setValues] = useState<MemberFormValues>({ ...emptyValues, ...initial });
  const [showEmail, setShowEmail] = useState(!!initial?.email);
  const [showBirthdate, setShowBirthdate] = useState(!!initial?.birthdate);
  const [showPhoto, setShowPhoto] = useState(!!initial?.photo_url);
  const [showNotes, setShowNotes] = useState(!!initial?.notes);
  const [error, setError] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);

  const types = useMembershipTypes(false);
  const activeTypes = useMemo(() => (types.data ?? []).filter((p) => p.active), [types.data]);

  useEffect(() => {
    if (mode === "create" && !values.membership_type_id && activeTypes.length > 0) {
      setValues((v) => ({ ...v, membership_type_id: activeTypes[0].id }));
    }
  }, [mode, activeTypes, values.membership_type_id]);

  const selectedPlan = activeTypes.find((p) => p.id === values.membership_type_id);
  const total = calcTotal(selectedPlan);
  const expiryStr = useMemo(() => {
    if (!selectedPlan || !values.start_date) return null;
    return previewExpiry(values.start_date, selectedPlan.duration_days);
  }, [selectedPlan, values.start_date]);

  function update<K extends keyof MemberFormValues>(key: K, val: MemberFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  async function pickPhoto() {
    setPhotoErr(null);
    if (!isTauri()) {
      setPhotoErr("La selección de archivo solo funciona en la app de escritorio.");
      return;
    }
    try {
      const selected = await openDialog({
        multiple: false,
        filters: [{ name: "Imagen", extensions: ["jpg", "jpeg", "png", "webp"] }],
      });
      if (!selected || typeof selected !== "string") return;
      // Validate size by querying the file system if possible; here we just store the path
      // (actual upload happens server-side). Path scheme `asset://` is used by Tauri for previews.
      update("photo_url", selected);
    } catch (e) {
      setPhotoErr(t.form.errors.photoFormat);
    }
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const schema = mode === "create" ? createSchema : editSchema;
    const parsed = schema.safeParse(values);
    if (!parsed.success) {
      const first = parsed.error.errors[0];
      setError(first.message);
      return;
    }

    if (mode === "create" && values.charge_first_payment && !values.payment_method) {
      setError(t.form.errors.methodRequired);
      return;
    }

    onSubmit({ values, totalCharge: total });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {(error || serverError) && (
        <Alert variant="destructive">
          <AlertDescription>{error || serverError}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-4">
        <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
          {t.form.sections.basics}
        </h3>

        <div className="space-y-2">
          <Label htmlFor="m-name">{t.form.fields.name} *</Label>
          <Input
            id="m-name"
            value={values.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            autoFocus
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="m-phone">{t.form.fields.phone} *</Label>
          <WhatsappInput id="m-phone" value={values.phone} onChange={(v) => update("phone", v)} />
        </div>

        <div className="flex flex-wrap gap-3">
          {!showEmail && (
            <Button type="button" variant="link" size="sm" onClick={() => setShowEmail(true)} className="h-auto p-0">
              {t.form.addEmail}
            </Button>
          )}
          {!showBirthdate && (
            <Button type="button" variant="link" size="sm" onClick={() => setShowBirthdate(true)} className="h-auto p-0">
              {t.form.addBirthdate}
            </Button>
          )}
          {!showPhoto && (
            <Button type="button" variant="link" size="sm" onClick={() => setShowPhoto(true)} className="h-auto p-0">
              {t.form.addPhoto}
            </Button>
          )}
          {!showNotes && (
            <Button type="button" variant="link" size="sm" onClick={() => setShowNotes(true)} className="h-auto p-0">
              {t.form.addNotes}
            </Button>
          )}
        </div>

        {showEmail && (
          <div className="space-y-2">
            <Label htmlFor="m-email">{t.form.fields.email}</Label>
            <Input
              id="m-email"
              type="email"
              value={values.email}
              onChange={(e) => update("email", e.target.value)}
            />
          </div>
        )}

        {showBirthdate && (
          <div className="space-y-2">
            <Label htmlFor="m-birthdate">{t.form.fields.birthdate}</Label>
            <Input
              id="m-birthdate"
              type="date"
              value={values.birthdate}
              onChange={(e) => update("birthdate", e.target.value)}
            />
          </div>
        )}

        {showPhoto && (
          <div className="space-y-2">
            <Label>{t.form.fields.photo}</Label>
            <div className="flex items-center gap-3">
              <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
                {values.photo_url ? (
                  <img src={values.photo_url} alt="" className="h-full w-full object-cover" />
                ) : (
                  <ImageIcon className="h-6 w-6 text-muted-foreground" />
                )}
              </div>
              <Button type="button" variant="outline" size="sm" onClick={pickPhoto}>
                {t.form.chooseFile}
              </Button>
              {values.photo_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => update("photo_url", "")}
                >
                  <XIcon className="h-4 w-4" />
                  {t.form.removePhoto}
                </Button>
              )}
            </div>
            {photoErr && <p className="text-xs text-destructive">{photoErr}</p>}
          </div>
        )}

        {showNotes && (
          <div className="space-y-2">
            <Label htmlFor="m-notes">{t.form.fields.notes}</Label>
            <Textarea
              id="m-notes"
              value={values.notes}
              onChange={(e) => update("notes", e.target.value)}
              rows={3}
            />
          </div>
        )}
      </section>

      {mode === "create" && (
        <section className="space-y-4">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t.form.sections.membership}
          </h3>

          <div className="space-y-2">
            <Label htmlFor="m-type">{t.form.fields.type} *</Label>
            <Select
              value={values.membership_type_id}
              onValueChange={(v) => update("membership_type_id", v)}
            >
              <SelectTrigger id="m-type">
                <SelectValue placeholder={t.form.errors.typeRequired} />
              </SelectTrigger>
              <SelectContent>
                {activeTypes.map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name} — {formatMoney(p.price)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="m-start">{t.form.fields.startDate}</Label>
            <Input
              id="m-start"
              type="date"
              value={values.start_date}
              onChange={(e) => update("start_date", e.target.value)}
            />
            {expiryStr && (
              <p className="text-sm text-muted-foreground">{t.form.expiryPreview(expiryStr)}</p>
            )}
          </div>

          <div className="rounded-lg border p-4 space-y-3">
            <label className="flex items-center gap-3 cursor-pointer">
              <Checkbox
                checked={values.charge_first_payment}
                onCheckedChange={(v) => update("charge_first_payment", !!v)}
              />
              <span className="font-medium">{t.form.chargeFirstPayment}</span>
            </label>

            {values.charge_first_payment && (
              <div className="space-y-3 pl-7">
                <p className="text-sm text-muted-foreground">{t.form.chargeAmount(formatMoney(total))}</p>
                <RadioGroup
                  value={values.payment_method}
                  onValueChange={(v) => update("payment_method", v as MemberFormValues["payment_method"])}
                  className="flex flex-wrap gap-4"
                >
                  <label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="cash" id="pm-cash" />
                    <span>{t.form.methods.cash}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="transfer" id="pm-transfer" />
                    <span>{t.form.methods.transfer}</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <RadioGroupItem value="card" id="pm-card" />
                    <span>{t.form.methods.card}</span>
                  </label>
                </RadioGroup>
              </div>
            )}
          </div>
        </section>
      )}

      <div className="flex flex-col gap-3 sm:flex-row justify-end pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {t.form.cancel}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
          {mode === "create" ? t.form.submitNew : t.form.submitEdit}
        </Button>
      </div>
    </form>
  );
}
