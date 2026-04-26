import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { WizardLayout } from "./WizardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { Card, CardContent } from "@/components/ui/card";
import { useSetupWizardStore, type DraftMembershipType } from "@/stores/useSetupWizardStore";
import { api } from "@/lib/api";
import { wizard } from "@/strings/wizard";
import { formatMoney } from "@/lib/utils";

const DURATIONS = wizard.step3.durationOptions;

interface DraftForm {
  name: string;
  price: string;
  durationKey: string;
  customCount: string;
  customUnit: "days" | "weeks" | "months" | "years";
  enrollment: boolean;
  enrollmentAmount: string;
  maintenance: boolean;
  maintenanceAmount: string;
  maintenanceFreq: string;
}

const empty: DraftForm = {
  name: "",
  price: "",
  durationKey: "1m",
  customCount: "1",
  customUnit: "months",
  enrollment: false,
  enrollmentAmount: "",
  maintenance: false,
  maintenanceAmount: "",
  maintenanceFreq: "12",
};

function durationDays(form: DraftForm): number {
  const opt = DURATIONS.find((o) => o.value === form.durationKey);
  if (!opt || opt.value !== "custom") return opt?.days ?? 0;
  const n = parseInt(form.customCount, 10) || 0;
  const mult = { days: 1, weeks: 7, months: 30, years: 365 }[form.customUnit];
  return n * mult;
}

export default function Step3FirstPlan() {
  const navigate = useNavigate();
  const store = useSetupWizardStore();
  const [form, setForm] = useState<DraftForm>(empty);
  const [error, setError] = useState<string | null>(null);
  const [showSuggestions, setShowSuggestions] = useState(false);

  useEffect(() => {
    store.setStep(3);
  }, []);

  const m = useMutation({
    mutationFn: (input: DraftMembershipType) => api.post("/api/v1/membership-types", input),
  });

  function buildDraft(f: DraftForm): DraftMembershipType | string {
    if (!f.name.trim()) return wizard.errors.fieldRequired("nombre");
    const price = parseFloat(f.price);
    if (!price || price <= 0) return wizard.errors.pricePositive;
    const days = durationDays(f);
    if (days < 1) return wizard.errors.durationPositive;
    return {
      name: f.name.trim(),
      price,
      duration_days: days,
      enrollment_fee: f.enrollment ? parseFloat(f.enrollmentAmount) || 0 : 0,
      maintenance_fee: f.maintenance ? parseFloat(f.maintenanceAmount) || 0 : 0,
      maintenance_frequency: f.maintenance ? parseInt(f.maintenanceFreq, 10) || null : null,
    };
  }

  async function persist(d: DraftMembershipType) {
    await m.mutateAsync(d);
    store.addMembershipType(d);
  }

  async function handleSaveAndAddAnother(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const built = buildDraft(form);
    if (typeof built === "string") return setError(built);
    try {
      await persist(built);
      setForm(empty);
    } catch {
      setError("No pudimos guardar. Vuelve a intentar.");
    }
  }

  async function handleSaveAndContinue(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const totalSaved = store.membershipTypes.length;
    const formHasContent = form.name.trim() || form.price.trim();

    if (!formHasContent && totalSaved === 0) {
      setShowSuggestions(true);
      return;
    }

    if (formHasContent) {
      const built = buildDraft(form);
      if (typeof built === "string") return setError(built);
      try {
        await persist(built);
      } catch {
        setError("No pudimos guardar. Vuelve a intentar.");
        return;
      }
    }
    navigate("/setup/step-4");
  }

  async function applySuggestions() {
    setError(null);
    try {
      for (const sug of wizard.defaultSuggestions) {
        const built: DraftMembershipType = {
          name: sug.name,
          price: sug.price,
          duration_days: sug.duration_days,
          enrollment_fee: 0,
          maintenance_fee: 0,
          maintenance_frequency: null,
        };
        await persist(built);
      }
      navigate("/setup/step-4");
    } catch {
      setError("No pudimos crear los planes sugeridos.");
    }
  }

  const showCustom = form.durationKey === "custom";

  return (
    <WizardLayout step={3} title={wizard.step3.title} subtitle={wizard.step3.subtitle}>
      {store.membershipTypes.length > 0 && (
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="text-sm font-medium mb-2">Ya agregados:</div>
            <ul className="space-y-1 text-sm">
              {store.membershipTypes.map((mt, i) => (
                <li key={i} className="flex justify-between">
                  <span>{mt.name}</span>
                  <span className="text-muted-foreground">
                    {formatMoney(mt.price)} · {mt.duration_days} días
                  </span>
                </li>
              ))}
            </ul>
          </CardContent>
        </Card>
      )}

      <form className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="plan-name">{wizard.step3.nameLabel}</Label>
          <Input
            id="plan-name"
            placeholder={wizard.step3.namePlaceholder}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="price">{wizard.step3.priceLabel}</Label>
          <div className="relative">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
            <Input
              id="price"
              inputMode="decimal"
              className="pl-7"
              value={form.price}
              onChange={(e) => setForm({ ...form, price: e.target.value.replace(/[^\d.]/g, "") })}
              placeholder="500"
            />
          </div>
        </div>

        <div className="space-y-3">
          <Label>{wizard.step3.durationLabel}</Label>
          <RadioGroup value={form.durationKey} onValueChange={(v) => setForm({ ...form, durationKey: v })}>
            {DURATIONS.map((d) => (
              <label key={d.value} className="flex items-center gap-3 cursor-pointer">
                <RadioGroupItem value={d.value} id={`dur-${d.value}`} />
                <span>{d.label}</span>
              </label>
            ))}
          </RadioGroup>
          {showCustom && (
            <div className="grid grid-cols-2 gap-3 pl-8">
              <div className="space-y-1.5">
                <Label htmlFor="custom-count">{wizard.step3.customCount}</Label>
                <Input
                  id="custom-count"
                  inputMode="numeric"
                  value={form.customCount}
                  onChange={(e) => setForm({ ...form, customCount: e.target.value.replace(/\D/g, "") })}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="custom-unit">{wizard.step3.customUnit}</Label>
                <select
                  id="custom-unit"
                  value={form.customUnit}
                  onChange={(e) => setForm({ ...form, customUnit: e.target.value as any })}
                  className="flex h-11 w-full rounded-md border border-input bg-background px-3 text-base"
                >
                  <option value="days">Días</option>
                  <option value="weeks">Semanas</option>
                  <option value="months">Meses</option>
                  <option value="years">Años</option>
                </select>
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="font-medium">{wizard.step3.enrollmentToggle}</span>
            <Switch
              checked={form.enrollment}
              onCheckedChange={(v) => setForm({ ...form, enrollment: !!v })}
            />
          </label>
          {form.enrollment && (
            <div className="space-y-2">
              <Label htmlFor="enrollment-amount">{wizard.step3.enrollmentLabel}</Label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                <Input
                  id="enrollment-amount"
                  inputMode="decimal"
                  className="pl-7"
                  value={form.enrollmentAmount}
                  onChange={(e) =>
                    setForm({ ...form, enrollmentAmount: e.target.value.replace(/[^\d.]/g, "") })
                  }
                />
              </div>
            </div>
          )}
        </div>

        <div className="space-y-3 rounded-lg border p-4">
          <label className="flex items-center justify-between cursor-pointer">
            <span className="font-medium">{wizard.step3.maintenanceToggle}</span>
            <Switch
              checked={form.maintenance}
              onCheckedChange={(v) => setForm({ ...form, maintenance: !!v })}
            />
          </label>
          {form.maintenance && (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label htmlFor="maint-amount">{wizard.step3.maintenanceLabel}</Label>
                <div className="relative">
                  <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">$</span>
                  <Input
                    id="maint-amount"
                    inputMode="decimal"
                    className="pl-7"
                    value={form.maintenanceAmount}
                    onChange={(e) =>
                      setForm({ ...form, maintenanceAmount: e.target.value.replace(/[^\d.]/g, "") })
                    }
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="maint-freq">{wizard.step3.maintenanceFreq}</Label>
                <Input
                  id="maint-freq"
                  inputMode="numeric"
                  value={form.maintenanceFreq}
                  onChange={(e) => setForm({ ...form, maintenanceFreq: e.target.value.replace(/\D/g, "") })}
                />
              </div>
            </div>
          )}
        </div>

        {showSuggestions && (
          <Card className="border-primary/30 bg-primary/5">
            <CardContent className="pt-6 space-y-4">
              <div>
                <div className="font-semibold">{wizard.step3.suggestionsTitle}</div>
                <div className="text-sm text-muted-foreground">{wizard.step3.suggestionsBody}</div>
              </div>
              <ul className="space-y-1 text-sm">
                {wizard.defaultSuggestions.map((s) => (
                  <li key={s.name} className="flex justify-between">
                    <span>
                      {s.name} — {s.duration_days === 1 ? "1 visita" : `${s.duration_days} días`}
                    </span>
                    <span className="text-muted-foreground">{formatMoney(s.price)}</span>
                  </li>
                ))}
              </ul>
              <Button type="button" onClick={applySuggestions} disabled={m.isPending} className="w-full">
                {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : wizard.step3.useSuggestions}
              </Button>
            </CardContent>
          </Card>
        )}

        <div className="flex flex-col gap-3 sm:flex-row">
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="flex-1"
            onClick={handleSaveAndAddAnother}
            disabled={m.isPending}
          >
            {wizard.step3.saveAndAddAnother}
          </Button>
          <Button
            type="button"
            size="lg"
            className="flex-1"
            onClick={handleSaveAndContinue}
            disabled={m.isPending}
          >
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : wizard.step3.saveAndContinue}
          </Button>
        </div>
      </form>
    </WizardLayout>
  );
}
