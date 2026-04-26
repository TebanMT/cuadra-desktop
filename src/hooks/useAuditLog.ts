import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface AuditLogEntry {
  id: string;
  gym_id: string;
  entity_type: string;
  entity_id: string | null;
  action: string;
  actor_id: string | null;
  actor_name: string | null;
  changes: Record<string, unknown> | null;
  created_at: string;
}

export interface AuditLogResponse {
  items: AuditLogEntry[];
  total: number;
  page: number;
  page_size: number;
}

export interface AuditLogFilters {
  entity_type?: string;
  actor_id?: string;
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

const KEYS = {
  list: (filters: AuditLogFilters) => ["audit-log", "list", filters] as const,
};

export function useAuditLog(filters: AuditLogFilters) {
  return useQuery<AuditLogResponse>({
    queryKey: KEYS.list(filters),
    queryFn: () =>
      api.get<AuditLogResponse>("/api/v1/audit-log", {
        query: {
          entity_type: filters.entity_type || undefined,
          actor_id: filters.actor_id || undefined,
          from: filters.from || undefined,
          to: filters.to || undefined,
          page: filters.page,
          page_size: filters.page_size,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export const AUDIT_ENTITY_TYPES: { code: string; label: string }[] = [
  { code: "member", label: "Socios" },
  { code: "membership", label: "Membresías" },
  { code: "membership_type", label: "Tipos de membresía" },
  { code: "payment", label: "Cobros" },
  { code: "sale", label: "Ventas" },
  { code: "product", label: "Productos" },
  { code: "user", label: "Operadores" },
  { code: "gym", label: "Gym" },
  { code: "checkin", label: "Check-ins" },
];
