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

interface FormState {
  name: string;
  price: string;
  duration_days: string;       // valor "vivo" del select (preset o CUSTOM)
  duration_custom: string;     // input numérico cuando el modo es CUSTOM
}

function presetMatches(days: number): boolean {
  return t.types.form.durationOptions.some((opt) => opt.days === days);
}

function fromInitial(p: MembershipType | undefined): FormState {
  // Si la duración del plan editado no coincide con ningún preset
  // (e.g. una membresía importada con 45 días), arrancamos en modo
  // custom para que el dueño vea su valor en el input numérico.
  const isCustom = !!(p && !presetMatches(p.duration_days));
  return {
    name: p?.name ?? "",
    price: p ? String(p.price) : "",
    duration_days: isCustom ? CUSTOM : p ? String(p.duration_days) : "30",
    duration_custom: isCustom ? String(p?.duration_days ?? "") : "",
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

  const inCustomMode = form.duration_days === CUSTOM;

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

    let duration: number;
    if (inCustomMode) {
      duration = parseInt(form.duration_custom, 10);
      if (!Number.isFinite(duration) || duration < 1) {
        setError(t.types.form.errors.durationCustomInvalid);
        return;
      }
    } else {
      duration = parseInt(form.duration_days, 10);
      if (!Number.isFinite(duration) || duration < 1) {
        setError(t.types.form.errors.durationRequired);
        return;
      }
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
      duration_days: duration,
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
      duration_days: v,
      duration_custom: v === CUSTOM ? f.duration_custom : "",
    }));
  }

  const triggerLabel = useMemo(() => {
    if (inCustomMode) return t.types.form.durationCustom;
    const opt = t.types.form.durationOptions.find(
      (o) => String(o.days) === form.duration_days,
    );
    return opt?.label;
  }, [form.duration_days, inCustomMode]);

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
          <Select value={form.duration_days} onValueChange={onDurationChange}>
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
          <Label htmlFor="mt-duration-custom">{t.types.form.durationCustomLabel} *</Label>
          <Input
            id="mt-duration-custom"
            inputMode="numeric"
            placeholder="Ej. 45"
            value={form.duration_custom}
            onChange={(e) =>
              setForm({ ...form, duration_custom: e.target.value.replace(/\D/g, "") })
            }
          />
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
