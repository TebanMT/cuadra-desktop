import { Navigate, Outlet, useLocation } from "react-router-dom";
import { useAuthStore } from "@/stores/useAuthStore";

export function ProtectedRoute() {
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);
  const hydrated = useAuthStore((s) => s.hydrated);
  const location = useLocation();

  if (!hydrated) {
    return null;
  }

  if (!user) {
    return <Navigate to="/auth/login" replace state={{ from: location }} />;
  }

  if (gym && !gym.setup_completed && !location.pathname.startsWith("/setup")) {
    return <Navigate to="/setup/step-2" replace />;
  }

  return <Outlet />;
}

export function PublicOnlyRoute() {
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);
  const hydrated = useAuthStore((s) => s.hydrated);

  if (!hydrated) return null;
  if (user) {
    if (gym && !gym.setup_completed) return <Navigate to="/setup/step-2" replace />;
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
