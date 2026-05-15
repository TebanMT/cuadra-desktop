import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentMethod } from "./useBilling";

export type ReportPeriod =
  | "today"
  | "week"
  | "month"
  | "last_month"
  | "3_months"
  | "year"
  | "custom";
export type ExportType =
  | "members"
  | "payments"
  | "sales"
  | "cash_close"
  | "attention_required"
  | "period_summary";
export type ExportFormat = "pdf" | "xlsx";

export interface KpiTrend {
  value: number;
  delta: number | null;
  delta_pct: number | null;
}

export interface DashboardData {
  active_members: KpiTrend;
  income_month: KpiTrend;
  // Egresos del mes: AGREGADO de mercancía (stock_movements restock con
  // costo) + gastos generales (BC expenses). El hint del StatCard
  // aclara "Mercancía + otros". El desglose por fuente vive (por ahora)
  // solo en backend.
  expenses_month: KpiTrend;
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
  // Cada total surface como KPI {value, delta, delta_pct} para que los
  // StatCards puedan renderear deltas vs ventana previa. La ventana
  // previa se calcula server-side: para month/last_month usa el mes
  // calendario anterior; para todo lo demás un shift fijo del mismo
  // largo terminando un día antes de `from`.
  totals: {
    income: KpiTrend;
    new_members: KpiTrend;
    checkins: KpiTrend;
    refunds: KpiTrend;
    inventory_cost: KpiTrend;
    expenses_general: KpiTrend;
    // Net = income − inventory_cost − expenses_general. Calculado
    // server-side sobre ambas ventanas para que el delta tenga sentido.
    net: KpiTrend;
  };
  income_by_day: { date: string; total: number }[];
  expenses_by_day: { date: string; total: number }[];
  checkins_by_day: { date: string; count: number }[];
  income_by_method: Record<PaymentMethod, number>;
  // Gastos generales agrupados por categoría del enum (renta,
  // servicios, sueldos, …). No incluye compras de mercancía.
  expenses_by_category: Record<string, number>;
  top_members: {
    member_id: string;
    full_name: string;
    total_paid: number;
    payments_count: number;
  }[];
  top_products: TopProductRow[];
  inventory_costs: InventoryCostMovement[];
  expenses: ExpenseRow[];
  // Snapshot del catálogo: cuántos productos están sin stock vs por
  // debajo del mínimo. No varía con el período.
  critical_stock: {
    out_count: number;
    low_count: number;
  };
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

export interface TopProductRow {
  product_id: string;
  product_name: string;
  quantity: number;
  revenue: number;
}

export interface InventoryCostMovement {
  movement_id: string;
  product_id: string;
  product_name: string;
  delta: number; // unidades recibidas
  cost_unit: number; // costo unitario (moneda)
  cost_total: number; // cost_unit * delta — precomputado
  reason?: string | null;
  occurred_at: string; // RFC3339
}

export interface ExpenseRow {
  id: string;
  expense_date: string; // YYYY-MM-DD
  amount: number;
  category: string;
  description?: string | null;
  payment_method: string;
}

const KEYS = {
  dashboard: () => ["reports", "dashboard"] as const,
  attention: () => ["reports", "attention"] as const,
  range: (period: ReportPeriod, from?: string, to?: string) =>
    ["reports", "range", period, from ?? "", to ?? ""] as const,
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

export function useReportsRange(period: ReportPeriod, from?: string, to?: string) {
  const enabled = period !== "custom" || (!!from && !!to);
  return useQuery<ReportsRangeData>({
    queryKey: KEYS.range(period, from, to),
    queryFn: () => {
      const query: Record<string, string> = { period };
      if (period === "custom" && from) query.from = from;
      if (period === "custom" && to) query.to = to;
      return api.get<ReportsRangeData>("/api/v1/reports", { query });
    },
    staleTime: 30_000,
    enabled,
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

