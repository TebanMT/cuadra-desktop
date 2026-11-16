import { describe, expect, it } from "vitest";
import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import type { KpiTrend, ReportsRangeData } from "@/hooks/useReports";
import { FinancialSummary } from "../ReportContent";

const trend = (value: number, delta: number | null = null, delta_pct: number | null = null): KpiTrend => ({
  value,
  delta,
  delta_pct,
});

// Cifras ficticias.
function fixture(withComparison: boolean): ReportsRangeData {
  const t = (value: number, delta: number, pct: number) =>
    withComparison ? trend(value, delta, pct) : trend(value);
  return {
    period: "month",
    from: "2026-08-01",
    to: "2026-08-24",
    previous_from: "2026-07-01",
    previous_to: "2026-07-24",
    totals: {
      income: t(1200, 200, 20),
      membership_income: trend(1000),
      product_income: trend(200),
      other_income: trend(0),
      unclassified_income: trend(0),
      operating_expenses: trend(300),
      inventory_purchases: trend(0),
      refunds: trend(0),
      outflows: t(300, -100, -25),
      period_result: t(900, 300, 50),
      new_members: trend(1),
      checkins: trend(0),
      inventory_cost: trend(0),
      expenses_general: trend(300),
      net: trend(900),
      cogs: trend(0),
      operating_result: trend(900),
      cash_flow: trend(0),
      net_result: trend(900),
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
    product_sales: { amount: trend(200), units: 2 },
    income_by_day: [],
    expenses_by_day: [],
    checkins_by_day: [],
    income_by_method: { cash: 1200, transfer: 0, card: 0 },
    income_by_membership_type: { Mensual: 1000 },
    members_by_membership_type: {},
    expenses_by_category: {},
    top_members: [],
    top_products: [],
    inventory_costs: [],
    expenses: [],
    critical_stock: { out_count: 0, low_count: 0 },
    recent_payments: [],
    attention_required_count: 0,
  } as ReportsRangeData;
}

const paths = { income: "/billing", cash: "/reports/cash-close/summary", analysis: "/reports/analysis" };

describe("Resumen financiero de Reportes", () => {
  it("se lee Ingresos, Salidas y luego Resultado", () => {
    renderWithProviders(<MemoryRouter><FinancialSummary data={fixture(true)} paths={paths} /></MemoryRouter>);
    const order = screen
      .getAllByRole("region")
      .map((r) => r.getAttribute("aria-label"))
      .filter((label) => label === "Ingresos" || label === "Salidas" || label === "Resultado");
    expect(order).toEqual(["Ingresos", "Salidas", "Resultado"]);
  });

  it("la comparación lleva la cifra del período anterior", () => {
    renderWithProviders(<MemoryRouter><FinancialSummary data={fixture(true)} paths={paths} /></MemoryRouter>);
    const income = within(screen.getByRole("region", { name: "Ingresos" }));
    expect(income.getByText(/\+20% · antes \$1,000/)).toBeInTheDocument();
    expect(screen.getByText(/«Antes» es el período del/)).toBeInTheDocument();
  });

  it("sin datos del período anterior no muestra «Comparado con…» vacío", () => {
    renderWithProviders(<MemoryRouter><FinancialSummary data={fixture(false)} paths={paths} /></MemoryRouter>);
    expect(screen.queryByText(/Comparado con/)).not.toBeInTheDocument();
    expect(screen.queryByText(/«Antes»/)).not.toBeInTheDocument();
    expect(screen.queryByText(/antes \$/)).not.toBeInTheDocument();
  });
});
