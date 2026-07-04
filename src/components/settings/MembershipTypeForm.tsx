import { useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { members as t } from "@/strings/members";
import type {
  MaintenanceFrequency,
  MembershipType,
  UpsertMembershipTypeInput,
} from "@/hooks/useMembershipTypes";

const CUSTOM = "custom"; // sentinel del select para "Personalizada"

type CustomUnit = "days" | "months" | "years";

// monthsToApproxDays: el duration_days legacy que acompaña SIEMPRE a
// duration_months (el dominio lo exige >= 1; reportes viejos lo leen).
// Mismo mapeo que el backfill de la migración 027/022: 1→30, 2→60,
// 3→90, 6→180, 12→365.
function monthsToApproxDays(months: number): number {
  const years = Math.floor(months / 12);
  return years * 365 + (months % 12) * 30;
}

interface FormState {
  name: string;
  price: string;
  duration_select: string; // days del preset elegido (como string) o CUSTOM
  custom_count: string; // cantidad cuando el modo es CUSTOM
  custom_unit: CustomUnit; // unidad EXPLÍCITA del modo CUSTOM
}

// presetFor: encuentra el preset que representa al plan. La intención
// del plan es su duration_months: si viene, el match es POR MESES (un
// plan mensual matchea "1 mes" aunque su duration_days legacy difiera);
// si es null, el match es por días exactos entre los presets de días
// (1/7/15). Un plan de 30 días SIN meses NO matchea "1 mes" — se abre
// en modo personalizado para que el dueño re-declare la unidad.
function presetFor(p: MembershipType) {
  return t.types.form.durationOptions.find((opt) =>
    p.duration_months != null
      ? opt.months === p.duration_months
      : opt.months === null && opt.days === p.duration_days,
  );
}

function fromInitial(p: MembershipType | undefined): FormState {
  const base = {
    name: p?.name ?? "",
    price: p ? String(p.price) : "",
    custom_count: "",
    custom_unit: "days" as CustomUnit,
  };
  if (!p) {
    // Default al crear: mensual (1 mes natural), el plan más común.
    return { ...base, duration_select: "30" };
  }
  const preset = presetFor(p);
  if (preset) {
    return { ...base, duration_select: String(preset.days) };
  }
  // Sin preset → modo personalizado con la unidad REAL del plan, para
  // que el dueño vea lo que tiene y la intención no se adivine.
  if (p.duration_months != null) {
    if (p.duration_months % 12 === 0) {
      return {
        ...base,
        duration_select: CUSTOM,
        custom_count: String(p.duration_months / 12),
        custom_unit: "years",
      };
    }
    return {
      ...base,
      duration_select: CUSTOM,
      custom_count: String(p.duration_months),
      custom_unit: "months",
    };
  }
  return {
    ...base,
    duration_select: CUSTOM,
    custom_count: String(p.duration_days),
    custom_unit: "days",
  };
}

interface Props {
  initial?: MembershipType;
  submitting: boolean;
  // Gym-level: la página decide si su gym cobra inscripción/mantenimiento.
  // Cuando false, el campo correspondiente no se renderea ni se envía.
  chargeEnrollment: boolean;
  chargeMaintenance: boolean;
  // Frecuencia de mantenimiento — también gym-level. Sólo aplica cuando
  // chargeMaintenance es true.
  maintenanceFrequency: MaintenanceFrequency;
  // Defaults gym-level que se usan SÓLO al crear planes nuevos. En
  // edición prevalece el valor del plan existente.
  defaultEnrollmentAmount: number;
  defaultMaintenanceAmount: number;
  onSubmit(input: UpsertMembershipTypeInput): void;
  onCancel(): void;
  serverError?: string | null;
}

// Form de tipos de membresía.
//
// Duración: la intención del dueño (¿período de calendario o días
// literales?) se captura EXPLÍCITAMENTE — cada preset declara sus
// `months` (mensual=1, anual=12, …) y el modo personalizado pide
// cantidad + unidad. Nunca se infiere la unidad del número: "30 días"
// y "1 mes" son planes distintos y el backend calcula el vencimiento
// distinto (días corridos vs mismo día del mes siguiente).
//
// Inscripción y mantenimiento son decisiones a NIVEL GYM — los toggles
// + montos viven en la página de "Membresías", no en este modal. Cada
// plan que se crea o edita hereda los montos del gym (gym-level es la
// fuente de verdad). El form NO los muestra ni permite override per-plan
// porque la simplicidad para el segmento (whatsapp-level) gana sobre
// flexibilidad de cobrar diferente por plan.
//
// Para planes históricos con un monto ≠ del gym-default: al editar y
// guardar, el plan adopta el monto actual del gym. Si el dueño quiere
// preservar el monto viejo, no debe presionar "Guardar cambios" — o
// alineamos el gym-default antes de editar.
export function MembershipTypeForm({
  initial,
  submitting,
  chargeEnrollment,
  chargeMaintenance,
  maintenanceFrequency,
  defaultEnrollmentAmount,
  defaultMaintenanceAmount,
  onSubmit,
  onCancel,
  serverError,
}: Props) {
  const [form, setForm] = useState<FormState>(() => fromInitial(initial));
  const [error, setError] = useState<string | null>(null);

  const inCustomMode = form.duration_select === CUSTOM;

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const name = form.name.trim();
    if (name.length < 3 || name.length > 100) {
      setError(t.types.form.errors.nameLength);
      return;
    }
    const price = parseFloat(form.price);
    if (!Number.isFinite(price) || price <= 0) {
      setError(t.types.form.errors.priceRequired);
      return;
    }

    let durationDays: number;
    let durationMonths: number | null;
    if (inCustomMode) {
      const n = parseInt(form.custom_count, 10);
      if (!Number.isFinite(n) || n < 1) {
        setError(t.types.form.errors.durationCustomInvalid);
        return;
      }
      // La unidad la eligió el dueño — días van como días literales,
      // meses/años como períodos de calendario (duration_months manda
      // en el backend; duration_days acompaña como aproximado legacy).
      switch (form.custom_unit) {
        case "days":
          durationDays = n;
          durationMonths = null;
          break;
        case "months":
          durationDays = monthsToApproxDays(n);
          durationMonths = n;
          break;
        case "years":
          durationDays = n * 365;
          durationMonths = n * 12;
          break;
      }
      // Espeja chk_membership_types_duration_months (1..60) para que el
      // dueño vea un mensaje claro en lugar del error genérico del BE.
      if (durationMonths != null && durationMonths > 60) {
        setError(t.types.form.errors.durationCustomTooLong);
        return;
      }
    } else {
      const opt = t.types.form.durationOptions.find(
        (o) => String(o.days) === form.duration_select,
      );
      if (!opt) {
        setError(t.types.form.errors.durationRequired);
        return;
      }
      durationDays = opt.days;
      durationMonths = opt.months;
    }

    // Inscripción y mantenimiento vienen 100% del gym-level. Si la
    // feature está apagada → 0. Si prendida → el monto del gym.
    const enrollment = chargeEnrollment ? defaultEnrollmentAmount : 0;
    const maintenance = chargeMaintenance ? defaultMaintenanceAmount : 0;

    // maintenance_frequency: undefined cuando no hay monto (SQLite CHECK
    // acepta NULL); en otro caso, la frecuencia del gym.
    const freq: MaintenanceFrequency | undefined =
      maintenance > 0 ? maintenanceFrequency : undefined;

    onSubmit({
      name,
      price,
      duration_days: durationDays,
      duration_months: durationMonths,
      enrollment_fee: enrollment,
      maintenance_fee: maintenance,
      maintenance_frequency: freq,
    });
  }

  // Cuando el dueño elige "Personalizada" arrancamos el input vacío
  // (o con el valor histórico del plan, manejado en fromInitial).
  function onDurationChange(v: string) {
    setForm((f) => ({
      ...f,
      duration_select: v,
      custom_count: v === CUSTOM ? f.custom_count : "",
    }));
  }

  const triggerLabel = useMemo(() => {
    if (inCustomMode) return t.types.form.durationCustom;
    const opt = t.types.form.durationOptions.find(
      (o) => String(o.days) === form.duration_select,
    );
    return opt?.label;
  }, [form.duration_select, inCustomMode]);

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {(error || serverError) && (
        <Alert variant="destructive">
          <AlertDescription>{error || serverError}</AlertDescription>
        </Alert>
      )}

      {initial && (
        <p className="text-xs text-muted-foreground">{t.types.form.changesNotApplied}</p>
      )}

      <div className="space-y-2">
        <Label htmlFor="mt-name">{t.types.form.name} *</Label>
        <Input
          id="mt-name"
          value={form.name}
          onChange={(e) => setForm({ ...form, name: e.target.value })}
          autoFocus
        />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="mt-price">{t.types.form.price} *</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="mt-price"
              inputMode="decimal"
              className="pl-7"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })}
            />
          </div>
        </div>
        <div className="space-y-2">
          <Label htmlFor="mt-duration">{t.types.form.durationDays} *</Label>
          <Select value={form.duration_select} onValueChange={onDurationChange}>
            <SelectTrigger id="mt-duration">
              <SelectValue>{triggerLabel}</SelectValue>
            </SelectTrigger>
            <SelectContent>
              {t.types.form.durationOptions.map((opt) => (
                <SelectItem key={opt.days} value={String(opt.days)}>
                  {opt.label}
                </SelectItem>
              ))}
              <SelectItem value={CUSTOM}>{t.types.form.durationCustom}</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>

      {inCustomMode && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2">
              <Label htmlFor="mt-duration-custom">{t.types.form.durationCustomCount} *</Label>
              <Input
                id="mt-duration-custom"
                inputMode="numeric"
                placeholder="Ej. 45"
                value={form.custom_count}
                onChange={(e) =>
                  setForm({ ...form, custom_count: e.target.value.replace(/\D/g, "") })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="mt-duration-unit">{t.types.form.durationCustomUnit} *</Label>
              <Select
                value={form.custom_unit}
                onValueChange={(v) => setForm({ ...form, custom_unit: v as CustomUnit })}
              >
                <SelectTrigger id="mt-duration-unit">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="days">{t.types.form.durationUnitDays}</SelectItem>
                  <SelectItem value="months">{t.types.form.durationUnitMonths}</SelectItem>
                  <SelectItem value="years">{t.types.form.durationUnitYears}</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.types.form.durationCustomHint(form.custom_unit)}
          </p>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {t.types.form.cancel}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {initial ? t.types.form.submitEdit : t.types.form.submitNew}
        </Button>
      </div>
    </form>
  );
}
