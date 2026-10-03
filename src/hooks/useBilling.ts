import { useEffect, useMemo } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type PaymentMethod = "cash" | "transfer" | "card";
export type PaymentConcept =
  | "membership"
  | "product"
  | "balance_settlement"
  | "refund"
  | "other";

export interface Payment {
  cash_destination?: "cash_drawer" | "gym_fund";
  id: string;
  /** Optimistic-lock version required by auditable administrative corrections. */
  version: number;
  gym_id: string;
  member_id?: string | null;
  member_name?: string | null;
  // Disponible en cobros de producto creados por una venta. Habilita la
  // corrección auditable sin intentar inferir la venta desde el payment.
  sale_id?: string | null;
  // Productos de la venta ("Agua 1L ×2 · Proteína") para concept='product'
  // y sus refunds. Título cuando no hay socio (venta walk-in).
  sale_summary?: string | null;
  amount: number;
  recognized_amount?: number;
  payment_method: PaymentMethod | null;
  cash_drawer_id?: string | null;
  concept: PaymentConcept;
  reference: string;
  discount_amount?: number;
  discount_reason?: string;
  balance_pending: number;
  parent_payment_id?: string | null;
  payment_date: string;
  notes?: string | null;
  operator_id?: string | null;
  operator_name?: string | null;
  created_at: string;
  refund_reason?: string | null;
  membership_id?: string | null;
  receipt_sent_via?: "whatsapp" | "email" | null;
  receipt_sent_at?: string | null;
}

export interface PaymentCorrectionSnapshot {
 cash_destination?: "cash_drawer" | "gym_fund";
  version: number;
  amount: number;
  recognized_amount: number;
  balance_pending: number;
  payment_method: PaymentMethod;
  cash_drawer_id?: string | null;
  payment_date: string;
  annulled: boolean;
}

export interface PaymentCorrectionInput {
 cash_destination?: "cash_drawer" | "gym_fund";
  expected_version: number;
  reason: string;
  amount?: number;
  payment_method?: PaymentMethod;
  cash_drawer_id?: string;
  payment_date?: string;
  /** Only valid for a root extraordinary-income payment. Cannot be mixed with field edits. */
  annul?: boolean;
  idempotency_key: string;
}

export interface PaymentCorrectionResponse {
  correction_id: string;
  payment_id: string;
  payment_version: number;
  before: PaymentCorrectionSnapshot;
  after: PaymentCorrectionSnapshot;
  /** Administrative corrections never rewrite the membership service period. */
  service_effects_changed: false;
  annulled: boolean;
}

export interface PaymentCorrectionHistoryItem {
  id: string;
  payment_id: string;
  expected_payment_version: number;
  reason: string;
  before: PaymentCorrectionSnapshot;
  after: PaymentCorrectionSnapshot;
  created_by: string;
  created_at: string;
  annulled: boolean;
}

export interface PaymentCorrectionHistoryResponse {
  items: PaymentCorrectionHistoryItem[];
  total: number;
}

export interface RegisterMembershipPaymentInput {
  idempotency_key: string;
  member_id: string;
  membership_type_id: string;
  payment_method: PaymentMethod;
  cash_drawer_id?: string;
  // amount es lo que el FE muestra al operador como total a cobrar; el
  // backend lo deriva del MembershipType + flags. Lo enviamos sólo para
  // ergonomía (retrocompat con clientes que firmaban un "monto"). Vacío
  // en clientes nuevos también funciona.
  amount?: number;
  discount_amount?: number;
  discount_reason?: string;
  partial_amount?: number;
  // Operator overrides para cobros extra. Cuando undefined, BE decide
  // automáticamente (basado en member.enrollment_paid + frecuencia de
  // mantenimiento).
  charge_enrollment?: boolean;
  charge_maintenance?: boolean;
  // Montos efectivos (override del snapshot del plan si > 0). El FE los
  // resuelve desde gym.charge_settings cuando el plan trae fee=0.
  enrollment_amount?: number;
  maintenance_amount?: number;
  payment_date: string;
  notes?: string;
  // Promo opcional. promotion_id y code son excluyentes — operador
  // eligió de la lista vigente o tecleó un código. companion_member_ids
  // sólo para kind=companion_memberships (cantidad debe matchear).
  promotion?: {
    promotion_id?: string;
    code?: string;
    companion_member_ids?: string[];
    notes?: string;
  };
}

// Espeja registerPaymentResp del backend (payment_controller.go). Es un
// shape flat — el FE armaba antes un `payment` anidado por error, pero el
// wire real nunca lo trajo.
export interface RegisterMembershipPaymentResponse {
  payment_id: string;
  folio: string;
  subtotal: number;
  discount: number;
  total: number;
  paid: number;
  balance_pending: number;
  new_membership_id: string;
  new_expiry: string;
  enrollment_charged: boolean;
  maintenance_charged: boolean;
  pending_offline_sync?: boolean;
  // Datos de promo aplicada (vacíos cuando no hubo).
  promotion_applied_id?: string;
  promotion_name?: string;
  promotion_kind?: string;
  promotion_extra_days?: number;
  promotion_gifted_membership_ids?: string[];
}

export interface SettleBalanceInput {
  idempotency_key: string;
  amount: number;
  payment_method: PaymentMethod;
  cash_drawer_id?: string;
  payment_date?: string;
  notes?: string;
}

export interface RegisterOtherIncomeInput {
  cash_destination?: "cash_drawer" | "gym_fund";
  amount: number;
  payment_method: PaymentMethod;
  cash_drawer_id?: string;
  payment_date: string;
  description: string;
  // Se conserva durante todos los reintentos del mismo intento de captura.
  // El backend deriva el payment_id de esta llave para no duplicar ingresos
  // cuando la respuesta se pierde o el sidecar reenvía la petición.
  idempotency_key: string;
}

export function useRegisterOtherIncome() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterOtherIncomeInput) =>
      api.post<{ payment_id: string; folio: string; amount: number }>("/api/v1/payments/other", input),
    onSuccess: () => invalidateMember(qc, null),
  });
}

// Espeja settleResp del backend (payment_controller.go).
export interface SettleBalanceResponse {
  settlement_id: string;
  folio: string;
  new_balance_pending: number;
}

export type RefundMoneyReturn = PaymentMethod;

// RefundInput espeja refundReq del backend (payment_controller.go). El FE
// El método representa una devolución monetaria real. Cancelar un servicio o
// corregir un registro sin devolver dinero es otra acción y nunca crea Refund.
export interface RefundInput {
  reason: string;
  payment_method: PaymentMethod;
  cash_drawer_id?: string;
  amount: number;
  payment_date: string;
  revert_membership?: boolean;
  idempotency_key: string;
}

export interface RefundPreview {
  selected_payment_id: string;
  root_payment_id: string;
  selected_refundable: number;
  aggregate_collected: number;
  aggregate_refunded: number;
  aggregate_refundable: number;
  balance_pending: number;
  revert_membership_total: number;
  membership_revert_allowed: boolean;
  membership_revert_block_reason?: string;
}

export interface PaymentHistoryFilters {
  concept?: PaymentConcept | "";
  from?: string;
  to?: string;
}

export interface PaymentHistoryResponse {
  items: Payment[];
  total_pending: number;
}

export interface GymPaymentsFilters {
  concept?: PaymentConcept | "";
  from?: string;
  to?: string;
  page?: number;
  page_size?: number;
}

export interface GymPaymentsResponse {
  items: Payment[];
  total: number;
  page: number;
  page_size: number;
  // total_paid es NETO del set filtrado completo (las devoluciones restan) y
  // se calcula server-side sobre TODA la ventana, no la página visible.
  // refund_total es la magnitud devuelta; los por-método son netos.
  total_paid: number;
  refund_total: number;
  cash_total: number;
  transfer_total: number;
  card_total: number;
}

export interface SendReceiptInput {
  channel?: "whatsapp" | "email";
  to?: string;
}

const KEYS = {
  history: (memberID: string, filters: PaymentHistoryFilters) =>
    ["billing", "history", memberID, filters] as const,
  receipt: (paymentID: string) => ["billing", "receipt", paymentID] as const,
};

function invalidateMember(qc: ReturnType<typeof useQueryClient>, memberID?: string | null) {
  qc.invalidateQueries({ queryKey: ["billing"] });
  qc.invalidateQueries({ queryKey: ["members"] });
  // Todo cobro/venta/devolución mueve los KPIs del dashboard y de
  // Reportes (ingresos, egresos con devoluciones, utilidad, top socios) —
  // sin esto el operador cobraba y el dashboard seguía mostrando lo viejo
  // hasta 60s de staleTime.
  qc.invalidateQueries({ queryKey: ["reports"] });
  qc.invalidateQueries({ queryKey: ["dashboard"] });
  qc.invalidateQueries({ queryKey: ["cash-close"] });
  qc.invalidateQueries({ queryKey: ["analytics"] });
  if (memberID) qc.invalidateQueries({ queryKey: ["billing", "history", memberID] });
}

export function useRegisterMembershipPayment() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RegisterMembershipPaymentInput) =>
      api.post<RegisterMembershipPaymentResponse>("/api/v1/payments/membership", input),
    onSuccess: (res, vars) => invalidateMember(qc, vars.member_id),
  });
}

export function useSettleBalance(paymentID: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: SettleBalanceInput) =>
      api.post<SettleBalanceResponse>(`/api/v1/payments/${paymentID}/settle`, input),
    // settleResp del backend no incluye member_id. Como no sabemos a
    // qué socio pertenece el pago padre desde acá, invalidamos las
    // claves de billing + members globalmente — react-query refetch
    // sólo las queries actualmente montadas, así que el costo es nulo
    // si no hay nadie suscrito.
    onSuccess: () => invalidateMember(qc, null),
  });
}

// refundResp del backend devuelve {refund_id, folio, amount, reverted_membership} —
// NO Payment ni member_id. Tipamos amplio + invalidación global para no
// crashear el onSuccess.
export interface RefundResponse {
  refund_id: string;
  folio: string;
  amount: number;
  reverted_membership: boolean;
  balance_cancelled?: number;
}

export function useRefundPreview(
  paymentID: string | null | undefined,
  enabled = true,
) {
  return useQuery<RefundPreview>({
    queryKey: ["billing", "refund-preview", paymentID ?? ""],
    queryFn: () =>
      api.get<RefundPreview>(`/api/v1/payments/${paymentID}/refund-preview`),
    enabled: enabled && !!paymentID,
    staleTime: 0,
  });
}

export function useRefund(paymentID: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RefundInput) =>
      api.post<RefundResponse>(`/api/v1/payments/${paymentID}/refund`, input),
    onSuccess: () => invalidateMember(qc, null),
  });
}

/**
 * Corrects capture facts for a root membership/other-income payment. Product
 * sales and balance settlements intentionally use their own consequence-aware
 * flows, so callers must not expose this mutation for those concepts.
 */
export function useCorrectPayment(paymentID: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PaymentCorrectionInput) =>
      api.post<PaymentCorrectionResponse>(
        `/api/v1/payments/${paymentID}/corrections`,
        input,
      ),
    onSuccess: () => invalidateMember(qc, null),
  });
}

export function usePaymentCorrectionHistory(
  paymentID: string | null | undefined,
  enabled = true,
) {
  return useQuery<PaymentCorrectionHistoryResponse>({
    queryKey: ["billing", "payment-corrections", paymentID ?? ""],
    queryFn: () =>
      api.get<PaymentCorrectionHistoryResponse>(
        `/api/v1/payments/${paymentID}/corrections`,
      ),
    enabled: enabled && !!paymentID,
    staleTime: 0,
  });
}

export function useSendReceipt(paymentID: string) {
  return useMutation({
    // La respuesta real del BE es {status, note}: queued / already_pending
    // / skipped — el caller decide el toast con notifySendReceiptOutcome
    // (el tipo viejo {ok, channel, sent_at} nunca existió en el wire).
    mutationFn: (input?: SendReceiptInput) =>
      api.post<{ status: string; note?: string }>(
        `/api/v1/payments/${paymentID}/send-receipt`,
        input ?? {}
      ),
  });
}

function cleanFilters(filters: PaymentHistoryFilters): PaymentHistoryFilters {
  return {
    concept: filters.concept || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
  };
}

export function usePaymentHistory(
  memberID: string | null | undefined,
  filters: PaymentHistoryFilters
) {
  const cleaned = cleanFilters(filters);
  return useQuery<PaymentHistoryResponse>({
    queryKey: KEYS.history(memberID || "", cleaned),
    queryFn: () =>
      api.get<PaymentHistoryResponse>(`/api/v1/members/${memberID}/payments`, {
        query: {
          concept: cleaned.concept,
          from: cleaned.from,
          to: cleaned.to,
        },
      }),
    enabled: !!memberID,
  });
}

// useGymPayments lists every payment of the gym in a given window. Used by
// the Cobros screen as a global timeline + day-total. Defaults backend-side
// to "today" when from/to are omitted.
export function useGymPayments(filters: GymPaymentsFilters) {
  const cleaned: Record<string, string | number> = {};
  if (filters.concept) cleaned.concept = filters.concept;
  if (filters.from) cleaned.from = filters.from;
  if (filters.to) cleaned.to = filters.to;
  if (filters.page) cleaned.page = filters.page;
  if (filters.page_size) cleaned.page_size = filters.page_size;
  return useQuery<GymPaymentsResponse>({
    queryKey: ["billing", "gym-payments", cleaned],
    queryFn: () => api.get<GymPaymentsResponse>("/api/v1/payments", { query: cleaned }),
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useReceiptPdf(paymentID: string | null | undefined) {
  const query = useQuery<Blob>({
    queryKey: KEYS.receipt(paymentID || ""),
    queryFn: async () => {
      const res = await api.blob(`/api/v1/payments/${paymentID}/receipt.pdf`);
      return res.blob;
    },
    enabled: !!paymentID,
    staleTime: 30_000,
    gcTime: 60_000,
  });

  const objectUrl = useMemo(() => {
    if (!query.data) return null;
    return URL.createObjectURL(query.data);
  }, [query.data]);

  useEffect(() => {
    return () => {
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [objectUrl]);

  return { ...query, objectUrl };
}

export function fmtMoney(amount: number | null | undefined): string {
  // El backend puede mandar `null`/ausente para totales en días sin
  // actividad (p.ej. caja del día sin movimientos). Sin este guard
  // `Math.abs(undefined)` → NaN → la UI mostraba "$NaN".
  const n = typeof amount === "number" && Number.isFinite(amount) ? amount : 0;
  const sign = n < 0 ? "-" : "";
  const v = Math.abs(n);
  return `${sign}$${v.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
