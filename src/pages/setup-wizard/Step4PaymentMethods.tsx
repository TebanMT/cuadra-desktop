import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { WizardLayout } from "./WizardLayout";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { useSetupWizardStore } from "@/stores/useSetupWizardStore";
import { api } from "@/lib/api";
import { wizard } from "@/strings/wizard";

const OPTIONS = [
  { key: "cash", label: wizard.step4.cash },
  { key: "transfer", label: wizard.step4.transfer },
  { key: "card", label: wizard.step4.card },
] as const;

export default function Step4PaymentMethods() {
  const navigate = useNavigate();
  const store = useSetupWizardStore();
  const [methods, setMethods] = useState(store.paymentMethods);

  useEffect(() => {
    store.setStep(4);
  }, []);

  const m = useMutation({
    mutationFn: (input: typeof methods) =>
      api.patch("/api/v1/gyms/me/payment-methods", {
        methods: Object.entries(input).filter(([, v]) => v).map(([k]) => k),
      }),
  });

  async function onContinue() {
    try {
      await m.mutateAsync(methods);
      store.setPaymentMethods(methods);
      navigate("/setup/step-5");
    } catch {
      // toast handled globally
    }
  }

  return (
    <WizardLayout step={4} title={wizard.step4.title} subtitle={wizard.step4.subtitle}>
      <div className="space-y-3">
        {OPTIONS.map((o) => (
          <label
            key={o.key}
            className="flex items-center gap-4 rounded-lg border p-4 cursor-pointer hover:bg-accent"
          >
            <Checkbox
              checked={methods[o.key]}
              onCheckedChange={(v) => setMethods({ ...methods, [o.key]: !!v })}
            />
            <span className="text-base font-medium">{o.label}</span>
          </label>
        ))}
      </div>

      <div className="mt-8">
        <Button size="lg" className="w-full" onClick={onContinue} disabled={m.isPending}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : wizard.continue}
        </Button>
      </div>
    </WizardLayout>
  );
}
