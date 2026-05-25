import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PromotionAppliesTo, PromotionKind } from "@/strings/promotions";

// Mirror del shape del BE (promotion_controller.go). Money en pesos
// float — el sidecar SQLite hace la conversión a cents en su borde.
export interface Promotion {
  id: string;
  name: string;
  description?: string | null;
  kind: PromotionKind;
  value?: number | null;
  buy_n: number;
  companion_count?: number | null;
  applies_to: PromotionAppliesTo;
  code?: string | null;
  valid_from?: string | null; // YYYY-MM-DD
  valid_until?: string | null;
  max_uses_total?: number | null;
  max_uses_per_member?: number | null;
  active: boolean;
}

export interface UpsertPromotionInput {
  name: string;
  description?: string | null;
  kind: PromotionKind;
  value?: number | null;
  companion_count?: number | null;
  applies_to: PromotionAppliesTo;
  code?: string | null;
  valid_from?: string | null;
  valid_until?: string | null;
  max_uses_total?: number | null;
  max_uses_per_member?: number | null;
}

export interface PromotionAppliedSummary {
  promotion_id: string;
  promotion_name: string;
  kind: PromotionKind;
  use_count: number;
  total_discount: number;
  members_reached: number;
}

const KEYS = {
  list: (includeInactive: boolean, appliesTo?: string, currentlyValid?: boolean) =>
    ["promotions", includeInactive, appliesTo ?? "", currentlyValid ?? false] as const,
  byCode: (code: string) => ["promotion-by-code", code.toLowerCase()] as const,
  summary: (month: string) => ["promotions-applied-summary", month] as const,
};

export interface ListPromotionsOptions {
  includeInactive?: boolean;
  appliesTo?: PromotionAppliesTo;
  currentlyValid?: boolean;
}

export function usePromotions(opts: ListPromotionsOptions = {}) {
  const { includeInactive = false, appliesTo, currentlyValid } = opts;
  return useQuery<Promotion[]>({
    queryKey: KEYS.list(includeInactive, appliesTo, currentlyValid),
    queryFn: () => {
      const query: Record<string, string> = {};
      if (includeInactive) query.include_inactive = "true";
      if (appliesTo) query.applies_to = appliesTo;
      if (currentlyValid) query.currently_valid = "true";
      return api.get<Promotion[]>("/api/v1/promotions", { query });
    },
    staleTime: 30_000,
  });
}

export function useCreatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPromotionInput) =>
      api.post<Promotion>("/api/v1/promotions", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });
}

export function useUpdatePromotion(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertPromotionInput) =>
      api.patch<Promotion>(`/api/v1/promotions/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });
}

export function useDeactivatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<Promotion>(`/api/v1/promotions/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });
}

export function useReactivatePromotion() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) =>
      api.post<Promotion>(`/api/v1/promotions/${id}/reactivate`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["promotions"] }),
  });
}

// Lookup por código — usado por PromotionPickerModal cuando el
// operador escribe un código en el input. Se ejecuta on-demand via
// queryClient.fetchQuery; no es un useQuery autoexecutable porque
// no queremos pegarle al server por cada keystroke.
export function fetchPromotionByCode(code: string): Promise<Promotion> {
  return api.get<Promotion>(`/api/v1/promotions/by-code/${encodeURIComponent(code)}`);
}

// Reporte mensual (admin del dashboard cloud usa este endpoint en
// read-only; el desktop puede mostrarlo en una vista futura del owner).
export function useAppliedSummary(month: string) {
  return useQuery<PromotionAppliedSummary[]>({
    queryKey: KEYS.summary(month),
    queryFn: () =>
      api.get<PromotionAppliedSummary[]>(`/api/v1/promotions/applied/summary`, {
        query: { month },
      }),
    enabled: Boolean(month),
  });
}
