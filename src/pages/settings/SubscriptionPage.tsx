import { openExternalUrl } from "@/lib/openExternal";
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
  useSubscription,
  type SubscriptionEvent,
} from "@/hooks/useSubscription";
import { fmtMoney } from "@/hooks/useBilling";
import { useAuthStore } from "@/stores/useAuthStore";
import { fmtDate } from "@/lib/dates";

const SUPPORT_WHATSAPP_URL = "https://wa.me/524461057446";

// El flujo de activación / cambio de plan vive end-to-end en el dashboard
// cloud (entinta.app). Razones:
//   - Stripe / Mercado Pago corren en browser por construcción (los webviews
//     embebidos los bloquean), así que el desktop ya tendría que sacar al
//     dueño al browser para terminar el cobro.
//   - Centralizar billing en el dashboard significa que tarjeta + dirección
//     fiscal + recibos viven en un solo lugar — menos contextos para que el
//     dueño se confunda.
//   - El sidecar no necesita proxy de checkout, refresh de tokens cloud,
//     manejo de errores de red para una acción que SIEMPRE requiere internet.
const DASHBOARD_BILLING_URL = "https://entinta.app/settings/subscription";
const DASHBOARD_HISTORY_URL = "https://entinta.app/settings/subscription#history";

type PlanLabel = "Standard" | "Plus" | "—";

// planLabel devuelve el TIER al que el dueño tiene acceso hoy. Trial =
// Standard (la prueba habilita features Standard). El flag isTrial separado
// se usa para colorear y mostrar el sub-texto "en prueba".
function planLabel(plan: string | undefined): PlanLabel {
  if (!plan) return "—";
  if (plan === "plus_monthly" || plan === "plus_annual") return "Plus";
  // trial + standard_monthly/annual + cualquier valor desconocido caen a
  // Standard: hoy es el único tier vendible, y el trial habilita Standard.
  return "Standard";
}

// daysUntil cuenta días enteros (truncados hacia arriba) hasta la fecha
// ISO dada. Devuelve null si no hay fecha. Negativo si ya pasó.
function daysUntil(iso: string | null | undefined): number | null {
  if (!iso) return null;
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return null;
  return Math.ceil((t - Date.now()) / (24 * 60 * 60 * 1000));
}

// trialHint compone "En prueba — X días restantes" / "Tu prueba terminó hoy"
// con concordancia singular/plural y caso límite negativos.
function trialHint(daysLeft: number | null): string {
  if (daysLeft == null) return "En prueba de 30 días";
  if (daysLeft <= 0) return "Tu prueba terminó";
  if (daysLeft === 1) return "En prueba — queda 1 día";
  return `En prueba — quedan ${daysLeft} días`;
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

// openInBrowser abre la URL en el navegador del sistema vía Tauri shell.
// Si falla (capability mal configurada, Tauri no bootstrapped en tests),
// loguea + intenta copiar la URL al portapapeles + muestra toast con la
// URL para que el dueño la abra a mano. Históricamente esto fallaba en
// silencio porque el catch comía el error y el botón parecía no responder.
async function openInBrowser(url: string) {
  // openExternalUrl prueba Tauri shell.open y luego window.open (cubre el
  // navegador en `npm run dev`). Sólo si AMBOS fallan caemos a copiar el link.
  if (await openExternalUrl(url)) return;
  try {
    await navigator.clipboard.writeText(url);
    toast.error("No pudimos abrir el navegador. Copiamos el link, pégalo en tu navegador.", {
      description: url,
      duration: 8000,
    });
  } catch {
    toast.error("Abre este link en tu navegador:", {
      description: url,
      duration: 12000,
    });
  }
}

async function openDashboardBilling() {
  await openInBrowser(DASHBOARD_BILLING_URL);
}

export default function SubscriptionPage() {
  const gym = useAuthStore((s) => s.gym);
  const sub = useSubscription();

  // Plan / status efectivos: priorizamos la respuesta fresca de /subscriptions/me
  // sobre el snapshot del auth store (que puede quedarse atrás si el cloud
  // acabó de procesar un webhook).
  const plan = sub.data?.plan ?? gym?.subscription_plan;
  const status = sub.data?.status ?? gym?.subscription_status;
  const isTrial = plan === "trial";
  const isPastDue = status === "past_due";

  // Trial: usamos trial_ends_at del API (autoritativo). Standard pagado:
  // period_ends_at = próxima renovación. Fallback al gym snapshot por si
  // /subscriptions/me viene null en el primer render.
  const trialEndsIso = sub.data?.trial_ends_at ?? gym?.trial_ends_at ?? null;
  const periodEndsIso = sub.data?.period_ends_at ?? gym?.subscription_ends_at ?? null;
  const nextChargeIso = isTrial ? trialEndsIso : periodEndsIso;
  const trialDaysLeft = isTrial ? daysUntil(trialEndsIso) : null;

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
          tone={isTrial ? "warning" : "accent"}
          icon={Sparkles}
          hint={isTrial ? trialHint(trialDaysLeft) : undefined}
        />
        <StatCard
          title="Estado"
          value={statusLabel(status)}
          tone={isPastDue ? "warning" : status === "cancelled" ? "danger" : "success"}
          icon={ShieldCheck}
        />
        <StatCard
          title={isTrial ? "Fin de la prueba" : "Próximo cobro"}
          value={fmtDate(nextChargeIso)}
          tone="neutral"
          icon={CalendarDays}
          hint={isTrial && nextChargeIso ? "Activa antes para no perder cobros" : undefined}
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
              onClick={openDashboardBilling}
              className="shrink-0"
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Activar en el dashboard
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
            <Button
              size="sm"
              variant="default"
              onClick={openDashboardBilling}
              className="shrink-0"
            >
              <ExternalLink className="mr-1.5 h-4 w-4" />
              Actualizar pago
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
            title="Sin movimientos todavía."
            hint="Cuando actives tu plan los cobros aparecerán aquí. Para detalle completo (recibos, métodos guardados) abre tu dashboard."
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
        {history.length > 0 && (
          <div className="flex justify-end pt-3 px-4 pb-3">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => openInBrowser(DASHBOARD_HISTORY_URL)}
            >
              <ExternalLink className="mr-1.5 h-3.5 w-3.5" />
              Ver recibos en el dashboard
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Facturación">
        <p className="text-sm text-muted-foreground">
          Procesamos los cobros con Stripe / Mercado Pago. Para cambiar tu plan,
          actualizar tarjeta o descargar recibos abre tu dashboard. Si tienes
          dudas sobre un cargo escríbenos por WhatsApp.
        </p>
        <div className="mt-4 flex flex-wrap gap-2">
          <Button onClick={openDashboardBilling}>
            <ExternalLink className="mr-2 h-4 w-4" />
            Abrir dashboard de facturación
          </Button>
          <Button asChild variant="outline">
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
              <MessageCircle className="mr-2 h-4 w-4" />
              Hablar por WhatsApp
            </a>
          </Button>
        </div>
      </SectionCard>
    </div>
  );
}
