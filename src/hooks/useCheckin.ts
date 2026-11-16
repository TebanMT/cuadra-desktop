import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { ReadOnlyError } from "@/lib/writeAccess";

export type CheckinMethod = "fingerprint" | "number" | "manual";
export type CheckinResult =
  | "allowed_active"
  | "allowed_expiring_soon"
  // Entrada forzada por el operador ("Permitir de todos modos", DA-29.2).
  | "allowed_override"
  | "denied_expired"
  | "denied_inactive"
  | "denied_no_membership"
  // Socio inscrito cuya primera membresía sigue esperando el pago.
  | "denied_unpaid_enrollment"
  | "denied_not_found";

export interface CheckinEvent {
  id: string;
  result: CheckinResult;
  method: CheckinMethod;
  member_id: string | null;
  member_name: string | null;
  expiry_date: string | null;
  days_until_expiry: number | null;
  manual_override: boolean;
  override_reason?: string | null;
  operator_name?: string | null;
  created_at: string;
}

export interface ManualCheckinInput {
  member_id: string;
}
export interface NumberCheckinInput {
  member_number: number;
}
export interface OverrideCheckinInput {
  member_id: string;
  reason: string;
  original_checkin_id?: string;
}

export function checkinErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError || err instanceof ReadOnlyError) {
    return err.message || fallback;
  }
  return fallback;
}

export function useCheckinManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualCheckinInput) =>
      api.post<CheckinEvent>("/api/v1/checkins/manual", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkins"] });
    },
  });
}

export function useCheckinByNumber() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: NumberCheckinInput) =>
      api.post<CheckinEvent>("/api/v1/checkins/number", input, { retry: 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkins"] });
    },
  });
}

export function useOverrideCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OverrideCheckinInput) =>
      api.post<CheckinEvent>("/api/v1/checkins/override", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkins"] });
    },
  });
}

interface CheckinCountResponse {
  count_today: number;
}

export function useCheckinCountToday(enabled = true) {
  return useQuery<CheckinCountResponse>({
    queryKey: ["checkins", "count-today"],
    queryFn: () => api.get<CheckinCountResponse>("/api/v1/checkins/count-today"),
    refetchInterval: 30_000,
    enabled,
    staleTime: 15_000,
  });
}

interface CheckinMethodsResponse {
  fingerprint_available: boolean;
  number_available: boolean;
  manual_available: boolean;
}

export function useCheckinMethods(enabled = true) {
  return useQuery<CheckinMethodsResponse>({
    queryKey: ["checkins", "methods"],
    queryFn: () => api.get<CheckinMethodsResponse>("/api/v1/checkins/methods"),
    refetchInterval: 15_000,
    enabled,
    staleTime: 10_000,
  });
}

interface RecentCheckinsResponse {
  items: CheckinEvent[];
}

export function useRecentCheckins() {
  const qc = useQueryClient();
  const [items, setItems] = useState<CheckinEvent[]>([]);
  // Un fallo de la consulta no es «aún no hay entradas»: lo distinguimos
  // para no decirle a recepción que nadie ha entrado cuando no sabemos.
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    api
      .get<RecentCheckinsResponse>("/api/v1/checkins", { query: { limit: 5 }, retry: 0 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
        setFailed(false);
      })
      .catch(() => {
        if (!cancelled) setFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function prepend(ev: CheckinEvent) {
    setItems((prev) => [ev, ...prev].slice(0, 5));
    setFailed(false);
    qc.invalidateQueries({ queryKey: ["checkins"] });
  }

  return { items, failed, prepend };
}

// useMemberCheckins lista las asistencias del socio para la pestaña
// "Asistencia" del detalle. Limit 50 — suficiente para ver el patrón de
// uso reciente sin paginar; gyms con socios muy activos pueden subirlo
// más adelante si hace falta.
export function useMemberCheckins(memberID: string | null | undefined, limit = 50) {
  return useQuery<RecentCheckinsResponse>({
    queryKey: ["checkins", "by-member", memberID, limit],
    queryFn: () =>
      api.get<RecentCheckinsResponse>(`/api/v1/members/${memberID}/checkins`, {
        query: { limit },
      }),
    enabled: !!memberID,
    staleTime: 10_000,
  });
}

interface VerifyOperatorInput {
  password: string;
}

export function useVerifyOperatorPassword() {
  return useMutation({
    mutationFn: (input: VerifyOperatorInput) =>
      api.post<{ ok: true }>("/api/v1/auth/verify-password", input, { retry: 0 }),
  });
}
