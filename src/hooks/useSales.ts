import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentMethod } from "./useBilling";

export interface SaleLineItemInput {
  product_id: string;
  quantity: number;
}

export interface RegisterSaleInput {
  line_items: SaleLineItemInput[];
  payment_method: PaymentMethod;
  member_id?: string;
  notes?: string;
  // paid (opcional): cuando es menor al total, el faltante se persiste
  // como balance_pending en el Payment ("fiado"). El backend rechaza
  // fiado sin member_id — la UI debe gatear el flujo en consecuencia.
  paid?: number;
}

export interface SaleItemResponse {
  product_id: string;
  product_name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  stock_after: number;
}

// RegisterSaleResponse — shape del response de POST /api/v1/sales.
// Matchea registerSaleResp en payment_controller.go (campos planos, sin
// envelope sale/payment).
export interface RegisterSaleResponse {
  sale_id: string;
  payment_id: string;
  folio: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance_pending: number;
  items: SaleItemResponse[];
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
      // El sidecar/backend solo expone GET /api/v1/members (con `q` como
      // filtro). Aplanamos el list-item ({ member, current_membership,
      // access_status }) al shape mínimo que necesita el dropdown.
      const res = await api.get<{
        items: Array<{ member: { id: string; full_name: string; phone: string } }>;
      }>("/api/v1/members", {
        query: { q: query, page: 1, page_size: 10 },
      });
      return (res.items ?? []).map((it) => ({
        member_id: it.member.id,
        full_name: it.member.full_name,
        phone: it.member.phone,
      }));
    },
    enabled: query.trim().length >= 2,
    staleTime: 10_000,
  });
}
