import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { Role } from "@/stores/useAuthStore";

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
