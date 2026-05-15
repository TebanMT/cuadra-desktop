import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Image as ImageIcon, X as XIcon, Upload, Camera, ChevronRight, UserPlus } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Checkbox } from "@/components/ui/checkbox";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  PhoneInput,
  DEFAULT_DIAL_CODE,
  formatE164,
  splitE164,
} from "@/components/shared/PhoneInput";
import { useMembershipTypes, type MembershipType } from "@/hooks/useMembershipTypes";
import { useMembersList, type MemberListItem } from "@/hooks/useMembers";
import { useGymChargeSettings } from "@/hooks/useGymChargeSettings";
import { formatMoney, cn } from "@/lib/utils";
import { previewExpiry, todayIso } from "@/lib/dates";
import { getAvatarPalette, getInitials } from "@/lib/avatar";
import { members as t } from "@/strings/members";
import { MemberPhoto, useMemberPhotoSrc } from "./MemberPhoto";
import { CameraCaptureModal } from "@/components/shared/CameraCaptureModal";

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
  // Sub-cargos del primer pago. Default true; el operador los puede
  // deseleccionar para reflejar promos (ej. "primer mes sin inscripción").
  // Si el plan no cobra esa cuota (fee = 0), el checkbox no se renderea.
  charge_enrollment: boolean;
  charge_maintenance: boolean;
  payment_method: "cash" | "transfer" | "card" | "";
}

export interface MemberFormSubmitPayload {
  values: MemberFormValues;
  totalCharge: number;
  // Monto resuelto que se mostró en pantalla para cada cuota — usa el
  // fee del plan con fallback al monto default del gym. El caller los
  // pasa al backend para garantizar que cobre exactamente lo que vio el
  // operador.
  enrollmentAmount: number;
  maintenanceAmount: number;
}

interface Props {
  mode: FormMode;
  initial?: Partial<MemberFormValues>;
  // memberId — sólo en modo edit. Lo usa la preview de foto para
  // renderizar la imagen actual via la ruta local-serve del sidecar
  // (NO contra R2). En modo create no aplica porque no hay socio
  // todavía y la única foto posible está como data URL en values.
  memberId?: string;
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
  charge_enrollment: z.boolean(),
  charge_maintenance: z.boolean(),
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
  charge_enrollment: true,
  charge_maintenance: true,
  payment_method: "cash",
};

// Monto efectivo de una cuota (inscripción / mantenimiento): primero el
// snapshot del plan, fallback al monto default del gym si el plan trae
// 0 (caso: el plan se creó antes de prender el toggle a nivel gym).
function effectiveFee(planFee: number | undefined, gymDefault: number): number {
  if (planFee && planFee > 0) return planFee;
  return gymDefault;
}

function calcTotal(
  plan: MembershipType | undefined,
  chargeEnrollment: boolean,
  chargeMaintenance: boolean,
  gymEnrollmentDefault: number,
  gymMaintenanceDefault: number,
): number {
  if (!plan) return 0;
  let total = plan.price;
  if (chargeEnrollment) {
    total += effectiveFee(plan.enrollment_fee, gymEnrollmentDefault);
  }
  if (chargeMaintenance) {
    total += effectiveFee(plan.maintenance_fee, gymMaintenanceDefault);
  }
  return total;
}

export function MemberForm({ mode, initial, memberId, submitting, onSubmit, onCancel, serverError }: Props) {
  const [values, setValues] = useState<MemberFormValues>({ ...emptyValues, ...initial });
  // El teléfono vive split en dial-code + número nacional sólo para el
  // render del PhoneInput. La fuente de verdad sigue siendo
  // `values.phone` en E.164 (lo que la schema y MemberCreatePage esperan).
  // Inicializamos del posible valor previo si el formulario es de edición.
  const initialSplit = splitE164(initial?.phone ?? "");
  const [phoneDialCode, setPhoneDialCode] = useState(
    initialSplit.dialCode || DEFAULT_DIAL_CODE,
  );
  const [phoneNumber, setPhoneNumber] = useState(initialSplit.number);
  const [showEmail, setShowEmail] = useState(!!initial?.email);
  const [showBirthdate, setShowBirthdate] = useState(!!initial?.birthdate);
  const [showPhoto, setShowPhoto] = useState(!!initial?.photo_url);
  const [showNotes, setShowNotes] = useState(!!initial?.notes);
  const [error, setError] = useState<string | null>(null);
  const [photoErr, setPhotoErr] = useState<string | null>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  // Si el equipo no tiene ninguna cámara conectada, escondemos el botón
  // "Tomar foto" para no ofrecer una opción que va a fallar. La detección
  // usa enumerateDevices (no dispara prompt de permisos en macOS) y deja
  // el botón visible por defecto si la API no existe.
  const [hasCamera, setHasCamera] = useState(true);

  // Flags + default amounts a nivel gym ("¿el gym cobra inscripción /
  // mantenimiento?"). Fuente de verdad: `gyms.charge_settings` en BE
  // (sync entre dispositivos del mismo gym). La visibilidad de los
  // checkboxes depende del FLAG, no del fee del plan — un plan viejo
  // puede tener fee=0 aunque el gym ya cobre la cuota; en ese caso
  // usamos el monto default del gym como fallback.
  const chargeSettingsQuery = useGymChargeSettings();
  const gymCharges = useMemo(
    () => ({
      chargesEnrollment: !!chargeSettingsQuery.data?.charges_enrollment,
      chargesMaintenance: !!chargeSettingsQuery.data?.charges_maintenance,
      defaultEnrollmentAmount: chargeSettingsQuery.data?.enrollment_amount ?? 0,
      defaultMaintenanceAmount: chargeSettingsQuery.data?.maintenance_amount ?? 0,
    }),
    [chargeSettingsQuery.data],
  );

  useEffect(() => {
    if (!navigator.mediaDevices?.enumerateDevices) {
      setHasCamera(false);
      return;
    }
    navigator.mediaDevices
      .enumerateDevices()
      .then((devs) => setHasCamera(devs.some((d) => d.kind === "videoinput")))
      .catch(() => setHasCamera(false));
  }, []);

  // Búsqueda de posibles duplicados por nombre (sólo en create). Debounce
  // 300ms + mínimo 3 letras: evita pegarle al sidecar tras cada keystroke
  // mientras el operador todavía está tipeando "Juan". Backend ya tiene
  // el endpoint con `q=` que busca fuzzy por nombre/teléfono — sin cambios
  // server-side.
  const [debouncedName, setDebouncedName] = useState("");
  // Ref al contenedor (input + caja de matches) para detectar clicks
  // fuera y cerrar las sugerencias — pattern estándar de autocomplete.
  const nameSectionRef = useRef<HTMLDivElement | null>(null);
  // Si el operador cierra la caja de sugerencias para una query dada,
  // recordamos esa query. Si tipea más letras (o borra), `debouncedName`
  // cambia y la caja vuelve a aparecer — comportamiento "tip dismissal"
  // de Gmail: la sugerencia no se cierra para siempre, sólo para ese
  // contexto exacto.
  const [matchesDismissed, setMatchesDismissed] = useState<string | null>(null);
  useEffect(() => {
    if (mode !== "create") {
      setDebouncedName("");
      return;
    }
    const trimmed = values.full_name.trim();
    if (trimmed.length < 3) {
      setDebouncedName("");
      return;
    }
    const handle = setTimeout(() => setDebouncedName(trimmed), 300);
    return () => clearTimeout(handle);
  }, [mode, values.full_name]);

  // Click fuera de la sección "Nombre" → dismiss para la query actual.
  // Mismo efecto que pulsar la X: la caja vuelve a aparecer si el
  // operador modifica el nombre (porque cambia debouncedName). Escucha
  // `mousedown` (no `click`) para anticiparnos al focus change y no
  // pelearse con el ordering de eventos del Radix Select / dialogs.
  useEffect(() => {
    if (!debouncedName) return;
    if (debouncedName === matchesDismissed) return;
    function onMouseDown(e: MouseEvent) {
      const target = e.target as Node | null;
      if (!target) return;
      if (nameSectionRef.current?.contains(target)) return;
      setMatchesDismissed(debouncedName);
    }
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [debouncedName, matchesDismissed]);

  // Mantiene `values.phone` (E.164) sincronizado con los dos sub-campos.
  // Un useEffect en lugar de inline-en-onChange para no perder el último
  // dígito cuando el usuario tipea rápido (el componente del input está
  // controlled por phoneNumber; values.phone se deriva).
  useEffect(() => {
    const e164 = formatE164(phoneDialCode, phoneNumber);
    if (e164 !== values.phone) {
      setValues((v) => ({ ...v, phone: e164 }));
    }
  }, [phoneDialCode, phoneNumber, values.phone]);

  const types = useMembershipTypes(false);
  const activeTypes = useMemo(() => (types.data ?? []).filter((p) => p.active), [types.data]);

  useEffect(() => {
    if (mode === "create" && !values.membership_type_id && activeTypes.length > 0) {
      setValues((v) => ({ ...v, membership_type_id: activeTypes[0].id }));
    }
  }, [mode, activeTypes, values.membership_type_id]);

  const selectedPlan = activeTypes.find((p) => p.id === values.membership_type_id);
  const total = calcTotal(
    selectedPlan,
    values.charge_enrollment,
    values.charge_maintenance,
    gymCharges.defaultEnrollmentAmount,
    gymCharges.defaultMaintenanceAmount,
  );
  const expiryStr = useMemo(() => {
    if (!selectedPlan || !values.start_date) return null;
    return previewExpiry(values.start_date, selectedPlan.duration_days);
  }, [selectedPlan, values.start_date]);

  function update<K extends keyof MemberFormValues>(key: K, val: MemberFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const ALLOWED_EXT = ["jpg", "jpeg", "png", "webp"] as const;

  async function pickPhoto() {
    setPhotoErr(null);
    // Una sola ruta: <input type="file"> nativo del navegador. Tauri
    // usa Chromium/WebKit y soporta el picker igual que web, así
    // evitamos divergencia de comportamiento. Además el FileReader
    // produce una data URL que el sync agent del sidecar reconoce y
    // sube a R2 en el próximo tick (offline-first).
    fileInputRef.current?.click();
  }

  // onFilePicked — convierte el archivo elegido a data URL (base64)
  // y lo guarda en values.photo_url. El sync agent del sidecar detecta
  // filas con photo_url LIKE 'data:%', las sube a R2 vía cloud presign,
  // y reescribe el campo con la URL pública. Mientras tanto el
  // <img> renderea el data URL directo.
  function onFilePicked(e: React.ChangeEvent<HTMLInputElement>) {
    setPhotoErr(null);
    const file = e.target.files?.[0];
    // Reset value para que seleccionar el mismo archivo dos veces
    // dispare onChange.
    e.target.value = "";
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() ?? "";
    if (!(ALLOWED_EXT as readonly string[]).includes(ext)) {
      setPhotoErr(t.form.errors.photoFormat);
      return;
    }
    if (file.size > MAX_PHOTO_BYTES) {
      setPhotoErr(t.form.errors.photoTooBig);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      if (typeof result === "string") update("photo_url", result);
    };
    reader.onerror = () => setPhotoErr(t.form.errors.photoFormat);
    reader.readAsDataURL(file);
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

    onSubmit({
      values,
      totalCharge: total,
      enrollmentAmount: effectiveFee(selectedPlan?.enrollment_fee, gymCharges.defaultEnrollmentAmount),
      maintenanceAmount: effectiveFee(selectedPlan?.maintenance_fee, gymCharges.defaultMaintenanceAmount),
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {(error || serverError) && (
        <Alert variant="destructive">
          <AlertDescription>{error || serverError}</AlertDescription>
        </Alert>
      )}

      <section className="space-y-4">
        <div className="space-y-1">
          <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide">
            {t.form.sections.basics}
          </h3>
          {/* Hint para no-técnicos: los asteriscos junto a "Nombre" y
              "Teléfono" no significan nada por sí solos al público
              objetivo. Esta línea explica la jerarquía sin meter una
              leyenda formal de "* = obligatorio" que se sentiría a
              burocracia. */}
          <p className="text-xs text-muted-foreground">
            {t.form.sections.basicsHint}
          </p>
        </div>

        <div className="space-y-2" ref={nameSectionRef}>
          <Label htmlFor="m-name">{t.form.fields.name} *</Label>
          <Input
            id="m-name"
            value={values.full_name}
            onChange={(e) => update("full_name", e.target.value)}
            autoFocus
          />
          {mode === "create" && debouncedName && debouncedName !== matchesDismissed && (
            <MemberMatches
              query={debouncedName}
              onDismiss={() => setMatchesDismissed(debouncedName)}
            />
          )}
        </div>

        <div className="space-y-2">
          <Label htmlFor="m-phone">{t.form.fields.phone} *</Label>
          <PhoneInput
            id="m-phone"
            dialCode={phoneDialCode}
            number={phoneNumber}
            onDialCodeChange={setPhoneDialCode}
            onNumberChange={setPhoneNumber}
          />
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
            <OptionalFieldHeader
              htmlFor="m-email"
              label={t.form.fields.email}
              onRemove={() => {
                update("email", "");
                setShowEmail(false);
              }}
            />
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
            <OptionalFieldHeader
              htmlFor="m-birthdate"
              label={t.form.fields.birthdate}
              onRemove={() => {
                update("birthdate", "");
                setShowBirthdate(false);
              }}
            />
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
            <OptionalFieldHeader
              label={t.form.fields.photo}
              onRemove={() => {
                update("photo_url", "");
                setShowPhoto(false);
                setPhotoErr(null);
              }}
            />
            <div className="flex flex-wrap items-center gap-3">
              <div className="h-16 w-16 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
                <PhotoPreview value={values.photo_url} memberId={memberId} />
              </div>
              <Button type="button" variant="outline" size="sm" onClick={pickPhoto}>
                <Upload className="h-4 w-4 mr-2" />
                {t.form.chooseFile}
              </Button>
              {hasCamera && (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    setPhotoErr(null);
                    setCameraOpen(true);
                  }}
                >
                  <Camera className="h-4 w-4 mr-2" />
                  {t.form.takePhoto}
                </Button>
              )}
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
              <input
                ref={fileInputRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="hidden"
                onChange={onFilePicked}
              />
            </div>
            {photoErr && <p className="text-xs text-destructive">{photoErr}</p>}
          </div>
        )}

        {showNotes && (
          <div className="space-y-2">
            <OptionalFieldHeader
              htmlFor="m-notes"
              label={t.form.fields.notes}
              onRemove={() => {
                update("notes", "");
                setShowNotes(false);
              }}
            />
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
              <div className="space-y-4 pl-7">
                {/* Desglose: el plan SIEMPRE se cobra (es el motivo del
                    primer pago). Inscripción y mantenimiento aparecen
                    como checkboxes sólo si el plan los cobra; el
                    operador los puede deseleccionar para reflejar
                    promos ("primer mes sin inscripción"). */}
                <div className="space-y-2">
                  <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                    {t.form.chargeBreakdown}
                  </p>
                  <div className="space-y-2 rounded-md border bg-muted/30 p-3">
                    {/* Línea fija: mensualidad / plan. */}
                    <div className="flex items-center justify-between text-sm">
                      <span className="text-foreground">
                        {selectedPlan?.name ?? t.form.fields.type}
                      </span>
                      <span className="font-medium tabular-nums">
                        {formatMoney(selectedPlan?.price ?? 0)}
                      </span>
                    </div>

                    {/* Inscripción: visible cuando el GYM cobra inscripción
                        (toggle en Ajustes), independiente del fee del plan.
                        Si el plan trae fee=0, usamos el default del gym
                        como fallback para que el checkbox no muestre $0
                        cuando el operador esperaba ver el monto. */}
                    {selectedPlan && gymCharges.chargesEnrollment && (
                      <label className="flex items-center justify-between gap-3 cursor-pointer text-sm">
                        <span className="flex items-center gap-2">
                          <Checkbox
                            checked={values.charge_enrollment}
                            onCheckedChange={(v) => update("charge_enrollment", !!v)}
                          />
                          <span>{t.form.chargeEnrollment}</span>
                        </span>
                        <span
                          className={
                            "tabular-nums font-medium " +
                            (values.charge_enrollment ? "" : "text-muted-foreground line-through")
                          }
                        >
                          {formatMoney(effectiveFee(selectedPlan.enrollment_fee, gymCharges.defaultEnrollmentAmount))}
                        </span>
                      </label>
                    )}

                    {/* Mantenimiento: misma lógica. La frecuencia (mensual/
                        bimestral/etc.) podría no estar en el plan si fue
                        creado antes del toggle — esa decisión la toma
                        backend con el snapshot del plan al cobrar la
                        renovación; aquí basta con que el gym cobre. */}
                    {selectedPlan && gymCharges.chargesMaintenance && (
                      <label className="flex items-center justify-between gap-3 cursor-pointer text-sm">
                        <span className="flex items-center gap-2">
                          <Checkbox
                            checked={values.charge_maintenance}
                            onCheckedChange={(v) => update("charge_maintenance", !!v)}
                          />
                          <span>{t.form.chargeMaintenance}</span>
                        </span>
                        <span
                          className={
                            "tabular-nums font-medium " +
                            (values.charge_maintenance ? "" : "text-muted-foreground line-through")
                          }
                        >
                          {formatMoney(effectiveFee(selectedPlan.maintenance_fee, gymCharges.defaultMaintenanceAmount))}
                        </span>
                      </label>
                    )}

                    <div className="border-t pt-2 flex items-center justify-between text-sm font-semibold">
                      <span>{t.form.chargeTotal}</span>
                      <span className="tabular-nums">{formatMoney(total)}</span>
                    </div>
                  </div>
                </div>

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

      <CameraCaptureModal
        open={cameraOpen}
        onOpenChange={setCameraOpen}
        onCapture={(dataUrl) => update("photo_url", dataUrl)}
        title="Capturar foto del socio"
      />
    </form>
  );
}

interface OptionalFieldHeaderProps {
  label: string;
  htmlFor?: string;
  onRemove(): void;
}

// OptionalFieldHeader — pareja inversa de los "+ Agregar X". Renderea
// el Label junto a un botón de quitar que cierra la sección y limpia
// el valor. Lo abstraemos porque email/birthdate/notes lo usan idéntico
// (la foto tiene su propio botón inline para limpiar SOLO el archivo;
// éste cierra la sección completa). Visualmente espejea al "+ Agregar"
// (variant link, sin caja) para que el dueño los lea como un par
// simétrico de la misma jerarquía.
function OptionalFieldHeader({ label, htmlFor, onRemove }: OptionalFieldHeaderProps) {
  return (
    <div className="flex items-center justify-between">
      <Label htmlFor={htmlFor}>{label}</Label>
      <Button
        type="button"
        variant="link"
        size="sm"
        onClick={onRemove}
        className="h-auto p-0 text-xs text-muted-foreground hover:text-foreground"
      >
        − {t.form.removeOptional}
      </Button>
    </div>
  );
}

// PhotoPreview — branch entre dos casos:
//
//   1. El operador acaba de elegir un archivo: values.photo_url es
//      una data URL (resultado del FileReader). Renderea inline —
//      no toca la red.
//
//   2. Estamos editando un socio existente que ya tenía foto:
//      values.photo_url puede ser cualquier cosa (URL R2, marker,
//      cadena vacía si fue removida). En este caso usamos la ruta
//      local-serve del sidecar para que el blob salga del cache en
//      disco, NO de R2. Si el archivo no está cacheado todavía, el
//      <img> dispara onError y caemos al icono placeholder.
//
// Caso "no hay foto" (values.photo_url vacío y sin memberId, o
// memberId pero archivo no existe en cache): ImageIcon.
function PhotoPreview({ value, memberId }: { value: string; memberId: string | undefined }) {
  const localSrc = useMemberPhotoSrc(memberId);
  const [localFailed, setLocalFailed] = useState(false);
  const placeholder = <ImageIcon className="h-6 w-6 text-muted-foreground" />;

  if (value.startsWith("data:")) {
    return <img src={value} alt="" className="h-full w-full object-cover" />;
  }
  // En modo edit con foto previa: si tenemos memberId, intentamos
  // local-serve. Si falla, mostramos placeholder en lugar de abrir
  // un socket a la URL R2.
  if (value && memberId && localSrc && !localFailed) {
    return (
      <img
        src={localSrc}
        alt=""
        className="h-full w-full object-cover"
        onError={() => setLocalFailed(true)}
      />
    );
  }
  return placeholder;
}

type StatusVariant = "success" | "warning" | "destructive" | "secondary" | "outline";

function matchStatusInfo(item: MemberListItem): { label: string; variant: StatusVariant } {
  const s = t.form.matches.status;
  switch (item.access_status) {
    case "allowed_active":
      return { label: s.active, variant: "success" };
    case "allowed_expiring_soon":
      return { label: s.expiringSoon, variant: "warning" };
    case "denied_expired":
      return { label: s.expired, variant: "destructive" };
    case "denied_inactive":
      return { label: s.inactive, variant: "secondary" };
    case "denied_no_membership":
    default:
      return { label: s.noPlan, variant: "outline" };
  }
}

// MemberMatches — lista inline de socios existentes que matchean el
// nombre que está tipeando el operador. Aparece DEBAJO del input (no
// como overlay flotante) — empuja el resto del form hacia abajo. Eso
// evita el comportamiento "dropdown que tapa el campo teléfono" y deja
// claro que es información, no un menú modal.
//
// Diseño: foto + nombre + badge de estado + chevron. El avatar (h-10)
// es el elemento dominante de cada fila: cuando el operador no recuerda
// el nombre pero sí la cara, el reconocimiento se activa visualmente.
//
// Click → navega al detail del socio existente. El form actual se
// abandona — la decisión deliberada del operador al elegir un match
// es "no era nuevo, era este otro".
//
// Backend: useMembersList con `q=` ya hace fuzzy contra nombre/teléfono;
// no requiere endpoint nuevo. page_size=5 acota la lista (más serían
// abrumadores y rara vez relevantes — si necesita más, /members tiene
// el listado completo).
function MemberMatches({ query, onDismiss }: { query: string; onDismiss(): void }) {
  const navigate = useNavigate();
  const list = useMembersList({ q: query, page: 1, page_size: 5 });
  const items = list.data?.items ?? [];
  if (items.length === 0) return null;

  return (
    <div className="mt-1 rounded-md border border-warning-100 bg-warning/5 p-3 space-y-2">
      <div className="flex items-start justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-foreground">
            {t.form.matches.header(items.length)}
          </p>
          <p className="text-xs text-muted-foreground">{t.form.matches.hint}</p>
        </div>
        {/* Dismiss: si el operador confirma que es alguien nuevo a pesar
            del match (caso "ya revisé, es otro"), cierra la caja para
            esta query. Si modifica el nombre tipeando o borrando, la
            caja vuelve a aparecer porque la query cambió. */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={onDismiss}
          className="h-7 w-7 p-0 shrink-0"
          aria-label={t.form.matches.dismiss}
        >
          <XIcon className="h-4 w-4" />
        </Button>
      </div>
      <ul className="space-y-1">
        {items.map((item) => (
          <MatchRow
            key={item.member.id}
            item={item}
            onOpen={() => navigate(`/members/${item.member.id}`)}
          />
        ))}
      </ul>
      {/* Acción positiva para confirmar "no, es alguien nuevo". Más
          descubrible que la X del header — el operador ve un CTA claro
          en lugar de tener que adivinar que el icono cierra. Click
          dispara onDismiss (mismo efecto que la X), el operador continúa
          llenando el form con el nombre que ya tiene tipeado. */}
      <button
        type="button"
        onClick={onDismiss}
        className={cn(
          "flex w-full items-center gap-2 rounded-md border border-dashed",
          "px-3 py-2 text-sm text-muted-foreground",
          "hover:bg-background hover:text-foreground",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "transition-colors"
        )}
      >
        <UserPlus className="h-4 w-4 shrink-0" />
        <span className="truncate">{t.form.matches.createNew(query)}</span>
      </button>
    </div>
  );
}

function MatchRow({ item, onOpen }: { item: MemberListItem; onOpen(): void }) {
  const m = item.member;
  const palette = getAvatarPalette(m.full_name);
  const info = matchStatusInfo(item);
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className={cn(
          "flex w-full items-center gap-3 rounded-md p-2 text-left",
          "hover:bg-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
          "transition-colors"
        )}
      >
        <Avatar className="h-10 w-10 shrink-0">
          <MemberPhoto memberId={m.id} />
          <AvatarFallback
            className="text-xs font-semibold"
            style={{ backgroundColor: palette.bg, color: palette.text }}
          >
            {getInitials(m.full_name)}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0 flex-1">
          <p className="font-medium truncate">{m.full_name}</p>
          <p className="text-xs text-muted-foreground truncate">
            {m.phone || "—"}
          </p>
        </div>
        <Badge variant={info.variant}>{info.label}</Badge>
        <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
      </button>
    </li>
  );
}
