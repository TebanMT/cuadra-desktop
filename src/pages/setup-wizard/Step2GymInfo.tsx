import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { WizardLayout } from "./WizardLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { CityAutocomplete } from "@/components/shared/CityAutocomplete";
import { WhatsappInput, whatsappValid, whatsappNormalize } from "@/components/shared/WhatsappInput";
import { useSetupWizardStore } from "@/stores/useSetupWizardStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { api } from "@/lib/api";
import { wizard } from "@/strings/wizard";

export default function Step2GymInfo() {
  const navigate = useNavigate();
  const store = useSetupWizardStore();
  const setGym = useAuthStore((s) => s.setGym);
  const gym = useAuthStore((s) => s.gym);

  const [name, setName] = useState(store.gymName);
  const [city, setCity] = useState(store.city);
  const [whatsapp, setWhatsapp] = useState(store.whatsapp);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    store.setStep(2);
  }, []);

  const m = useMutation({
    mutationFn: (input: { name: string; city: string; whatsapp: string }) =>
      api.patch("/api/v1/gyms/me/setup", input),
  });

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (name.trim().length === 0 || name.length > 100) return setError(wizard.errors.nameLength);
    if (!city) return setError(wizard.errors.fieldRequired("ciudad"));
    if (!whatsappValid(whatsapp)) return setError(wizard.errors.whatsappFormat);
    const whatsappWire = whatsappNormalize(whatsapp);
    try {
      await m.mutateAsync({ name: name.trim(), city, whatsapp: whatsappWire });
      store.setGymInfo({ gymName: name.trim(), city, whatsapp });
      if (gym) setGym({ ...gym, name: name.trim() });
      navigate("/setup/step-3");
    } catch {
      setError("No pudimos guardar. Vuelve a intentar.");
    }
  }

  return (
    <WizardLayout step={2} title={wizard.step2.title}>
      <form onSubmit={onSubmit} className="space-y-6">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="gym-name">{wizard.step2.nameLabel}</Label>
          <Input
            id="gym-name"
            placeholder={wizard.step2.namePlaceholder}
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </div>

        <div className="space-y-2">
          <Label htmlFor="city">{wizard.step2.cityLabel}</Label>
          <CityAutocomplete id="city" value={city} onChange={setCity} placeholder={wizard.step2.cityPlaceholder} />
        </div>

        <div className="space-y-2">
          <Label htmlFor="whatsapp">{wizard.step2.whatsappLabel}</Label>
          <WhatsappInput id="whatsapp" value={whatsapp} onChange={setWhatsapp} />
          <p className="text-sm text-muted-foreground">{wizard.step2.whatsappHint}</p>
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={m.isPending}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : wizard.continue}
        </Button>
      </form>
    </WizardLayout>
  );
}
