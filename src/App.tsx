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
