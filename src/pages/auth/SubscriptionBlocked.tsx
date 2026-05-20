import { ExternalLink, Lock, MessageCircle } from "lucide-react";
import { open as openExternal } from "@tauri-apps/plugin-shell";
import { AuthShell } from "@/components/shared/AuthShell";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/useAuthStore";
import { fmtDate } from "@/lib/dates";

// SubscriptionBlocked — pantalla terminal cuando el cloud confirmó (vía
// sync exitoso) que la suscripción del gym está cancelada y la grace
// period venció. El sidecar responde 402 a TODAS las rutas excepto el
// whitelist necesario para mostrar esta pantalla y permitir que el dueño
// salga al dashboard a pagar.
//
// Decisión de producto (riesgo 1 de la sesión de Ajustes): mientras el
// sidecar está sin internet sigue operando como si nada — la promesa
// offline-first manda. Cuando un sync trae el flip a `cancelled`, el
// siguiente request entra acá y el dueño ve esta pantalla. Una vez que
// paga en el dashboard, el cloud lo marca `active` de vuelta, el siguiente
// sync lo refleja localmente, y la operación reanuda.

const DASHBOARD_URL =
  (import.meta.env.VITE_DASHBOARD_URL as string | undefined) ??
  "https://entinta.app";

const BILLING_URL = `${DASHBOARD_URL}/settings/subscription`;
const SUPPORT_WHATSAPP_URL = "https://wa.me/524461057446";

export default function SubscriptionBlocked() {
  const clearAuth = useAuthStore((s) => s.clear);
  const gym = useAuthStore((s) => s.gym);
  const user = useAuthStore((s) => s.user);

  async function openBilling() {
    try {
      await openExternal(BILLING_URL);
    } catch {
      // openExternal puede fallar en contextos no-Tauri (tests, dev web).
      // No crítico — el botón muestra la URL como tooltip indirectamente.
    }
  }

  // Si la grace period existe pero ya venció, mostramos la fecha — sirve de
  // ancla para que el dueño sepa "ah sí, era marzo, ya pasó hace rato".
  const expiredOn = gym?.subscription_ends_at
    ? fmtDate(gym.subscription_ends_at)
    : null;

  return (
    <AuthShell hideTagline>
      <div className="flex flex-col items-center text-center space-y-2 mb-6">
        <div className="inline-flex h-14 w-14 items-center justify-center rounded-full bg-destructive/10 text-destructive mb-2">
          <Lock className="h-7 w-7" strokeWidth={2} />
        </div>
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Tu suscripción está vencida
        </h1>
        <p className="text-muted-foreground leading-relaxed max-w-md mt-2">
          {gym?.name ? (
            <>
              <strong>{gym.name}</strong> no tiene una suscripción activa
              {expiredOn && <> (venció el {expiredOn})</>}.
            </>
          ) : (
            <>Este gym no tiene una suscripción activa.</>
          )}
          {" "}
          Para seguir operando, activa tu plan desde el dashboard.
        </p>
      </div>

      <div className="space-y-3">
        <Button size="lg" className="w-full" onClick={openBilling}>
          <ExternalLink className="h-4 w-4 mr-2" />
          Activar plan en el dashboard
        </Button>

        <Button
          asChild
          size="lg"
          variant="outline"
          className="w-full"
        >
          <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">
            <MessageCircle className="h-4 w-4 mr-2" />
            Hablar por WhatsApp
          </a>
        </Button>

        <p className="text-center text-xs text-muted-foreground pt-2">
          El pago se hace en tu navegador con Stripe o Mercado Pago. Cuando
          termines, Tinta se desbloquea automáticamente al próximo sync.
        </p>

        {user && (
          <button
            type="button"
            onClick={() => clearAuth()}
            className="w-full text-center text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors mt-6"
          >
            Cerrar sesión
          </button>
        )}
      </div>
    </AuthShell>
  );
}
