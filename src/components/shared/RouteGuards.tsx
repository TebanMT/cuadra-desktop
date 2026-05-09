import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";

/**
 * Route guards del desktop.
 *
 * Decisión arquitectónica: el setup del gym vive en el dashboard web,
 * NO en el desktop. Si el dueño se loguea acá pero su gym todavía no
 * tiene `setup_completed = true`, lo mandamos a /auth/setup-required
 * que es una pantalla terminal con un CTA para terminar el wizard
 * desde https://entinta.app.
 */

export function ProtectedRoute() {
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);
  const hydrated = useAuthStore((s) => s.hydrated);
  const location = useLocation();

  if (!hydrated) {
    return null;
  }

  if (!user) {
    return <Navigate to="/welcome" replace state={{ from: location }} />;
  }

  // Setup pendiente → forzar la pantalla SetupRequired (excepto si ya
  // estamos ahí, para no caer en loop de redirects).
  if (
    gym &&
    !gym.setup_completed &&
    location.pathname !== "/auth/setup-required"
  ) {
    return <Navigate to="/auth/setup-required" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);
  const hydrated = useAuthStore((s) => s.hydrated);

  if (!hydrated) return null;
  if (user) {
    if (gym && !gym.setup_completed) {
      return <Navigate to="/auth/setup-required" replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
