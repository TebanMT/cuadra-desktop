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
  last_login_at: string | null;
  created_at: string;
}

export interface OperatorsListResponse {
  items: Operator[];
}

export interface CreateOperatorInput {
  full_name: string;
  email: string;
  phone?: string;
  password?: string;
  generate_password?: boolean;
}

export interface CreateOperatorResponse {
  user: Operator;
  generated_password: string | null;
}

export interface UpdateOperatorInput {
  full_name?: string;
  email?: string;
  phone?: string | null;
}

export interface ToggleActiveInput {
  active: boolean;
}

export interface ResetPasswordResponse {
  user_id: string;
  new_password: string;
}

const KEYS = {
  list: (includeInactive: boolean) => ["operators", "list", includeInactive] as const,
};

const PASSWORD_CHARSET = "abcdefghjkmnpqrstuvwxyzABCDEFGHJKMNPQRSTUVWXYZ23456789";

export function generatePassword(length = 6): string {
  let out = "";
  const max = Math.floor(256 / PASSWORD_CHARSET.length) * PASSWORD_CHARSET.length;
  while (out.length < length) {
    const buf = new Uint8Array(length);
    crypto.getRandomValues(buf);
    for (const byte of buf) {
      if (byte >= max) continue;
      out += PASSWORD_CHARSET[byte % PASSWORD_CHARSET.length];
      if (out.length === length) break;
    }
  }
  return out;
}

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

export function useResetOperatorPassword(id: string) {
  return useMutation({
    mutationFn: () =>
      api.post<ResetPasswordResponse>(`/api/v1/users/${id}/reset-password`, {}),
  });
}
