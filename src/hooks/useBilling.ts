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
  amount: number;
  discount_amount?: number;
  discount_reason?: string;
  partial_amount?: number;
  payment_date: string;
  notes?: string;
}

export interface RegisterMembershipPaymentResponse {
  payment: Payment;
  membership_id: string;
  new_expiry_date: string;
  balance_pending: number;
  pending_offline_sync?: boolean;
}

export interface SettleBalanceInput {
  amount: number;
  payment_method: PaymentMethod;
  payment_date?: string;
  notes?: string;
}

export interface SettleBalanceResponse {
  payment: Payment;
  remaining_balance: number;
}

export type RefundMoneyReturn = "cash" | "transfer" | "none";

export interface RefundInput {
  reason: string;
  revert_membership: boolean;
  money_returned: RefundMoneyReturn;
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
    onSuccess: (res) => invalidateMember(qc, res.payment.member_id),
  });
}

export function useRefund(paymentID: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: RefundInput) =>
      api.post<Payment>(`/api/v1/payments/${paymentID}/refund`, input),
    onSuccess: (res) => invalidateMember(qc, res.member_id),
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

export function fmtMoney(amount: number): string {
  const sign = amount < 0 ? "-" : "";
  const v = Math.abs(amount);
  return `${sign}$${v.toLocaleString("es-MX", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
