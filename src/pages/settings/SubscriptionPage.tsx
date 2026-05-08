import { useState } from "react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { toast } from "sonner";
import {
  AlertCircle,
  CalendarDays,
  CreditCard,
  ExternalLink,
  Loader2,
  MessageCircle,
  ShieldCheck,
  Sparkles,
} from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { StatCard } from "@/components/shared/StatCard";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableTh,
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/components/shared/PagePrimitives";
import {
  useStartCheckout,
  useSubscription,
  type CheckoutProvider,
  type SubscriptionEvent,
} from "@/hooks/useSubscription";
import { fmtMoney } from "@/hooks/useBilling";
import { useAuthStore } from "@/stores/useAuthStore";
import { fmtDate } from "@/lib/dates";

const SUPPORT_WHATSAPP_URL = "https://wa.me/525555555555";

type PlanLabel = "Trial" | "Standard" | "Plus" | "—";

function planLabel(plan: string | undefined): PlanLabel {
  if (!plan) return "—";
  if (plan === "trial") return "Trial";
  if (plan === "pro_annual") return "Plus";
  if (plan === "pro_monthly") return "Standard";
  // Fallback for unknown future plan strings — capitalise first letter.
  return (plan.charAt(0).toUpperCase() + plan.slice(1)) as PlanLabel;
}

function eventTypeLabel(type: SubscriptionEvent["type"]): string {
  switch (type) {
    case "activated":
      return "Activación";
    case "renewed":
      return "Renovación";
    case "past_due":
      return "Falla";
    case "cancelled":
      return "Cancelación";
    case "trial_extended":
      return "Trial extendido";
    default:
      return type;
  }
}

function providerLabel(provider: SubscriptionEvent["provider"]): string {
  switch (provider) {
    case "stripe":
      return "Stripe";
    case "mercadopago":
      return "Mercado Pago";
    case "manual":
      return "Manual";
    default:
      return provider;
  }
}

function statusLabel(status: string | undefined): string {
  if (status === "past_due") return "Período de gracia";
  if (status === "cancelled") return "Vencido";
  return "Activo";
}

type CheckoutPlan = "pro_monthly" | "pro_annual";

const PLAN_PRICE_MXN: Record<CheckoutPlan, number> = {
  pro_monthly: 799,
  pro_annual: 1599,
};

const PLAN_DISPLAY: Record<CheckoutPlan, { name: string; tagline: string }> = {
  pro_monthly: { name: "Standard", tagline: "Lo esencial para operar tu gym" },
  pro_annual: { name: "Plus", tagline: "Multi-sucursal y reportes avanzados" },
};

export default function SubscriptionPage() {
  const gym = useAuthStore((s) => s.gym);
  const sub = useSubscription();
  const startCheckout = useStartCheckout();
  const [activateOpen, setActivateOpen] = useState(false);
  const [selectedPlan, setSelectedPlan] = useState<CheckoutPlan>("pro_monthly");
  const [selectedProvider, setSelectedProvider] =
    useState<CheckoutProvider>("stripe");

  const plan = gym?.subscription_plan;
  const status = gym?.subscription_status;
  const isTrial = plan === "trial";
  const isPastDue = status === "past_due";

  async function handleActivate() {
    try {
      const result = await startCheckout.mutateAsync({
        provider: selectedProvider,
        plan: selectedPlan,
      });
      // Tauri's shell.open routes to the user's default browser. We do *not*
      // navigate inside the desktop app — Stripe / MP block embedded webviews
      // and the browser keeps password-manager autofill working.
      await openExternal(result.url);
      setActivateOpen(false);
      toast.success("Abrimos el pago en tu navegador.", {
        description:
          "Cuando termines, regresa aquí; tu plan se actualiza automáticamente.",
      });
    } catch (err: unknown) {
      const msg =
        err instanceof Error
          ? err.message
          : "No pudimos iniciar el pago. Intenta de nuevo.";
      toast.error(msg);
    }
  }

  const nextChargeIso =
    sub.data?.period_ends_at ?? gym?.subscription_ends_at ?? gym?.trial_ends_at ?? null;

  const history: SubscriptionEvent[] = sub.data?.history ?? [];

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <PageHeader
        title="Suscripción"
        subtitle="Tu plan, próximos cobros y recibos."
      />

      {sub.isLoading && (
        <div className="flex items-center justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {sub.error && (
        <Alert variant="destructive">
          <AlertDescription>
            No pudimos cargar tu suscripción. Intenta de nuevo en unos segundos.
          </AlertDescription>
        </Alert>
      )}

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title="Plan actual"
          value={planLabel(plan)}
          tone={isTrial ? "warning" : "primary"}
          icon={Sparkles}
          hint={isTrial ? "Prueba de 14 días" : undefined}
        />
        <StatCard
          title="Estado"
          value={statusLabel(status)}
          tone={isPastDue ? "warning" : status === "cancelled" ? "danger" : "success"}
          icon={ShieldCheck}
        />
        <StatCard
          title="Próximo cobro"
          value={fmtDate(nextChargeIso)}
          tone="neutral"
          icon={CalendarDays}
          hint={isTrial && nextChargeIso ? "Fin del periodo de prueba" : undefined}
        />
      </div>

      {isTrial && (
        <Alert>
          <Sparkles className="h-4 w-4" />
          <AlertTitle>Estás en periodo de prueba</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>
              Activa tu plan para seguir usando Tinta cuando termine la prueba.
            </span>
            <Button
              size="sm"
              variant="default"
              onClick={() => setActivateOpen(true)}
              className="shrink-0"
            >
              Activar plan ahora
            </Button>
          </AlertDescription>
        </Alert>
      )}

      {isPastDue && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>No pudimos cobrar el último intento</AlertTitle>
          <AlertDescription className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <span>Actualiza tu método de pago para no perder acceso.</span>
            <Button asChild size="sm" variant="default" className="shrink-0">
              <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
                <MessageCircle className="mr-1.5 h-4 w-4" />
                Hablar por WhatsApp
              </a>
            </Button>
          </AlertDescription>
        </Alert>
      )}

      <SectionCard
        title="Historial de pagos"
        description="Movimientos de tu suscripción procesados por Stripe o Mercado Pago."
        flush
      >
        {history.length === 0 ? (
          <EmptyState
            icon={<CreditCard className="h-5 w-5" />}
            title="Aún no hay movimientos."
            hint="Cuando actives tu plan aparecerán aquí."
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh>Fecha</DataTableTh>
              <DataTableTh>Tipo</DataTableTh>
              <DataTableTh className="text-right">Monto</DataTableTh>
              <DataTableTh>Método</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {history.map((ev) => (
                <DataTableRow key={ev.id}>
                  <DataTableCell>{fmtDate(ev.occurred_at)}</DataTableCell>
                  <DataTableCell>{eventTypeLabel(ev.type)}</DataTableCell>
                  <DataTableCell className="text-right tabular">
                    {typeof ev.amount === "number" ? fmtMoney(ev.amount) : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-muted-foreground">
                    {providerLabel(ev.provider)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>

      <SectionCard title="Facturación">
        <p className="text-sm text-muted-foreground">
          Procesamos los cobros con Stripe / Mercado Pago. Si tienes preguntas
          sobre un cargo, escríbenos por WhatsApp.
        </p>
        <div className="mt-4">
          <Button asChild variant="outline">
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Hablar por WhatsApp
            </a>
          </Button>
        </div>
      </SectionCard>

      <Dialog open={activateOpen} onOpenChange={setActivateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Activar plan</DialogTitle>
            <DialogDescription>
              Elige tu plan y método de pago. Te llevamos al sitio seguro
              del procesador para terminar el cobro.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-5 py-2">
            <div>
              <Label className="mb-2 block text-sm font-medium">Plan</Label>
              <RadioGroup
                value={selectedPlan}
                onValueChange={(v) => setSelectedPlan(v as CheckoutPlan)}
                className="gap-2"
              >
                {(Object.keys(PLAN_DISPLAY) as CheckoutPlan[]).map((key) => {
                  const display = PLAN_DISPLAY[key];
                  return (
                    <label
                      key={key}
                      htmlFor={`plan-${key}`}
                      className="flex cursor-pointer items-center justify-between gap-3 rounded-md border bg-card p-3 hover:border-primary"
                    >
                      <div className="flex items-center gap-3">
                        <RadioGroupItem id={`plan-${key}`} value={key} />
                        <div>
                          <div className="font-medium">{display.name}</div>
                          <div className="text-xs text-muted-foreground">
                            {display.tagline}
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">
                          {fmtMoney(PLAN_PRICE_MXN[key])}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          / mes
                        </div>
                      </div>
                    </label>
                  );
                })}
              </RadioGroup>
            </div>

            <div>
              <Label className="mb-2 block text-sm font-medium">
                Método de pago
              </Label>
              <RadioGroup
                value={selectedProvider}
                onValueChange={(v) =>
                  setSelectedProvider(v as CheckoutProvider)
                }
                className="grid grid-cols-2 gap-2"
              >
                <label
                  htmlFor="prov-stripe"
                  className="flex cursor-pointer items-center gap-2 rounded-md border bg-card p-3 hover:border-primary"
                >
                  <RadioGroupItem id="prov-stripe" value="stripe" />
                  <span className="text-sm">Tarjeta (Stripe)</span>
                </label>
                <label
                  htmlFor="prov-mp"
                  className="flex cursor-pointer items-center gap-2 rounded-md border bg-card p-3 hover:border-primary"
                >
                  <RadioGroupItem id="prov-mp" value="mercadopago" />
                  <span className="text-sm">Mercado Pago</span>
                </label>
              </RadioGroup>
            </div>
          </div>

          <DialogFooter>
            <Button
              variant="ghost"
              onClick={() => setActivateOpen(false)}
              disabled={startCheckout.isPending}
            >
              Cancelar
            </Button>
            <Button
              onClick={handleActivate}
              disabled={startCheckout.isPending}
            >
              {startCheckout.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : (
                <ExternalLink className="mr-2 h-4 w-4" />
              )}
              Continuar al pago
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
