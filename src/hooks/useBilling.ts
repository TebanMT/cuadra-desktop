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
  id: string;
  gym_id: string;
  member_id: string;
  member_name?: string | null;
  amount: number;
  payment_method: PaymentMethod | null;
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

export interface RegisterMembershipPaymentInput {
  member_id: string;
  membership_type_id: string;
  payment_method: PaymentMethod;
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
}

export interface SettleBalanceInput {
  amount: number;
  payment_method: PaymentMethod;
  payment_date?: string;
  notes?: string;
}

// Espeja settleResp del backend (payment_controller.go).
export interface SettleBalanceResponse {
  settlement_id: string;
  folio: string;
  new_balance_pending: number;
}

export type RefundMoneyReturn = "cash" | "transfer" | "none";

// RefundInput espeja refundReq del backend (payment_controller.go). El FE
// usa una abstracción "money_returned" (cash/transfer/none) en la UI; el
// modal lo mapea a `payment_method` antes de enviarlo. Para el caso
// "none" (no se devuelve dinero, ej. cortesía) usa el método del pago
// original — la auditoría queda con "refund de pago en X" aunque no
// haya salido cash.
export interface RefundInput {
  reason: string;
  payment_method: PaymentMethod;
  revert_membership?: boolean;
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
  total_paid: number;
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
}

export function useRefund(paymentID: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RefundInput) =>
      api.post<RefundResponse>(`/api/v1/payments/${paymentID}/refund`, input),
    onSuccess: () => invalidateMember(qc, null),
  });
}

export function useSendReceipt(paymentID: string) {
  return useMutation({
    mutationFn: (input?: SendReceiptInput) =>
      api.post<{ ok: true; channel: string; sent_at: string }>(
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
