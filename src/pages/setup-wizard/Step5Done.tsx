import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { Check, Loader2, PartyPopper } from "lucide-react";
import { useMutation } from "@tanstack/react-query";
import { WizardLayout } from "./WizardLayout";
import { Button } from "@/components/ui/button";
import { useSetupWizardStore } from "@/stores/useSetupWizardStore";
import { useAuthStore } from "@/stores/useAuthStore";
import { api } from "@/lib/api";
import { wizard } from "@/strings/wizard";
import { formatMoney } from "@/lib/utils";

export default function Step5Done() {
  const navigate = useNavigate();
  const store = useSetupWizardStore();
  const setGym = useAuthStore((s) => s.setGym);
  const gym = useAuthStore((s) => s.gym);

  useEffect(() => {
    store.setStep(5);
  }, []);

  const m = useMutation({
    mutationFn: () => api.post("/api/v1/gyms/me/setup/complete", {}),
  });

  async function onFinish() {
    try {
      await m.mutateAsync();
      if (gym) setGym({ ...gym, setup_completed: true });
      store.reset();
      navigate("/", { replace: true });
    } catch {
      // toast handled globally
    }
  }

  const acceptedLabels = [
    store.paymentMethods.cash && "Efectivo",
    store.paymentMethods.transfer && "Transferencia",
    store.paymentMethods.card && "Tarjeta",
  ].filter(Boolean) as string[];

  return (
    <WizardLayout step={5}>
      <div className="text-center space-y-3">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-success/10 text-success">
          <PartyPopper className="h-8 w-8" />
        </div>
        <h1 className="text-3xl">{wizard.step5.title}</h1>
      </div>

      <div className="mt-10 rounded-lg border p-6 space-y-3">
        <div className="text-sm font-medium text-muted-foreground">{wizard.step5.summaryTitle}</div>
        <ul className="space-y-2">
          <SummaryItem text="Tu cuenta" />
          <SummaryItem text={store.gymName ? `${store.gymName}${store.city ? ` (${store.city})` : ""}` : "Datos del gym"} />
          <SummaryItem
            text={`${store.membershipTypes.length} ${
              store.membershipTypes.length === 1 ? "plan de membresía" : "planes de membresía"
            }`}
          />
          <SummaryItem text={`Aceptas: ${acceptedLabels.join(", ") || "—"}`} />
        </ul>

        {store.membershipTypes.length > 0 && (
          <div className="mt-4 pt-4 border-t space-y-1 text-sm text-muted-foreground">
            {store.membershipTypes.map((mt, i) => (
              <div key={i} className="flex justify-between">
                <span>{mt.name}</span>
                <span>
                  {formatMoney(mt.price)} · {mt.duration_days} días
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-8">
        <Button size="lg" className="w-full" onClick={onFinish} disabled={m.isPending}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : wizard.step5.cta}
        </Button>
      </div>
    </WizardLayout>
  );
}

function SummaryItem({ text }: { text: string }) {
  return (
    <li className="flex items-center gap-2">
      <Check className="h-5 w-5 text-success shrink-0" />
      <span>{text}</span>
    </li>
  );
}
