import { ExternalLink } from "lucide-react";
import { AuthShell } from "@/components/shared/AuthShell";
import { Button } from "@/components/ui/button";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * SetupRequired — pantalla terminal cuando el dueño se loguea al
 * desktop pero todavía NO completó el setup wizard del dashboard.
 *
 * Decisión arquitectónica: el setup del gym (datos, planes, métodos
 * de pago) es responsabilidad del **dashboard web**, no del desktop.
 * El desktop es la herramienta de operación de recepción — cobros,
 * check-ins, kiosko. El owner llena el setup desde su celular o
 * laptop personal a través de https://entinta.app.
 *
 * Esta pantalla aparece cuando:
 *   - Login devuelve setup_completed = false
 *   - RedeemInstaller redime un token de un gym sin setup completo
 *   - RouteGuards detecta navegación con gym sin setup
 *
 * Acción para el usuario: abrir el dashboard en el browser del
 * sistema (no Tauri webview) para continuar el wizard ahí.
 */

const DASHBOARD_URL =
  (import.meta.env.VITE_DASHBOARD_URL as string | undefined) ??
  "https://entinta.app";

const SETUP_URL = `${DASHBOARD_URL}/setup/step-2`;

export default function SetupRequired() {
  const clearAuth = useAuthStore((s) => s.clear);
  const user = useAuthStore((s) => s.user);

  return (
    <AuthShell hideTagline>
      <div className="space-y-1 mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Termina la configuración<br />
          desde tu dashboard.
        </h1>
        <p className="text-muted-foreground mt-3 leading-relaxed">
          La configuración inicial del gym (datos, planes, métodos de pago)
          se hace desde la web. Toma 3 minutos. Después vuelves acá y la
          recepción ya queda lista para operar.
        </p>
      </div>

      <div className="space-y-4">
        <Button asChild size="lg" className="w-full">
          <a href={SETUP_URL} target="_blank" rel="noreferrer">
            Continuar en el dashboard
            <ExternalLink className="h-4 w-4 ml-2" />
          </a>
        </Button>

        <p className="text-center text-xs text-muted-foreground">
          Se abre en tu navegador.
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
