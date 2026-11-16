import { useEffect } from "react";
import { Navigate, Outlet, useLocation } from "react-router-dom";
import { toast } from "sonner";
import { isSubscriptionBlocked, useAuthStore } from "@/stores/useAuthStore";

/**
 * Route guards del desktop.
 *
 * Decisión arquitectónica: el setup del gym vive en el dashboard web,
 * NO en el desktop. Si el dueño se loguea acá pero su gym todavía no
 * tiene `setup_completed = true`, lo mandamos a /auth/setup-required
 * que es una pantalla terminal con un CTA para terminar el wizard
 * desde https://entinta.app.
 *
 * Hard-block por suscripción: el sidecar también responde 402 en este
 * caso, pero el guard FE redirige antes del primer fetch para evitar
 * pantallas con loaders intermedios.
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

  if (user.must_change_password) {
    return location.pathname === "/auth/change-password" ? <Outlet /> : <Navigate to="/auth/change-password" replace />;
  }
  if (location.pathname === "/auth/change-password") return <Navigate to="/" replace />;

  // Suscripción vencida tiene prioridad sobre setup: si un gym setup-completo
  // dejó de pagar, mostrar la pantalla de bloqueo antes que cualquier otra
  // cosa. Si el gym no completó setup, ese flujo va primero (los guards en
  // cascada evitan loops).
  if (isSubscriptionBlocked(gym)) {
    return location.pathname === "/auth/subscription-blocked" ? <Outlet /> : <Navigate to="/auth/subscription-blocked" replace />;
  }
  if (gym && !gym.setup_completed) {
    return location.pathname === "/auth/setup-required" ? <Outlet /> : <Navigate to="/auth/setup-required" replace />;
  }
  if (gym && ["/auth/subscription-blocked", "/auth/setup-required"].includes(location.pathname)) {
    return <Navigate to="/" replace />;
  }

  return <Outlet />;
}

const OWNER_ONLY_NOTICE = "Esa sección es sólo del dueño.";

/** Redirect to Inicio saying why, so the bounce never looks like a glitch. */
function OwnerOnlyRedirect() {
  useEffect(() => {
    // Fixed id: a repeated bounce (or StrictMode's double effect) updates
    // the same toast instead of stacking copies.
    toast(OWNER_ONLY_NOTICE, { id: "owner-only-route" });
  }, []);
  return <Navigate to="/" replace />;
}

/**
 * OwnerOnlyRoute — defensa en profundidad para rutas que sólo el dueño debe
 * abrir (Suscripción, Bitácora, Operadores, Mensajes…). El sidebar ya
 * filtra estas entries con `ownerOnly: true`, pero un operador podría
 * llegar por URL directa, un enlace o navegación lateral. Si llega: lo
 * regresamos a Inicio con un aviso breve; Inicio no es ruta del dueño, así
 * que no hay bucle.
 */
export function OwnerOnlyRoute() {
  const role = useAuthStore((s) => s.user?.role);
  const hydrated = useAuthStore((s) => s.hydrated);
  if (!hydrated) return null;
  if (role !== "owner") {
    return <OwnerOnlyRedirect />;
  }
  return <Outlet />;
}

export function PublicOnlyRoute() {
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);
  const hydrated = useAuthStore((s) => s.hydrated);

  if (!hydrated) return null;
  if (user) {
    if (location.pathname === "/auth/reset-password") return <Outlet />;
    if (user.must_change_password) return <Navigate to="/auth/change-password" replace />;
    if (gym && !gym.setup_completed) {
      return <Navigate to="/auth/setup-required" replace />;
    }
    return <Navigate to="/" replace />;
  }
  return <Outlet />;
}
