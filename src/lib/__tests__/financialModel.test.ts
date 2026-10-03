import { describe, expect, it } from "vitest";
import {
  canonicalCashSummary,
  canonicalFinancialSummary,
  financialEquationHolds,
  sumTrends,
} from "../financialModel";
import type { KpiTrend, ReportsRangeData } from "@/hooks/useReports";

const trend = (value: number, delta: number | null = null): KpiTrend => ({
  value,
  delta,
  delta_pct: null,
});

function fixture(): ReportsRangeData {
  return {
    period: "month",
    from: "2026-08-01",
    to: "2026-08-24",
    totals: {
      income: trend(415),
      membership_income: trend(400),
      product_income: trend(15),
      other_income: trend(0),
      unclassified_income: trend(0),
      operating_expenses: trend(1500),
      inventory_purchases: trend(50),
      refunds: trend(0),
      outflows: trend(1550),
      period_result: trend(-1135),
      new_members: trend(1),
      checkins: trend(0),
      inventory_cost: trend(50),
      expenses_general: trend(1500),
      net: trend(-1135),
      cogs: trend(5),
      operating_result: trend(-1135),
      cash_flow: trend(0),
      net_result: trend(-1135),
      cash_from_closes: trend(0),
      cogs_coverage: { items_with_cost: 1, items_total: 1 },
      coverage_warnings: [],
    },
    integrity: {
      status: "complete",
      warnings: [],
      missing_purchase_amount_count: 0,
      unclassified_cash_out_count: 0,
      legacy_review_count: 0,
    },
    product_sales: { amount: trend(15), units: 1 },
    income_by_day: [],
    expenses_by_day: [],
    checkins_by_day: [],
    income_by_method: { cash: 415, transfer: 0, card: 0 },
    income_by_membership_type: { Mensual: 400 },
    members_by_membership_type: {},
    expenses_by_category: {},
    top_members: [],
    top_products: [],
    inventory_costs: [],
    expenses: [],
    critical_stock: { out_count: 0, low_count: 0 },
    recent_payments: [],
    attention_required_count: 0,
  };
}

describe("modelo financiero canónico", () => {
  it("cuadra el caso $415 - $1,500 - $50 = -$1,135", () => {
    const summary = canonicalFinancialSummary(fixture());
    expect(summary.outflows.value).toBe(1550);
    expect(summary.periodResult.value).toBe(-1135);
    expect(financialEquationHolds(summary)).toBe(true);
  });

  it("suma tendencias en centavos sin arrastrar errores binarios", () => {
    expect(sumTrends([trend(0.1, 0.1), trend(0.2, 0.2)])).toMatchObject({
      value: 0.3,
      delta: 0.3,
    });
  });

  it("no presenta la suma legacy de conteos como último efectivo físico", () => {
    const summary = canonicalCashSummary(
      { counted: 1400, counted_closes: 7, total_closes: 7 },
      trend(3500),
    );
    expect(summary.legacyFallback).toBe(true);
    expect(summary.latestCounted).toBeNull();
    expect(summary.difference).toBeNull();
    expect(summary.activity).toBe(3500);
  });

  it("conserva como saldo únicamente el último conteo del contrato nuevo", () => {
    const summary = canonicalCashSummary(
      {
        status: "complete",
        period_activity: 500,
        period_withdrawn: 500,
        latest_session_id: "session-7",
        latest_expected: 700,
        latest_counted: 700,
        latest_difference: 0,
        latest_counted_at: "2026-08-24T23:00:00Z",
        active_days: 7,
        reconciled_sessions: 7,
        withdrawn_sessions: 7,
        total_sessions: 7,
      },
      trend(0),
    );
    expect(summary.latestCounted).toBe(700);
    expect(summary.activity).toBe(500);
    expect(summary.withdrawn).toBe(500);
    expect(summary.latestExpected).toBe(700);
    expect(summary.difference).toBe(0);
  });

  it("deriva cobertura del wire nuevo aunque no incluya el alias status", () => {
    const complete = canonicalCashSummary(
      {
        period_activity: 500,
        period_withdrawn: 500,
        latest_status: "withdrawn",
        latest_needs_recount: false,
        latest_expected: 700,
        latest_counted: 700,
        latest_difference: 0,
        counted_closes: 1,
        total_closes: 1,
      },
      trend(0),
    );
    expect(complete.status).toBe("complete");
    expect(complete.reconciledSessions).toBe(1);
    expect(complete.totalSessions).toBe(1);

    const stale = canonicalCashSummary(
      {
        period_activity: 515,
        period_withdrawn: 500,
        latest_status: "stale",
        latest_needs_recount: true,
        latest_expected: 715,
        latest_counted: 700,
        latest_difference: -15,
        counted_closes: 0,
        total_closes: 1,
      },
      trend(0),
    );
    expect(stale.status).toBe("stale");
    expect(stale.difference).toBeNull();
    expect(stale.staleSessions).toBe(1);
  });

  it("conserva los movimientos históricos sin exigir cortes retroactivos", () => {
    const summary = canonicalCashSummary({
      status: "incomplete", requires_attention: false,
      period_activity: 13811, period_withdrawn: 0,
      active_days: 5, historical_activity_days: 5,
      missing_active_days: 0, uncovered_activity_days: 0, total_sessions: 0,
    }, trend(0));
    expect(summary.requiresAttention).toBe(false);
    expect(summary.status).toBe("incomplete");
    expect(summary.activity).toBe(13811);
    expect(summary.difference).toBeNull();
  });

  it("conserva las causas exactas de una cobertura física incompleta", () => {
    const summary = canonicalCashSummary(
      {
        status: "incomplete",
        period_activity: 500,
        period_withdrawn: 0,
        active_days: 2,
        missing_active_days: 1,
        uncovered_activity_days: 1,
        unknown_opening_sessions: 1,
        adjusted_after_withdrawal_sessions: 1,
        total_sessions: 1,
      },
      trend(0),
    );
    expect(summary.status).toBe("incomplete");
    expect(summary.activeDays).toBe(2);
    expect(summary.missingActiveDays).toBe(1);
    expect(summary.uncoveredActivityDays).toBe(1);
    expect(summary.unknownOpeningSessions).toBe(1);
    expect(summary.adjustedAfterWithdrawalSessions).toBe(1);
  });

  it("separa la advertencia de origen legacy del estado del resultado", () => {
    const data = fixture();
    data.integrity = {
      status: "complete",
      warnings: ["legacy_cash_source_unverified"],
      legacy_cash_source_unverified_count: 2,
    };
    data.cash_reconciliation = {
      status: "incomplete",
      period_activity: 415,
      legacy_cash_source_unverified_count: 2,
    };

    const finances = canonicalFinancialSummary(data);
    const cash = canonicalCashSummary(data.cash_reconciliation, trend(0));
    expect(finances.integrity.status).toBe("complete");
    expect(finances.integrity.legacyCashSourceUnverifiedCount).toBe(2);
    expect(financialEquationHolds(finances)).toBe(true);
    expect(cash.status).toBe("incomplete");
    expect(cash.legacyCashSourceUnverifiedCount).toBe(2);
  });
});
