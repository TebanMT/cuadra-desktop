import { Navigate, Outlet, useLocation } from "react-router-dom";
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

  // Suscripción vencida tiene prioridad sobre setup: si un gym setup-completo
  // dejó de pagar, mostrar la pantalla de bloqueo antes que cualquier otra
  // cosa. Si el gym no completó setup, ese flujo va primero (los guards en
  // cascada evitan loops).
  if (
    isSubscriptionBlocked(gym) &&
    location.pathname !== "/auth/subscription-blocked"
  ) {
    return <Navigate to="/auth/subscription-blocked" replace />;
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

/**
 * OwnerOnlyRoute — defensa en profundidad para rutas que sólo el dueño debe
 * abrir (Suscripción, Bitácora, Operadores, Mensajes…). El sidebar ya
 * filtra estas entries con `ownerOnly: true`, pero un operador podría
 * llegar por URL directa o por navegación lateral. Si llega: redirect al
 * inicio. No mostramos un 403 explícito — mejor invisible que confundir
 * al operador con permisos que no entiende.
 */
export function OwnerOnlyRoute() {
  const role = useAuthStore((s) => s.user?.role);
  const hydrated = useAuthStore((s) => s.hydrated);
  if (!hydrated) return null;
  if (role !== "owner") {
    return <Navigate to="/" replace />;
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
