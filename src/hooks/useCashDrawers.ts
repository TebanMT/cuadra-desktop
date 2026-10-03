import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export interface CashDrawer {
  id: string;
  code: string;
  name: string;
  active: boolean;
  is_main: boolean;
  version: number;
}

interface CashDrawerListResponse {
  items: CashDrawer[];
}

export interface CreateCashDrawerInput {
  name: string;
  idempotency_key: string;
}

export interface UpdateCashDrawerInput {
  id: string;
  name: string;
  active?: boolean;
  version: number;
}

const KEYS = {
  all: ["cash-drawers"] as const,
  list: (includeInactive: boolean) =>
    ["cash-drawers", includeInactive ? "all" : "active"] as const,
};

/**
 * Catálogo operativo de cajas físicas. La caja principal existe siempre en
 * backend; por eso un gym sencillo no necesita configurarla para operar.
 */
export function useCashDrawers(includeInactive = false) {
  return useQuery<CashDrawer[]>({
    queryKey: KEYS.list(includeInactive),
    queryFn: async () => {
      const response = await api.get<CashDrawerListResponse>("/api/v1/cash-drawers", {
        query: includeInactive ? { include_inactive: true } : undefined,
      });
      return response.items;
    },
    staleTime: 60_000,
  });
}

export function useCreateCashDrawer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCashDrawerInput) =>
      api.post<CashDrawer>("/api/v1/cash-drawers", input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["cash-close"] });
    },
  });
}

export function useUpdateCashDrawer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...input }: UpdateCashDrawerInput) =>
      api.patch<CashDrawer>(`/api/v1/cash-drawers/${id}`, input),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["cash-close"] });
    },
  });
}

export function useDeactivateCashDrawer() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version }: Pick<CashDrawer, "id" | "version">) =>
      api.delete<CashDrawer>(`/api/v1/cash-drawers/${id}`, {
        query: { version },
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
      queryClient.invalidateQueries({ queryKey: ["cash-close"] });
    },
  });
}
