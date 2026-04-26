import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentMethod } from "./useBilling";

export type ReportPeriod = "today" | "week" | "month" | "last_month" | "3_months" | "year";
export type ExportType =
  | "members"
  | "payments"
  | "sales"
  | "cash_close"
  | "attention_required";
export type ExportFormat = "pdf" | "xlsx";

export interface KpiTrend {
  value: number;
  delta: number | null;
  delta_pct: number | null;
}

export interface DashboardData {
  active_members: KpiTrend;
  income_month: KpiTrend;
  expiring_week: KpiTrend;
  recoverable: KpiTrend;
  income_30d: { date: string; total: number }[];
  attention_summary: {
    expiring_soon: number;
    expired_recoverable: number;
    inactive_involuntary: number;
    low_stock: number;
    pending_balance: number;
    birthdays_today: number;
  };
  recent_payments: {
    id: string;
    member_name: string;
    amount: number;
    payment_method: PaymentMethod | null;
    payment_date: string;
    concept: string;
  }[];
  cash_today: {
    total: number;
    by_method: Record<PaymentMethod, number>;
  };
}

export type AttentionCategory =
  | "expiring_soon"
  | "expired_recoverable"
  | "inactive_involuntary"
  | "low_stock"
  | "pending_balance"
  | "birthdays_today";

export interface AttentionExpiringMember {
  member_id: string;
  full_name: string;
  phone: string;
  expiry_date: string;
  days_until_expiry: number;
  membership_type: string;
  last_contact_attempt_at?: string | null;
}

export interface AttentionExpiredMember extends AttentionExpiringMember {
  days_overdue: number;
  contact_attempts_count: number;
}

export interface AttentionInactiveMember {
  member_id: string;
  full_name: string;
  phone: string;
  last_visit_at: string | null;
  days_since_visit: number;
}

export interface AttentionLowStockProduct {
  product_id: string;
  name: string;
  stock: number;
  min_stock: number;
}

export interface AttentionPendingBalance {
  member_id: string;
  full_name: string;
  phone: string;
  balance: number;
  payment_id: string;
  due_since: string;
}

export interface AttentionBirthday {
  member_id: string;
  full_name: string;
  phone: string;
  age: number;
}

export interface AttentionData {
  expiring_soon: AttentionExpiringMember[];
  expired_recoverable: AttentionExpiredMember[];
  inactive_involuntary: AttentionInactiveMember[];
  low_stock: AttentionLowStockProduct[];
  pending_balance: AttentionPendingBalance[];
  birthdays_today: AttentionBirthday[];
}

export interface ReportsRangeData {
  period: ReportPeriod;
  from: string;
  to: string;
  totals: {
    income: number;
    new_members: number;
    checkins: number;
    refunds: number;
  };
  income_by_day: { date: string; total: number }[];
  checkins_by_day: { date: string; count: number }[];
  income_by_method: Record<PaymentMethod, number>;
  top_members: {
    member_id: string;
    full_name: string;
    total_paid: number;
    payments_count: number;
  }[];
  recent_payments: {
    id: string;
    member_name: string;
    amount: number;
    concept: string;
    payment_method: PaymentMethod | null;
    payment_date: string;
  }[];
  attention_required_count: number;
}

export interface ContactAttemptInput {
  channel: "whatsapp" | "phone" | "in_person" | "other";
  note?: string;
}

const KEYS = {
  dashboard: () => ["reports", "dashboard"] as const,
  attention: () => ["reports", "attention"] as const,
  range: (period: ReportPeriod) => ["reports", "range", period] as const,
};

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: KEYS.dashboard(),
    queryFn: () => api.get<DashboardData>("/api/v1/dashboard"),
    staleTime: 60_000,
  });
}

export function useAttentionRequired() {
  return useQuery<AttentionData>({
    queryKey: KEYS.attention(),
    queryFn: () => api.get<AttentionData>("/api/v1/attention-required"),
    staleTime: 30_000,
  });
}

export function useReportsRange(period: ReportPeriod) {
  return useQuery<ReportsRangeData>({
    queryKey: KEYS.range(period),
    queryFn: () => api.get<ReportsRangeData>("/api/v1/reports", { query: { period } }),
    staleTime: 30_000,
  });
}

export async function fetchExport(
  type: ExportType,
  format: ExportFormat,
  params: { from?: string; to?: string; period?: ReportPeriod } = {}
) {
  return api.blob(`/api/v1/reports/${type}/export`, {
    format,
    from: params.from,
    to: params.to,
    period: params.period,
  });
}

export function useMarkContactAttempt(memberID: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ContactAttemptInput) =>
      api.post<{ id: string; created_at: string }>(
        `/api/v1/members/${memberID}/contact-attempts`,
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useMarkLost(memberID: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input?: { reason?: string }) =>
      api.post<{ ok: true }>(`/api/v1/members/${memberID}/mark-lost`, input ?? {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["reports"] });
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}
