import { MemoryRouter } from "react-router-dom";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/useMoneyVisibility", () => ({ useMoneyVisibility: () => ({ hidden: false, fmt: (value: number) => `$${value.toFixed(2)}` }) }));
import { CashPeriodReport } from "../CashPeriodReport";
import type { ReportsRangeData } from "@/hooks/useReports";

function data(cash: Partial<NonNullable<ReportsRangeData["cash_reconciliation"]>>, from = "2026-11-01", to = "2026-11-30") {
  return {
    from, to,
    totals: {},
    cash_reconciliation: { status: "incomplete", requires_attention: true, period_activity: 500, active_days: 3, total_sessions: 2, reconciled_sessions: 2, ...cash },
  } as unknown as ReportsRangeData;
}

function show(report: ReportsRangeData) {
  return render(<MemoryRouter><CashPeriodReport data={report} /></MemoryRouter>);
}

describe("Caja del período · días sin corte revisado", () => {
  it("enlaza el día afectado al historial de cortes de esa fecha", () => {
    show(data({ uncovered_activity_days: 1, uncovered_activity_dates: ["2026-11-03"] }));
    expect(screen.getByText("Falta completar la caja")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: "Ver caja del 3 nov 2026" });
    expect(link).toHaveTextContent("3 nov");
    expect(link).toHaveAttribute("href", "/reports/cash-close?tab=history&date=2026-11-03");
  });

  it("limita los enlaces y resume el resto", () => {
    const dates = Array.from({ length: 9 }, (_, i) => `2026-11-${String(i + 1).padStart(2, "0")}`);
    show(data({ uncovered_activity_days: 9, uncovered_activity_dates: dates }));
    expect(screen.getAllByRole("link", { name: /^Ver caja del/ })).toHaveLength(7);
    expect(screen.getByText(/y 2 más/)).toBeInTheDocument();
  });

  it("incluye el año cuando el período cruza de año", () => {
    show(data({ uncovered_activity_days: 1, uncovered_activity_dates: ["2025-12-30"] }, "2025-12-01", "2026-01-31"));
    expect(screen.getByRole("link", { name: "Ver caja del 30 dic 2025" })).toHaveTextContent("30 dic 2025");
  });

  it("sigue mostrando el conteo cuando el servidor aún no envía fechas", () => {
    show(data({ uncovered_activity_days: 1 }));
    expect(screen.getByText("1 día sin corte terminado")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: /^Ver caja del/ })).not.toBeInTheDocument();
  });
});

describe("Caja del período · diferencias en cortes", () => {
  const short = { session_id: "s-short", date: "2026-11-12", drawer_id: "d2", drawer_name: "Caja 2", sequence: 1, difference: -50, counted_by_name: "Ana", reason: "no había cambio" };
  const surplus = { session_id: "s-surplus", date: "2026-11-10", drawer_id: "gym", sequence: 2, difference: 20 };

  it("separa faltantes de sobrantes y enlaza cada corte con su caja", () => {
    show(data({ counted_closes: 4, shortage_total: 50, shortage_sessions: 1, surplus_total: 20, surplus_sessions: 1, difference_sessions: [short, surplus] }));
    expect(screen.getByText("Faltantes y sobrantes")).toBeInTheDocument();
    expect(screen.getByText("Faltantes").parentElement).toHaveTextContent("$50");
    expect(screen.getByText("Sobrantes").parentElement).toHaveTextContent("$20");
    const shortLink = screen.getByRole("link", { name: /12 nov · Caja 2/ });
    expect(shortLink).toHaveTextContent("Contó Ana · no había cambio");
    expect(shortLink).toHaveTextContent("Faltan $50");
    expect(shortLink).toHaveAttribute("href", "/reports/cash-close?tab=history&date=2026-11-12&cash_drawer_id=d2");
    expect(screen.getByRole("link", { name: /10 nov · corte 2/ })).toHaveTextContent("Sobran $20");
  });

  it("muestra los primeros cortes y deja ver el resto", () => {
    const sessions = Array.from({ length: 7 }, (_, i) => ({ session_id: `s${i}`, date: `2026-11-${String(20 - i)}`, sequence: 1, difference: -10 }));
    show(data({ counted_closes: 7, shortage_total: 70, shortage_sessions: 7, difference_sessions: sessions }));
    expect(screen.getAllByRole("link", { name: /Faltan/ })).toHaveLength(5);
    fireEvent.click(screen.getByRole("button", { name: "Ver los 7 cortes" }));
    expect(screen.getAllByRole("link", { name: /Faltan/ })).toHaveLength(7);
  });

  it("dice cuando ningún corte contado tuvo diferencia y calla si el servidor no envía la lista", () => {
    const { unmount } = show(data({ counted_closes: 3, difference_sessions: [] }));
    expect(screen.getByText("En los cortes contados no faltó ni sobró dinero.")).toBeInTheDocument();
    unmount();
    show(data({ counted_closes: 3 }));
    expect(screen.queryByText("Faltantes y sobrantes")).not.toBeInTheDocument();
  });
});

describe("Caja del período · días cerrados por el dueño", () => {
  it("no pide atención ni dice caja revisada cuando un día se cerró sin conteo", () => {
    show(data({ status: "incomplete", complete: false, requires_attention: false, total_sessions: 3, reconciled_sessions: 2, reviewed_sessions: 1 }));
    expect(screen.getByText(/1 cerrado por el dueño sin conteo/)).toBeInTheDocument();
    expect(screen.getByText(/Un corte se cerró sin conteo, con nota del dueño\./)).toBeInTheDocument();
    expect(screen.queryByText("Falta completar la caja")).not.toBeInTheDocument();
    expect(screen.queryByText("Caja revisada")).not.toBeInTheDocument();
  });

  it("calla la nota cuando el período todavía pide atención", () => {
    show(data({ status: "incomplete", complete: false, requires_attention: true, closed_unverified_sessions: 1, total_sessions: 3, reconciled_sessions: 1, reviewed_sessions: 1 }));
    expect(screen.getByText("Falta completar la caja")).toBeInTheDocument();
    expect(screen.queryByText(/con nota del dueño/)).not.toBeInTheDocument();
  });
});

describe("Caja del período · diferencias al abrir", () => {
  const short = { session_id: "o-short", date: "2026-11-12", drawer_id: "d2", drawer_name: "Caja 2", difference: -50, opened_by_name: "Ana", note: "Faltaban 50 al llegar" };

  it("separa lo que faltó entre un corte y la apertura siguiente, con enlace al día", () => {
    show(data({ opening_shortage_total: 50, opening_shortage_sessions: 1, opening_surplus_total: 0, opening_surplus_sessions: 0, opening_differences: [short] }));
    expect(screen.getByText("Diferencias al abrir la caja")).toBeInTheDocument();
    expect(screen.getByText("Faltantes al abrir").parentElement).toHaveTextContent("$50");
    expect(screen.getByText("Ninguna apertura con sobrante")).toBeInTheDocument();
    const link = screen.getByRole("link", { name: /12 nov · Caja 2/ });
    expect(link).toHaveTextContent("Abrió Ana · Faltaban 50 al llegar");
    expect(link).toHaveTextContent("Faltan $50");
    expect(link).toHaveAttribute("href", "/reports/cash-close?tab=history&date=2026-11-12&cash_drawer_id=d2");
  });

  it("no muestra el bloque cuando todas las aperturas coincidieron", () => {
    show(data({ opening_differences: [] }));
    expect(screen.queryByText("Diferencias al abrir la caja")).not.toBeInTheDocument();
  });
});

describe("Caja del período · en palabras del dueño", () => {
  it("responde cuánto entró y cuánto se retiró, y deja los estados en el detalle", () => {
    const { container } = show(data({
      period_activity: 1500, period_withdrawn: 1200, withdrawn_sessions: 1,
      latest_expected: 300, latest_counted: 300, latest_difference: 0,
      total_sessions: 2, reconciled_sessions: 1, open_sessions: 1,
    }));
    expect(screen.getByText("Entró a la caja").parentElement).toHaveTextContent("$1500");
    expect(screen.getByText("Se retiró de la caja").parentElement).toHaveTextContent("$1200");
    expect(screen.getByText("En 1 retiro")).toBeInTheDocument();
    const detail = container.querySelector("details");
    expect(detail).not.toBeNull();
    expect(detail).not.toHaveAttribute("open");
    expect(detail).toHaveTextContent("Último corte");
    expect(detail).toHaveTextContent("Debía haber");
    expect(detail).toHaveTextContent("2 cortes en el período · 1 contado · 1 con retiro · 1 abierto");
    expect(container).not.toHaveTextContent(/sesi[oó]n|concilia|cobertura|apertura no confirma/i);
  });

  it("dice que salió dinero cuando se pagó más de lo que se cobró", () => {
    show(data({ period_activity: -120, period_withdrawn: 0, withdrawn_sessions: 0 }));
    expect(screen.getByText("Salió de la caja").parentElement).toHaveTextContent("$120");
    expect(screen.queryByText("Entró a la caja")).not.toBeInTheDocument();
    expect(screen.getByText("Sin retiros registrados")).toBeInTheDocument();
  });

  it("explica un retiro mayor a lo que entró sólo cuando ocurre", () => {
    show(data({ period_activity: 200, period_withdrawn: 700, withdrawn_sessions: 2 }));
    expect(screen.getByText("En 2 retiros · incluye efectivo que ya estaba al abrir")).toBeInTheDocument();
  });

  it("pone primero los días sin corte y dice cada pendiente como una acción", () => {
    show(data({
      uncovered_activity_days: 2, uncovered_activity_dates: ["2026-11-03", "2026-11-05"],
      closed_unverified_sessions: 1, unknown_opening_sessions: 2, adjusted_after_withdrawal_sessions: 1,
    }));
    const items = screen.getAllByRole("listitem").map((item) => item.textContent);
    expect(items).toEqual([
      "2 días sin corte terminado: 3 nov, 5 nov",
      "1 corte se cerró sin contar el efectivo",
      "En 2 cortes no se anotó con cuánto efectivo se empezó",
      "1 corte cambió después de retirar el efectivo",
    ]);
  });
});
