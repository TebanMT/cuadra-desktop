import { fmtDate } from "@/lib/dates";
import { auth } from "@/strings/auth";
import { isTrialReadOnly, type AuthGym } from "@/stores/useAuthStore";

const t = auth.login.trialExpired;

/**
 * trialEndedBody elige el texto del aviso de prueba terminada (UC-002) según
 * el punto en que está:
 *  - solo lectura: el cloud la cerró y pasaron los días de gracia;
 *  - gracia: el cloud la cerró y todavía hay acceso completo hasta la fecha;
 *  - pendiente: la fecha pasó pero el cloud aún no la cierra (o no hemos
 *    sincronizado). Sin fecha de corte: "en unos días".
 */
export function trialEndedBody(gym: AuthGym | null | undefined): string {
  if (isTrialReadOnly(gym)) return t.readOnly;
  if (gym?.subscription_status === "cancelled" && gym.subscription_ends_at) {
    return t.grace(fmtDate(gym.subscription_ends_at));
  }
  return t.pending;
}
