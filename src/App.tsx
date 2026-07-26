import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { toast } from "sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { DevModeBanner } from "@/components/layout/DevModeBanner";
import { SidecarFailed } from "@/pages/shell/SidecarFailed";
import { useSidecarUrl } from "@/hooks/useSidecarUrl";
import { useHydrateAuth } from "@/hooks/useAuth";
import { useSyncPullRefresh } from "@/hooks/useSyncStatus";
import { router } from "@/routes";
import { queryClient } from "@/lib/queryClient";
import { setOnPlanRequired, setOnSubscriptionInactive } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";
import { BiometricEventsProvider } from "@/lib/biometricEventsProvider";

function Bootstrapped() {
  useHydrateAuth();
  // Cuando el sync trae cambios (last_pulled_at avanza), invalida el caché
  // para que dashboard/reportes/socios reflejen lo que acaba de aterrizar.
  useSyncPullRefresh();
  // No setOnAuthExpired wiring — the sidecar mints effectively-eternal JWTs
  // and refresh failures no longer drop the session. The only exit from a
  // signed-in state is the explicit "Cerrar sesión" action in useLogout.
  //
  // setOnSubscriptionInactive sí está cableado: cuando un request recibe
  // 402 desde el sidecar (gym con suscripción cancelada + grace vencida)
  // actualizamos el auth store con el nuevo status. El ProtectedRoute
  // detecta el cambio en el siguiente render y manda al usuario a la
  // pantalla de bloqueo (/auth/subscription-blocked).
  useEffect(() => {
    setOnSubscriptionInactive((payload) => {
      const { gym, setGym } = useAuthStore.getState();
      if (!gym) return;
      setGym({
        ...gym,
        subscription_status:
          payload.subscription_status as typeof gym.subscription_status,
        subscription_ends_at: payload.subscription_ends_at,
      });
    });
    // 402 plan_required: el FE gatea casi todas las entradas a features
    // Plus con PlusFeatureLock; este toast cubre el path no-gateado (deep
    // link, botón sin gate, request directo). El CTA lleva al upsell.
    setOnPlanRequired((payload) => {
      toast.error(payload.message, {
        action: {
          label: "Mejorar plan",
          onClick: () => {
            window.location.assign("/settings/subscription");
          },
        },
      });
    });
    return () => {
      setOnSubscriptionInactive(null);
      setOnPlanRequired(null);
    };
  }, []);
  return <RouterProvider router={router} />;
}

export default function App() {
  const { state } = useSidecarUrl();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {/* BiometricEventsProvider: la conexión SSE a /biometric/events
              de esta ventana (el sidecar es dueño del lector; el FE sólo
              escucha). Vivir aquí (por encima del router) hace que el
              stream sobreviva navegación entre rutas. */}
          <BiometricEventsProvider>
            <DevModeBanner />
            {state === "ready" ? <Bootstrapped /> : <SidecarFailed state={state} />}
            <Toaster />
          </BiometricEventsProvider>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
