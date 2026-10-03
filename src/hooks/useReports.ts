import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
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

export interface FinancialIntegrity {
  status: "complete" | "incomplete";
  warnings?: string[];
  issues?: string[];
  missing_purchase_amount_count?: number;
  unclassified_income_count?: number;
  unclassified_cash_out_count?: number;
  invalid_cash_in_classification_count?: number;
  legacy_cash_source_unverified_count?: number;
  legacy_purchase_count?: number;
  legacy_refund_count?: number;
  legacy_review_count?: number;
  legacy_unlinked_purchases?: number;
  unclassified_cash_out?: number;
  unknown_refund_disposition?: number;
  product_cost_coverage_pct?: number | null;
  calculated_at?: string;
  data_watermark?: string;
}

export interface CashRangeReconciliation {
  complete?: boolean;
  status?: "complete" | "incomplete" | "stale";
  // Contrato canónico de sesiones. Todos los importes son flujos salvo
  // latest_counted, que es el ÚLTIMO saldo físico y nunca se suma.
  cash_activity?: number;
  withdrawn?: number;
  period_activity?: number;
  period_withdrawn?: number;
  latest_session_id?: string | null;
  latest_expected?: number | null;
  latest_counted?: number | null;
  latest_difference?: number | null;
  latest_counted_at?: string | null;
  /** Effective status of the latest physical session. */
  latest_status?: "open" | "closed_unverified" | "reconciled" | "stale" | "withdrawn" | null;
  latest_needs_recount?: boolean;
  difference?: number | null;
  active_days?: number;
  missing_active_days?: number;
  uncovered_activity_days?: number;
  historical_activity_days?: number;
  historical_sessions?: number;
  requires_attention?: boolean;
  open_sessions?: number;
  closed_unverified_sessions?: number;
  reconciled_sessions?: number;
  stale_sessions?: number;
  withdrawn_sessions?: number;
  unknown_opening_sessions?: number;
  adjusted_after_withdrawal_sessions?: number;
  legacy_cash_source_unverified_count?: number;
  active_sessions?: number;
  total_sessions?: number;
  // Shape legado. Se conserva únicamente para detectar capacidades de un
  // sidecar anterior; la UI no interpreta la suma de counted como saldo.
  counted?: number;
  counted_closes?: number;
  total_closes?: number;
}

export interface ProductProfitabilityRow {
  product_id: string;
  product_name: string;
  quantity: number;
  revenue: number;
  cogs: number;
  gross_profit: number;
  margin_pct: number | null;
  cost_complete: boolean;
}

export interface ProductProfitability {
  status: "complete" | "incomplete";
  items_with_cost: number;
  items_total: number;
  rows: ProductProfitabilityRow[];
}

export interface DashboardData {
  local_date?: string;
  timezone?: string;
  previous_from?: string;
  previous_to?: string;
  active_members: KpiTrend;
  // ── KPIs de dinero del MES — owner-only ──────────────────────────────
  // El BE los OMITE para operadores (wire role-aware, plan Reports-improve
  // transversal §2): ausente = "no es tuyo", no cero. Por eso son
  // opcionales; el FE además los oculta con can("view_money_kpis").
  income_month?: KpiTrend;
  // Alias de compatibilidad para clientes Plus antiguos. Las superficies
  // Standard no lo solicitan ni renderizan; la rentabilidad canónica vive en
  // product_profitability dentro de Análisis.
  // realized_profit_coverage es la cobertura
  // honesta ("X de Y líneas con costo").
  realized_profit_month?: KpiTrend;
  realized_profit_coverage?: { items_with_cost: number; items_total: number };
  // Margen de la utilidad del mes: utilidad / ingreso por productos × 100.
  // null cuando no hubo ventas de productos en el rango.
  realized_profit_margin_pct?: number | null;
  // Salidas del mes: gastos pagados + compras pagadas para reventa +
  // devoluciones económicas, con la misma definición que Reportes.
  expenses_month?: KpiTrend;
  period_result_month?: KpiTrend;
  membership_income_month?: KpiTrend;
  product_income_month?: KpiTrend;
  other_income_month?: KpiTrend;
  unclassified_income_month?: KpiTrend;
  operating_expenses_month?: KpiTrend;
  inventory_purchases_month?: KpiTrend;
  refunds_month?: KpiTrend;
  generated_at?: string;
  data_watermark?: string;
  sync_pending?: boolean;
  integrity?: FinancialIntegrity;
  income_30d?: { date: string; total: number }[];
  // ── Operacional (ambos roles) ────────────────────────────────────────
  // Check-ins de HOY (día local del gym) — pieza del home operacional.
  // Opcional por compat con sidecars viejos que aún no lo mandan.
  checkins_today?: number;
  expiring_week: KpiTrend;
  recoverable: KpiTrend;
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
    // Productos de la venta ("Agua 1L ×2") — título para ventas walk-in.
    sale_summary?: string;
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
  previous_from?: string;
  previous_to?: string;
  period: ReportPeriod;
  from: string;
  to: string;
  calculated_at?: string;
  data_watermark?: string;
  sync_pending?: boolean;
  detail_metadata?: {
    inventory_costs: { returned: number; limit?: number; truncated: boolean };
    expenses: { returned: number; limit?: number; truncated: boolean };
  };
  // Conciliación de los cortes cerrados del período. `difference` sólo
  // existe cuando todos los cortes tienen conteo de efectivo.
  cash_reconciliation?: CashRangeReconciliation;
  integrity?: FinancialIntegrity;
  // Contrato agrupado v2. Facilita validar las dos ecuaciones sin depender
  // de aliases y convive una versión con los totals planos.
  income?: {
    total: KpiTrend;
    memberships: KpiTrend;
    products: KpiTrend;
    other: KpiTrend;
    unclassified: KpiTrend;
  };
  outflows?: {
    total: KpiTrend;
    operating_expenses: KpiTrend;
    inventory_purchases: KpiTrend;
    refunds: KpiTrend;
  };
  period_result?: KpiTrend;
  // Cada total surface como KPI {value, delta, delta_pct} para que los
  // StatCards puedan renderear deltas vs ventana previa. La ventana
  // previa se calcula server-side: para month/last_month usa el mes
  // calendario anterior; para todo lo demás un shift fijo del mismo
  // largo terminando un día antes de `from`.
  totals: {
    income: KpiTrend;
    // Contrato canónico ADR-011. Son opcionales durante una versión para
    // aceptar cloud/sidecars anteriores sin fabricar ceros.
    membership_income?: KpiTrend;
    product_income?: KpiTrend;
    unclassified_income?: KpiTrend;
    operating_expenses?: KpiTrend;
    inventory_purchases?: KpiTrend;
    outflows?: KpiTrend;
    period_result?: KpiTrend;
    other_income: KpiTrend;
    new_members: KpiTrend;
    checkins: KpiTrend;
    refunds: KpiTrend;
    inventory_cost: KpiTrend;
    expenses_general: KpiTrend;
    // Aliases legados; las superficies nuevas no los usan.
    net: KpiTrend;
    cogs: KpiTrend;
    // Alias legado de net_result.
    operating_result: KpiTrend;
    // Alias legado de cash_from_closes.
    cash_flow: KpiTrend;
    // income − inventory_cost − expenses_general − refunds.
    net_result: KpiTrend;
    // Efectivo operativo calculado en los cortes cerrados del rango.
    cash_from_closes: KpiTrend;
    cogs_coverage: { items_with_cost: number; items_total: number };
    coverage_warnings: string[];
  };
  product_sales: {
    amount: KpiTrend;
    units: number;
  };
  product_profitability?: ProductProfitability;
  income_by_day: { date: string; total: number }[];
  expenses_by_day: { date: string; total: number }[];
  checkins_by_day: { date: string; count: number }[];
  income_by_method: Record<PaymentMethod, number>;
  income_by_membership_type: Record<string, number>;
  members_by_membership_type: Record<string, number>;
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
  // Snapshot del catálogo: cuántos productos están sin existencias vs por
  // debajo del mínimo. No varía con el período.
  critical_stock: {
    out_count: number;
    low_count: number;
  };
  recent_payments: {
    id: string;
    member_name: string;
    sale_summary?: string;
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
  paid_from?: "cash_drawer" | "gym_fund" | "external";
}

// Las keys incluyen el día LOCAL: un período nombrado ("month", "today")
// resuelve a fechas distintas después de medianoche, y sin el día en la key
// una pantalla abierta seguía sirviendo el "Hoy" de ayer.
const KEYS = {
  dashboard: () => ["reports", "dashboard", todayIso()] as const,
  attention: () => ["reports", "attention", todayIso()] as const,
  range: (period: ReportPeriod, from?: string, to?: string) =>
    ["reports", "range", period, from ?? "", to ?? "", todayIso()] as const,
};

export function useDashboard() {
  return useQuery<DashboardData>({
    queryKey: KEYS.dashboard(),
    queryFn: () => api.get<DashboardData>("/api/v1/dashboard"),
    staleTime: 60_000,
    refetchInterval: 60_000,
  });
}

export function useAttentionRequired() {
  return useQuery<AttentionData>({
    queryKey: KEYS.attention(),
    queryFn: () => api.get<AttentionData>("/api/v1/attention-required"),
    staleTime: 30_000,
  });
}

export function useReportsRange(period: ReportPeriod, from?: string, to?: string, allowed = true) {
  const enabled = allowed && (period !== "custom" || (!!from && !!to));
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
