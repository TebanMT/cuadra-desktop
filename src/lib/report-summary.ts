import type { KpiTrend, ReportsRangeData } from "@/hooks/useReports";
import { financialResultIsPartial } from "@/lib/expensesOverview";
type ReportMoneyMetric = {
  value?: number;
  current?: number;
  previous?: number;
  delta?: number | null;
  delta_pct?: number | null;
};
const sumMap = (map?: Record<string, number>) =>
  Object.values(map ?? {}).reduce((sum, value) => sum + value, 0);
export function reportSummary(data: ReportsRangeData) {
  const totals = data.totals;
  const income = normalizeReportMetric(data.income?.total) ?? totals.income;
  const operatingExpenses =
    normalizeReportMetric(data.outflows?.operating_expenses) ??
    normalizeReportMetric(totals.operating_expenses) ??
    normalizeReportMetric(totals.expenses_general);
  const inventoryPurchases =
    normalizeReportMetric(data.outflows?.inventory_purchases) ??
    normalizeReportMetric(totals.inventory_purchases) ??
    normalizeReportMetric(totals.inventory_cost);
  const refunds =
    normalizeReportMetric(data.outflows?.refunds) ??
    normalizeReportMetric(totals.refunds);
  const outflows =
    normalizeReportMetric(data.outflows?.total) ??
    normalizeReportMetric(totals.outflows) ??
    combineTrends([operatingExpenses, inventoryPurchases, refunds]);
  const periodResult =
    normalizeReportMetric(data.period_result) ??
    normalizeReportMetric(totals.period_result) ??
    normalizeReportMetric(totals.net_result) ??
    normalizeReportMetric(totals.net) ??
    normalizeReportMetric(totals.operating_result);
  const membershipIncome =
    normalizeReportMetric(data.income?.memberships) ??
    normalizeReportMetric(totals.membership_income) ??
    valueOnlyTrend(sumMap(data.income_by_membership_type));
  const productIncome =
    normalizeReportMetric(data.income?.products) ??
    normalizeReportMetric(totals.product_income) ??
    data.product_sales?.amount;
  const otherIncome =
    normalizeReportMetric(data.income?.other) ??
    normalizeReportMetric(totals.other_income);
  const unclassifiedIncome =
    normalizeReportMetric(data.income?.unclassified) ??
    normalizeReportMetric(totals.unclassified_income) ??
    deriveUnclassifiedIncome(
      income,
      membershipIncome,
      productIncome,
      otherIncome,
    );
  const hasCanonicalSummary =
    (!!data.income && !!data.outflows && !!data.period_result) ||
    (!!totals.outflows && !!totals.period_result);
  const formulaDifference =
    outflows && periodResult
      ? income.value - outflows.value - periodResult.value
      : null;
  const resultIsPartial = financialResultIsPartial({
    canonical: hasCanonicalSummary,
    integrity: data.integrity,
    income: income.value,
    outflows: outflows?.value,
    result: periodResult?.value,
  });

  return {
    income,
    operatingExpenses,
    inventoryPurchases,
    refunds,
    outflows,
    periodResult,
    membershipIncome,
    productIncome,
    otherIncome,
    unclassifiedIncome,
    hasCanonicalSummary,
    formulaDifference,
    resultIsPartial,
  };
}
export function normalizeReportMetric(
  metric?: ReportMoneyMetric,
): KpiTrend | undefined {
  const value = metric?.value ?? metric?.current;
  if (value == null) return undefined;
  const delta = metric?.delta ?? null;
  const previous = metric?.previous;
  const deltaPct =
    metric?.delta_pct ??
    (delta == null || previous == null || previous === 0
      ? null
      : (delta / Math.abs(previous)) * 100);
  return { value, delta, delta_pct: deltaPct };
}

function combineTrends(
  metrics: (KpiTrend | undefined)[],
): KpiTrend | undefined {
  if (metrics.some((metric) => !metric)) return undefined;
  const present = metrics as KpiTrend[];
  const value = present.reduce((sum, metric) => sum + metric.value, 0);
  if (present.some((metric) => metric.delta == null)) {
    return { value, delta: null, delta_pct: null };
  }
  const delta = present.reduce((sum, metric) => sum + (metric.delta ?? 0), 0);
  const previous = value - delta;
  return {
    value,
    delta,
    delta_pct: previous === 0 ? null : (delta / Math.abs(previous)) * 100,
  };
}

function valueOnlyTrend(value: number): KpiTrend {
  return { value, delta: null, delta_pct: null };
}

function deriveUnclassifiedIncome(
  income: KpiTrend,
  membership?: KpiTrend,
  product?: KpiTrend,
  other?: KpiTrend,
): KpiTrend | undefined {
  if (!membership || !product || !other) return undefined;
  const value = income.value - membership.value - product.value - other.value;
  return valueOnlyTrend(Math.abs(value) < 0.01 ? 0 : value);
}
