import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError, api } from "@/lib/api";
import { canAccessFeature } from "@/lib/features";
import { useAuthStore, type Role } from "@/stores/useAuthStore";
import type { Permission } from "@/lib/permissions";

export interface Operator {
  id: string;
  gym_id: string;
  email: string;
  full_name: string;
  phone: string | null;
  role: Role;
  active: boolean;
  must_change_password: boolean;
  has_pin: boolean;
  last_login_at: string | null;
  created_at: string;
  /** Effective permissions; the owner gets all of them. */
  permissions?: Permission[];
}

export interface OperatorsListResponse {
  items: Operator[];
}

// CreateOperatorInput espeja al wire del BE (modelo PIN-first):
// - phone es obligatorio: el PIN se entrega por WhatsApp.
// - email es opcional: rara vez existe en el segmento de barrio.
// - No hay password: el server genera el PIN automáticamente.
export interface CreateOperatorInput {
  full_name: string;
  phone: string;
  email?: string;
  /** Omitted = none: a new operator starts without permissions. */
  permissions?: Permission[];
}

// CreateOperatorResponse trae el PIN plaintext (mostrado UNA vez en el
// modal de éxito como fallback si WhatsApp no estaba conectado).
export interface CreateOperatorResponse {
  user_id: string;
  full_name: string;
  phone: string;
  email: string;
  pin: string;
  whatsapp_delivery: boolean;
  whatsapp_skipped?: string;
}

export interface UpdateOperatorInput {
  full_name?: string;
  email?: string;
  phone?: string;
  /** Omitted = unchanged. */
  permissions?: Permission[];
}

export interface ToggleActiveInput {
  active: boolean;
}

// Rotate PIN — owner-only. Mismo shape de éxito que Create, sin los
// campos de identidad (el FE ya los tiene cacheados en el row).
export interface RotateOperatorPINResponse {
  user_id: string;
  pin: string;
  whatsapp_delivery: boolean;
  whatsapp_skipped?: string;
}

// Legacy: el dueño puede seguir reseteando password para operadores
// pre-migración que tenían email+password. La UI sólo lo expone cuando
// el operador tiene email.
export interface ResetPasswordResponse {
  user_id: string;
  password: string;
}

const KEYS = {
  list: (includeInactive: boolean) => ["operators", "list", includeInactive] as const,
};

export function useOperators(includeInactive = true) {
  return useQuery<OperatorsListResponse>({
    queryKey: KEYS.list(includeInactive),
    queryFn: () =>
      api.get<OperatorsListResponse>("/api/v1/users", {
        query: { include_inactive: includeInactive ? "true" : undefined },
      }),
    staleTime: 30_000,
  });
}

// Cupo de operadores activos. El servidor es la fuente de verdad
// (checkOperatorCapacity, al crear y al reactivar): con extra_operators (hoy
// prueba, Standard y Plus) caben 10 además del dueño; sin la feature, 1.
// Cuenta sólo a los operadores activos: el dueño y los desactivados no
// ocupan lugar. Repetir aquí los mismos números evita que el dueño llene un
// formulario que el servidor va a rechazar.
export const OPERATOR_LIMIT_PLUS = 10;
export const OPERATOR_LIMIT_STANDARD = 1;

export interface OperatorCapacity {
  isPlus: boolean;
  limit: number;
  /** Operadores activos: los que ocupan lugar. */
  used: number;
  inactive: number;
  free: number;
  full: boolean;
}

export function operatorCapacity(items: Operator[], isPlus: boolean): OperatorCapacity {
  const operators = items.filter((o) => o.role === "operator");
  const used = operators.filter((o) => o.active).length;
  const limit = isPlus ? OPERATOR_LIMIT_PLUS : OPERATOR_LIMIT_STANDARD;
  return {
    isPlus,
    limit,
    used,
    inactive: operators.length - used,
    free: Math.max(0, limit - used),
    full: used >= limit,
  };
}

/** Lista de operadores y su cupo; `capacity` es null mientras no se conoce. */
export function useOperatorCapacity() {
  const list = useOperators(true);
  const gym = useAuthStore((s) => s.gym);
  const isPlus = canAccessFeature(gym, "extra_operators");
  const capacity = list.data ? operatorCapacity(list.data.items, isPlus) : null;
  return { list, capacity };
}

/**
 * El servidor rechaza el alta o la reactivación con el cupo lleno
 * (ErrOperatorLimitReached / ErrOperatorLimitStandard). Ese error no trae un
 * código propio, así que se reconoce por su mensaje. Devuelve qué cupo se
 * llenó, o null si el error es otro.
 */
export function operatorLimitError(err: unknown): "plus" | "standard" | null {
  if (!(err instanceof ApiError)) return null;
  const text = `${err.code} ${err.diagnosticMessage}`;
  if (!/operador(?:es)? activos?/i.test(text) || !/máximo|incluye|limit/i.test(text)) return null;
  return /standard|incluye 1 /i.test(text) ? "standard" : "plus";
}

export function useCreateOperator() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateOperatorInput) =>
      api.post<CreateOperatorResponse>("/api/v1/users", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operators"] }),
  });
}

export function useUpdateOperator(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateOperatorInput) =>
      api.patch<Operator>(`/api/v1/users/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operators"] }),
  });
}

export function useToggleOperatorActive(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ToggleActiveInput) =>
      api.patch<Operator>(`/api/v1/users/${id}/active`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operators"] }),
  });
}

export function useRotateOperatorPIN(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<RotateOperatorPINResponse>(`/api/v1/users/${id}/rotate-pin`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["operators"] }),
  });
}

// useResetOperatorPassword conserva la ruta legacy. La UI lo esconde
// si el operador no tiene email (un operador PIN-first sin correo no
// necesita el flujo de password). Plan: deprecate en fase 2.
export function useResetOperatorPassword(id: string) {
  return useMutation({
    mutationFn: () =>
      api.post<ResetPasswordResponse>(`/api/v1/users/${id}/reset-password`, {}),
  });
}
