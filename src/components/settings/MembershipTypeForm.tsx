import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { members as t } from "@/strings/members";
import type { MembershipType, UpsertMembershipTypeInput } from "@/hooks/useMembershipTypes";

interface FormState {
  name: string;
  price: string;
  duration_days: string;
  enrollment: boolean;
  enrollment_amount: string;
  maintenance: boolean;
  maintenance_amount: string;
  maintenance_frequency: "monthly" | "annual";
}

function fromInitial(p?: MembershipType): FormState {
  return {
    name: p?.name ?? "",
    price: p ? String(p.price) : "",
    duration_days: p ? String(p.duration_days) : "30",
    enrollment: !!(p && p.enrollment_fee > 0),
    enrollment_amount: p && p.enrollment_fee > 0 ? String(p.enrollment_fee) : "",
    maintenance: !!(p && p.maintenance_fee > 0),
    maintenance_amount: p && p.maintenance_fee > 0 ? String(p.maintenance_fee) : "",
    maintenance_frequency: p?.maintenance_frequency ?? "monthly",
  };
}

interface Props {
  initial?: MembershipType;
  submitting: boolean;
  onSubmit(input: UpsertMembershipTypeInput): void;
  onCancel(): void;
  serverError?: string | null;
}

export function MembershipTypeForm({ initial, submitting, onSubmit, onCancel, serverError }: Props) {
  const [form, setForm] = useState<FormState>(fromInitial(initial));
  const [error, setError] = useState<string | null>(null);

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
    const duration = parseInt(form.duration_days, 10);
    if (!Number.isFinite(duration) || duration < 1) {
      setError(t.types.form.errors.durationRequired);
      return;
    }
    const enrollment = form.enrollment ? parseFloat(form.enrollment_amount) || 0 : 0;
    if (enrollment < 0) {
      setError(t.types.form.errors.enrollmentNegative);
      return;
    }
    const maintenance = form.maintenance ? parseFloat(form.maintenance_amount) || 0 : 0;
    if (maintenance < 0) {
      setError(t.types.form.errors.maintenanceNegative);
      return;
    }

    onSubmit({
      name,
      price,
      duration_days: duration,
      enrollment_fee: enrollment,
      maintenance_fee: maintenance,
      maintenance_frequency: maintenance > 0 ? form.maintenance_frequency : undefined,
    });
  }

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
          <Input
            id="mt-duration"
            inputMode="numeric"
            value={form.duration_days}
            onChange={(e) => setForm({ ...form, duration_days: e.target.value.replace(/\D/g, "") })}
          />
        </div>
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="font-medium">{t.types.form.enrollment}</span>
          <Switch
            checked={form.enrollment}
            onCheckedChange={(v) => setForm({ ...form, enrollment: !!v })}
          />
        </label>
        {form.enrollment && (
          <div className="space-y-2">
            <Label htmlFor="mt-enrollment">{t.types.form.enrollmentAmount}</Label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
              <Input
                id="mt-enrollment"
                inputMode="decimal"
                className="pl-7"
                value={form.enrollment_amount}
                onChange={(e) =>
                  setForm({ ...form, enrollment_amount: e.target.value.replace(/[^\d.]/g, "") })
                }
              />
            </div>
          </div>
        )}
      </div>

      <div className="space-y-3 rounded-lg border p-4">
        <label className="flex items-center justify-between cursor-pointer">
          <span className="font-medium">{t.types.form.maintenance}</span>
          <Switch
            checked={form.maintenance}
            onCheckedChange={(v) => setForm({ ...form, maintenance: !!v })}
          />
        </label>
        {form.maintenance && (
          <div className="space-y-3">
            <div className="space-y-2">
              <Label htmlFor="mt-maint">{t.types.form.maintenanceAmount}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="mt-maint"
                  inputMode="decimal"
                  className="pl-7"
                  value={form.maintenance_amount}
                  onChange={(e) =>
                    setForm({ ...form, maintenance_amount: e.target.value.replace(/[^\d.]/g, "") })
                  }
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>{t.types.form.maintenanceFreq}</Label>
              <RadioGroup
                value={form.maintenance_frequency}
                onValueChange={(v) => setForm({ ...form, maintenance_frequency: v as "monthly" | "annual" })}
                className="flex gap-4"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="monthly" id="freq-monthly" />
                  <span>{t.types.form.freqMonthly}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="annual" id="freq-annual" />
                  <span>{t.types.form.freqAnnual}</span>
                </label>
              </RadioGroup>
            </div>
          </div>
        )}
      </div>

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
