import type { CashRangeReconciliation, KpiTrend, ReportsRangeData } from "@/hooks/useReports";

const cents = (value: number) => Math.round((Number.isFinite(value) ? value : 0) * 100);
const money = (valueInCents: number) => valueInCents / 100;

function pct(value: number, delta: number | null): number | null {
  if (delta == null) return null;
  const previous = cents(value) - cents(delta);
  return previous === 0 ? null : ((cents(delta) / previous) * 100);
}

export function sumTrends(parts: KpiTrend[]): KpiTrend {
  const value = money(parts.reduce((sum, part) => sum + cents(part.value), 0));
  const delta = parts.every((part) => part.delta != null)
    ? money(parts.reduce((sum, part) => sum + cents(part.delta ?? 0), 0))
    : null;
  return { value, delta, delta_pct: pct(value, delta) };
}

export interface CanonicalFinancialSummary {
  income: KpiTrend;
  membershipIncome: KpiTrend;
  productIncome: KpiTrend;
  otherIncome: KpiTrend;
  unclassifiedIncome: KpiTrend;
  operatingExpenses: KpiTrend;
  inventoryPurchases: KpiTrend;
  refunds: KpiTrend;
  outflows: KpiTrend;
  periodResult: KpiTrend;
  integrity: {
    status: "complete" | "incomplete";
    warnings: string[];
    missingPurchaseAmountCount: number;
    unclassifiedCashOutCount: number;
    legacyCashSourceUnverifiedCount: number;
    legacyReviewCount: number;
    unknownRefundDispositionCount: number;
    productCostCoveragePct: number | null;
    calculatedAt?: string;
    dataWatermark?: string;
    syncPending: boolean;
  };
  legacyFallback: boolean;
}

const zeroTrend = (): KpiTrend => ({ value: 0, delta: null, delta_pct: null });

export function canonicalFinancialSummary(data: ReportsRangeData): CanonicalFinancialSummary {
  const canonical = Boolean(
    (data.income && data.outflows && data.period_result) ||
      (data.totals.period_result && data.totals.outflows),
  );
  const membershipValue = Object.values(data.income_by_membership_type).reduce(
    (sum, value) => sum + cents(value),
    0,
  );
  const membershipIncome =
    data.income?.memberships ??
    data.totals.membership_income ??
    ({ value: money(membershipValue), delta: null, delta_pct: null } satisfies KpiTrend);
  const productIncome = data.income?.products ?? data.totals.product_income ?? data.product_sales.amount;
  const otherIncome = data.income?.other ?? data.totals.other_income;
  const unclassifiedIncome =
    data.income?.unclassified ?? data.totals.unclassified_income ?? zeroTrend();
  const operatingExpenses =
    data.outflows?.operating_expenses ??
    data.totals.operating_expenses ??
    data.totals.expenses_general;
  const inventoryPurchases =
    data.outflows?.inventory_purchases ??
    data.totals.inventory_purchases ??
    data.totals.inventory_cost;
  const refunds = data.outflows?.refunds ?? data.totals.refunds;
  const outflows =
    data.outflows?.total ??
    data.totals.outflows ??
    sumTrends([operatingExpenses, inventoryPurchases, refunds]);
  const periodResult = data.period_result ?? data.totals.period_result ?? data.totals.net_result;
  const rawIntegrity = data.integrity;
  const integrity = {
    status: rawIntegrity?.status ?? (canonical ? "complete" : "incomplete"),
    warnings:
      rawIntegrity?.warnings ??
      rawIntegrity?.issues ??
      (canonical
        ? []
        : [
            "Actualiza Tinta para comprobar los cortes incluidos en este reporte.",
          ]),
    missingPurchaseAmountCount:
      rawIntegrity?.missing_purchase_amount_count ??
      rawIntegrity?.legacy_unlinked_purchases ??
      0,
    unclassifiedCashOutCount:
      rawIntegrity?.unclassified_cash_out_count ?? rawIntegrity?.unclassified_cash_out ?? 0,
    legacyCashSourceUnverifiedCount:
      rawIntegrity?.legacy_cash_source_unverified_count ?? 0,
    legacyReviewCount: rawIntegrity?.legacy_review_count ?? 0,
    unknownRefundDispositionCount: rawIntegrity?.unknown_refund_disposition ?? 0,
    productCostCoveragePct: rawIntegrity?.product_cost_coverage_pct ?? null,
    calculatedAt: data.calculated_at ?? rawIntegrity?.calculated_at,
    dataWatermark: data.data_watermark ?? rawIntegrity?.data_watermark,
    syncPending: data.sync_pending ?? false,
  } as const;

  return {
    income: data.income?.total ?? data.totals.income,
    membershipIncome,
    productIncome,
    otherIncome,
    unclassifiedIncome,
    operatingExpenses,
    inventoryPurchases,
    refunds,
    outflows,
    periodResult,
    integrity,
    legacyFallback: !canonical,
  };
}

export interface CanonicalCashSummary {
  requiresAttention: boolean;
  status: "complete" | "incomplete" | "stale";
  activity: number | null;
  withdrawn: number | null;
  latestSessionId: string | null;
  latestExpected: number | null;
  latestCounted: number | null;
  difference: number | null;
  latestCountedAt: string | null;
  activeDays: number;
  missingActiveDays: number;
  uncoveredActivityDays: number;
  openSessions: number;
  closedUnverifiedSessions: number;
  reconciledSessions: number;
  staleSessions: number;
  withdrawnSessions: number;
  unknownOpeningSessions: number;
  adjustedAfterWithdrawalSessions: number;
  legacyCashSourceUnverifiedCount: number;
  totalSessions: number;
  legacyFallback: boolean;
}

export function canonicalCashSummary(
  reconciliation: CashRangeReconciliation | undefined,
  legacyCashFromCloses: KpiTrend,
): CanonicalCashSummary {
  const canonical = reconciliation?.period_activity != null || reconciliation?.cash_activity != null;
  if (!canonical) {
    return {
      status: "incomplete",
      requiresAttention: true,
      // Es útil como compatibilidad, pero la UI lo rotula explícitamente
      // como actividad parcial: el contrato legado omite días sin corte.
      activity: reconciliation ? legacyCashFromCloses.value : null,
      withdrawn: null,
      latestSessionId: null,
      latestExpected: null,
      latestCounted: null,
      difference: null,
      latestCountedAt: null,
      activeDays: 0,
      missingActiveDays: 0,
      uncoveredActivityDays: 0,
      openSessions: 0,
      closedUnverifiedSessions: 0,
      reconciledSessions: reconciliation?.counted_closes ?? 0,
      staleSessions: 0,
      withdrawnSessions: 0,
      unknownOpeningSessions: 0,
      adjustedAfterWithdrawalSessions: 0,
      legacyCashSourceUnverifiedCount: 0,
      totalSessions: reconciliation?.total_closes ?? 0,
      legacyFallback: true,
    };
  }

  const latestStatus = reconciliation?.latest_status;
  const countedSessions =
    reconciliation?.reconciled_sessions ?? reconciliation?.counted_closes ?? 0;
  const totalSessions =
    reconciliation?.active_sessions ??
    reconciliation?.total_sessions ??
    reconciliation?.total_closes ??
    0;
  const derivedStatus: CanonicalCashSummary["status"] =
    reconciliation?.latest_needs_recount || latestStatus === "stale"
      ? "stale"
      : reconciliation?.status
        ? reconciliation.status
        : totalSessions > 0 &&
            countedSessions === totalSessions &&
            (latestStatus === "reconciled" || latestStatus === "withdrawn")
          ? "complete"
          : "incomplete";

  return {
    status: derivedStatus,
    requiresAttention: derivedStatus === "stale" || (reconciliation?.requires_attention ?? derivedStatus !== "complete"),
    activity: reconciliation?.period_activity ?? reconciliation?.cash_activity ?? null,
    withdrawn: reconciliation?.period_withdrawn ?? reconciliation?.withdrawn ?? null,
    latestSessionId: reconciliation?.latest_session_id ?? null,
    latestExpected: reconciliation?.latest_expected ?? null,
    latestCounted: reconciliation?.latest_counted ?? null,
    difference:
      derivedStatus === "stale"
        ? null
        : reconciliation?.latest_difference ?? reconciliation?.difference ?? null,
    latestCountedAt: reconciliation?.latest_counted_at ?? null,
    activeDays: reconciliation?.active_days ?? 0,
    missingActiveDays: reconciliation?.missing_active_days ?? 0,
    uncoveredActivityDays: reconciliation?.uncovered_activity_days ?? 0,
    openSessions: reconciliation?.open_sessions ?? (latestStatus === "open" ? 1 : 0),
    closedUnverifiedSessions:
      reconciliation?.closed_unverified_sessions ??
      (latestStatus === "closed_unverified" ? 1 : 0),
    reconciledSessions: countedSessions,
    staleSessions:
      reconciliation?.stale_sessions ??
      (reconciliation?.latest_needs_recount || latestStatus === "stale" ? 1 : 0),
    withdrawnSessions: reconciliation?.withdrawn_sessions ?? 0,
    unknownOpeningSessions: reconciliation?.unknown_opening_sessions ?? 0,
    adjustedAfterWithdrawalSessions:
      reconciliation?.adjusted_after_withdrawal_sessions ?? 0,
    legacyCashSourceUnverifiedCount:
      reconciliation?.legacy_cash_source_unverified_count ?? 0,
    totalSessions,
    legacyFallback: false,
  };
}

export function financialEquationHolds(summary: CanonicalFinancialSummary): boolean {
  return (
    cents(summary.periodResult.value) ===
    cents(summary.income.value) - cents(summary.outflows.value)
  );
}
