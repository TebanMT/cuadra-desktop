import { useAuthStore } from "@/stores/useAuthStore";

export const READ_ONLY_MESSAGE = "Tu prueba terminó y la recepción está en solo lectura. Puedes consultar y registrar entradas; para cobrar o hacer cambios, activa tu plan.";

export class ReadOnlyError extends Error {
  constructor() {
    super(READ_ONLY_MESSAGE);
    this.name = "ReadOnlyError";
  }
}

export function useCanWrite() {
  return useAuthStore(state => !state.readOnly);
}

export function assertCanWrite() {
  if (useAuthStore.getState().readOnly) throw new ReadOnlyError();
}

// Recuperar la sesión y sincronizar registros existentes siguen disponibles.
// No se permite que skipAuth ni una URL directa omitan la protección.
const SESSION_REQUESTS = new Set([
  "/api/v1/auth/login", "/api/v1/auth/login-pin", "/api/v1/auth/logout",
  "/api/v1/auth/refresh", "/api/v1/auth/me/refresh", "/api/v1/auth/verify-password",
  "/api/v1/auth/forgot-password", "/api/v1/auth/reset-password",
  "/api/v1/auth/redeem-installer", "/api/v1/auth/signup", "/api/v1/sync/trigger",
]);

// Registrar la entrada de un socio sigue disponible en solo lectura
// (UC-002). "Permitir de todos modos" (/checkins/override) no: dejaría
// entrar a socios vencidos sin cobrarles. Espeja trialReadOnlyWrites del
// sidecar (subscription_gate.go).
const CHECKIN_REQUESTS = new Set(["/api/v1/checkins/manual", "/api/v1/checkins/number"]);

export function assertRequestAllowed(method: string, path: string) {
  if (["GET", "HEAD", "OPTIONS"].includes(method.toUpperCase())) return;
  const pathname = new URL(path, "http://localhost").pathname;
  if (method.toUpperCase() === "POST" && (SESSION_REQUESTS.has(pathname) || CHECKIN_REQUESTS.has(pathname))) return;
  assertCanWrite();
}
