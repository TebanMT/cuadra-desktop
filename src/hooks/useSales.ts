import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentMethod, Payment } from "./useBilling";

export interface SaleLineItemInput {
  product_id: string;
  quantity: number;
}

export interface RegisterSaleInput {
  line_items: SaleLineItemInput[];
  payment_method: PaymentMethod;
  member_id?: string;
  notes?: string;
}

export interface SaleLineItem {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
}

export interface Sale {
  id: string;
  gym_id: string;
  payment_id: string;
  member_id?: string | null;
  member_name?: string | null;
  total: number;
  payment_method: PaymentMethod;
  line_items: SaleLineItem[];
  operator_id?: string | null;
  operator_name?: string | null;
  created_at: string;
}

export interface RegisterSaleResponse {
  sale: Sale;
  payment: Payment;
  pending_offline_sync?: boolean;
}

export interface MemberSearchResult {
  member_id: string;
  full_name: string;
  phone: string;
}

export function useRegisterSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterSaleInput) =>
      api.post<RegisterSaleResponse>("/api/v1/sales", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      qc.invalidateQueries({ queryKey: ["sales"] });
      qc.invalidateQueries({ queryKey: ["cash-close"] });
    },
  });
}

export function useMemberSearch(query: string) {
  return useQuery<MemberSearchResult[]>({
    queryKey: ["members", "search", query],
    queryFn: async () => {
      const res = await api.get<{ items: MemberSearchResult[] }>("/api/v1/members/search", {
        query: { q: query, limit: 10 },
      });
      return res.items ?? [];
    },
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  });
}
