import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentMethod } from "./useBilling";

export interface SaleLineItemInput {
  product_id: string;
  quantity: number;
}

export interface RegisterSaleInput {
  expected_total?: number;
  idempotency_key: string;
  line_items: SaleLineItemInput[];
  payment_method: PaymentMethod;
  cash_drawer_id?: string;
  member_id?: string;
  notes?: string;
  // paid (opcional): cuando es menor al total, el faltante se persiste
  // como balance_pending en el Payment ("fiado"). El backend rechaza
  // fiado sin member_id — la UI debe gatear el flujo en consecuencia.
  paid?: number;
  // Promo opcional. En ventas sólo aplican percent / fixed_amount; los
  // demás kinds el backend los recibe pero el Calculator devuelve 0.
  promotion?: {
    promotion_id?: string;
    code?: string;
    notes?: string;
  };
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
  promotion_applied_id?: string;
  promotion_name?: string;
  promotion_kind?: string;
}

export interface SaleDetailLine {
  sale_item_id: string;
  product_id: string;
  product_name: string;
  quantity: number;
  unit_price: number;
  line_total: number;
  unit_cost?: number | null;
  cost_complete?: boolean;
  // Cantidades acumuladas por línea. El backend es la autoridad: una venta
  // puede tener varias devoluciones parciales y no basta con mirar el total.
  refundable_quantity: number;
  refunded_quantity: number;
}

export interface SalePaymentDetail {
  amount: number;
  recognized_amount: number;
  payment_method: PaymentMethod;
  payment_date: string;
}

export interface PendingSaleRefund {
  correction_id: string;
  amount_due: number;
  created_at: string;
  reason: string;
}

export interface SaleDetail {
  id: string;
  version: number;
  payment_id: string;
  folio: string;
  member_id?: string | null;
  subtotal: number;
  discount: number;
  total: number;
  collected: number;
  refunded: number;
  refundable: number;
  balance_pending: number;
  payment: SalePaymentDetail;
  lines: SaleDetailLine[];
  pending_refund_due: number;
  pending_refunds: PendingSaleRefund[];
}

export type ProductRefundDisposition =
  | "returned_to_stock"
  | "damaged"
  | "not_returned";

export interface RefundSaleInput {
  reason: string;
  method: PaymentMethod;
  payment_date?: string;
  cash_drawer_id?: string;
  idempotency_key: string;
  line_items: Array<{
    sale_item_id: string;
    quantity: number;
    disposition: ProductRefundDisposition;
  }>;
}

export interface RefundSaleResponse {
  refund_id: string;
  // Magnitud positiva del dinero efectivamente devuelto.
  amount: number;
  // Parte del valor retornado que cancela deuda; no crea una salida de dinero.
  balance_cancelled: number;
}

export interface SettlePendingSaleRefundInput {
  payment_method: PaymentMethod;
  payment_date?: string;
  cash_drawer_id?: string;
  idempotency_key: string;
}

export interface SettlePendingSaleRefundResponse {
  refund_id: string;
  // Todos los montos de este contrato son magnitudes positivas.
  amount: number;
  payment_method: PaymentMethod;
  refunded_on: string;
  pending_amount: number;
}

export type SaleCorrectionMoneyResolution =
  | "record_only"
  | "refund_excess"
  | "refund_pending";
export type SaleCorrectionRefundMethod = PaymentMethod;
export type SaleCorrectionIncreaseResolution = "pending" | "already_collected" | "collect_now";

export interface CorrectSaleInput {
  expected_version: number;
  idempotency_key: string;
  reason: string;
  annul?: boolean;
  // Estado completo deseado. Omitir una línea anterior equivale a quitarla.
  lines: {
    sale_item_id?: string;
    product_id: string;
    quantity: number;
  }[];
  money_resolution: SaleCorrectionMoneyResolution;
  refund_method?: SaleCorrectionRefundMethod;
  cash_drawer_id?: string;
  increase_resolution?: SaleCorrectionIncreaseResolution;
  collection_method?: PaymentMethod;
  collection_cash_drawer_id?: string;
  collection_date?: string;
}

export interface CorrectSaleResponse {
  correction_id: string;
  correction_type: string;
  annulled: boolean;
  idempotency_key: string;
  sale_version?: number;
  sale: SaleDetail | null;
  inventory_effects: {
    product_id: string;
    stock_delta: number;
  }[];
  money_effect: {
    // Nombres canónicos del modelo financiero nuevo.
    previous_total?: number;
    corrected_total?: number;
    physical_collected?: number;
    recognized_income?: number;
    refunded_now?: number;
    pending_refund_due?: number;
    status?: string;
    // Aliases de compatibilidad que consume el modal existente.
    old_sale_total: number;
    new_sale_total: number;
    collected: number;
    refund_due: number;
    money_status: "refund_pending" | "settled";
    refund_id?: string;
    refund_amount?: number;
    refund_method?: SaleCorrectionRefundMethod;
    additional_collected_now: number;
    additional_pending: number;
    additional_historical_collected: number;
    settlement_id?: string;
  };
}

interface CorrectSaleWireResponse {
  correction_id: string;
  correction_type?: string;
  annulled?: boolean;
  idempotency_key?: string;
  sale_version?: number;
  sale?: SaleDetail | null;
  inventory_effects?: CorrectSaleResponse["inventory_effects"];
  money_effect: Partial<CorrectSaleResponse["money_effect"]> & {
    previous_total?: number;
    corrected_total?: number;
    physical_collected?: number;
    recognized_income?: number;
    refunded_now?: number;
    pending_refund_due?: number;
    status?: string;
  };
}

export interface MemberSearchResult {
  member_id: string;
  full_name: string;
  phone: string;
}

const SALE_KEYS = {
  detail: (saleID: string) => ["sales", "detail", saleID] as const,
};

const SALE_INVALIDATION_ROOTS = [
  "products",
  "sales",
  "payments",
  "billing",
  "cash-close",
  "reports",
  "dashboard",
  "analytics",
] as const;

function invalidateSaleFinancials(qc: ReturnType<typeof useQueryClient>) {
  for (const root of SALE_INVALIDATION_ROOTS) {
    qc.invalidateQueries({ queryKey: [root] });
  }
}

export function useRegisterSale() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterSaleInput) =>
      api.post<RegisterSaleResponse>("/api/v1/sales", input),
    onSuccess: () => {
      invalidateSaleFinancials(qc);
    },
  });
}

export function useSaleDetail(saleID: string | null | undefined, enabled = true) {
  return useQuery<SaleDetail>({
    queryKey: SALE_KEYS.detail(saleID ?? ""),
    queryFn: () => api.get<SaleDetail>(`/api/v1/sales/${saleID}`),
    enabled: enabled && !!saleID,
    staleTime: 0,
  });
}

export function useCorrectSale(saleID: string) {
  const qc = useQueryClient();
  return useMutation<CorrectSaleResponse, Error, CorrectSaleInput>({
    mutationFn: async (input) => {
      const response = await api.post<CorrectSaleWireResponse>(
        `/api/v1/sales/${saleID}/corrections`,
        input
      );
      // Compatibilidad durante la transición del contrato: el response nuevo
      // usa nombres financieros explícitos. Si el servidor aún no devuelve el
      // superset con `sale`, la releemos y normalizamos para que la UI nunca
      // ponga undefined en el cache después de una escritura exitosa.
      if (response.sale && response.money_effect.money_status) {
        return response as CorrectSaleResponse;
      }
      const sale = response.annulled ? null : response.sale ?? await api.get<SaleDetail>(`/api/v1/sales/${saleID}`);
      const money = response.money_effect;
      const pending = money.pending_refund_due ?? money.refund_due ?? 0;
      const refundedNow = money.refunded_now ?? money.refund_amount ?? 0;
      return {
        correction_id: response.correction_id,
        correction_type: response.correction_type ?? (response.annulled ? "annul" : "replace"),
        annulled: response.annulled ?? false,
        idempotency_key: response.idempotency_key ?? input.idempotency_key,
        sale_version: response.sale_version,
        sale,
        inventory_effects: response.inventory_effects ?? [],
        money_effect: {
          ...money,
          old_sale_total: money.old_sale_total ?? money.previous_total ?? sale?.total ?? 0,
          new_sale_total: money.new_sale_total ?? money.corrected_total ?? sale?.total ?? 0,
          collected: money.collected ?? money.physical_collected ?? sale?.collected ?? 0,
          refund_due: pending,
          money_status:
            money.money_status ??
            (money.status === "pending_refund" ? "refund_pending" : "settled"),
          ...(refundedNow > 0 ? { refund_amount: refundedNow } : {}),
          ...(input.refund_method ? { refund_method: input.refund_method } : {}),
          additional_collected_now: money.additional_collected_now ?? 0,
          additional_pending: money.additional_pending ?? 0,
          additional_historical_collected: money.additional_historical_collected ?? 0,
        },
      };
    },
    onSuccess: (response) => {
      if (response.sale) qc.setQueryData(SALE_KEYS.detail(saleID), response.sale);
      else qc.removeQueries({ queryKey: SALE_KEYS.detail(saleID), exact: true });
      invalidateSaleFinancials(qc);
    },
  });
}

export function useRefundSale(saleID: string) {
  const qc = useQueryClient();
  return useMutation<RefundSaleResponse, Error, RefundSaleInput>({
    mutationFn: (input) =>
      api.post<RefundSaleResponse>(`/api/v1/sales/${saleID}/refund`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SALE_KEYS.detail(saleID) });
      invalidateSaleFinancials(qc);
    },
  });
}

export function useSettlePendingSaleRefund(correctionID: string, saleID: string) {
  const qc = useQueryClient();
  return useMutation<
    SettlePendingSaleRefundResponse,
    Error,
    SettlePendingSaleRefundInput
  >({
    mutationFn: (input) =>
      api.post<SettlePendingSaleRefundResponse>(
        `/api/v1/sale-corrections/${correctionID}/settle`,
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: SALE_KEYS.detail(saleID) });
      invalidateSaleFinancials(qc);
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
