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

function Bootstrapped() {
  useHydrateAuth();
  // No setOnAuthExpired wiring — the sidecar mints effectively-eternal JWTs
  // and refresh failures no longer drop the session. The only exit from a
  // signed-in state is the explicit "Cerrar sesión" action in useLogout.
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
