import { useEffect } from "react";
import { RouterProvider } from "react-router-dom";
import { QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "@/components/ui/sonner";
import { ErrorBoundary } from "@/components/shared/ErrorBoundary";
import { SidecarFailed } from "@/pages/shell/SidecarFailed";
import { useSidecarUrl } from "@/hooks/useSidecarUrl";
import { useHydrateAuth } from "@/hooks/useAuth";
import { router } from "@/routes";
import { queryClient } from "@/lib/queryClient";
import { setOnSubscriptionInactive } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

function Bootstrapped() {
  useHydrateAuth();
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
    return () => setOnSubscriptionInactive(null);
  }, []);
  return <RouterProvider router={router} />;
}

export default function App() {
  const { state } = useSidecarUrl();

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          {state === "ready" ? <Bootstrapped /> : <SidecarFailed state={state} />}
          <Toaster />
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
}
