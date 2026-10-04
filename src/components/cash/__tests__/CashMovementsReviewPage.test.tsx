import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { CashCloseReport, CashSessionSnapshot } from "@/hooks/useCashClose";
const mock = vi.hoisted(() => ({ get: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get: mock.get } }));
vi.mock("@/hooks/useMoneyVisibility", () => ({ useMoneyVisibility: () => ({ fmt: (value: number) => `$${value.toFixed(2)}` }) }));
vi.mock("@/pages/expenses/ExpensesPage", () => ({ ExpensesWorkspace: ({ section }: { section: string }) => <p>Herramientas de corrección: {section}</p> }));
import CashMovementsReviewPage from "../CashMovementsReviewPage";
import { cashMovementReviewSearch } from "../CashReview";

const date = "2026-09-27";
const opened: CashSessionSnapshot = { id: "s1", drawer_id: "drawer-secondary", drawer_code: "secondary", operational_date: date, sequence: 2, status: "open", opening_cash: 100, opening_cash_known: true, activity_cash: 80, expected_cash: 180, counted_cash: null, difference: null, cash_left: null, withdrawn_cash: null, opened_at: `${date}T18:00:00Z` };
function report(overrides: Partial<CashCloseReport> = {}): CashCloseReport {
  return { date, cash_drawer_id: opened.drawer_id, session: opened, timezone: "America/Mexico_City",
    drawers: [{ id: "drawer-main", code: "main", name: "Principal" }, { id: opened.drawer_id, code: "secondary", name: "Segunda caja" }],
    cash_movements: [], entries: ["membership", "product", "balance_settlement", "other", "refund"].map((concept, i) => ({ id: `${i}`, recorded_at: `${date}T19:00:0${i}Z`, amount: i === 4 ? -20 : 25, concept, reason: "", operator_name: "Ana" })), ...overrides,
  } as CashCloseReport;
}
function Location() { return <output aria-label="Ruta">{useLocation().search}</output>; }
function show(search = cashMovementReviewSearch(date, opened.drawer_id)) {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><MemoryRouter initialEntries={[`/movements?${search}`]}><CashMovementsReviewPage /><Location /></MemoryRouter></QueryClientProvider>);
}

describe("Detalle de movimientos de caja", () => {
  beforeEach(() => { vi.clearAllMocks(); mock.get.mockResolvedValue(report()); });
  it("muestra los cinco cobros y devoluciones aunque no haya movimientos de efectivo registrados aparte", async () => {
    show();
    expect(await screen.findByText("Mensualidad")).toBeVisible();
    expect(screen.getByText("Venta de productos")).toBeVisible();
    expect(screen.getByText("Abono")).toBeVisible();
    expect(screen.getByText("Otro ingreso")).toBeVisible();
    expect(screen.getByText("Devolución")).toBeVisible();
    expect(screen.getByText("−$20.00")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(5);
    expect(screen.queryByText("Sin movimientos de efectivo.")).not.toBeInTheDocument();
    expect(mock.get).toHaveBeenCalledWith("/api/v1/cash-close", { query: { date, cash_drawer_id: "drawer-secondary" } });
    expect(screen.getByRole("combobox", { name: "Caja de recepción" })).toHaveTextContent("Segunda caja");
  });
  it("conserva el período actual y permite consultar los movimientos de cortes anteriores", async () => {
    mock.get.mockResolvedValue(report({ entries: [
      { id: "old", recorded_at: `${date}T17:59:59.999Z`, amount: 15, concept: "cash_out", reason: "Gasto anterior", operator_name: "Ana" },
      { id: "current", recorded_at: `${date}T18:00:00Z`, amount: 20, concept: "cash_in", reason: "Entrada actual", operator_name: "Ana" },
    ] }));
    show(); expect(await screen.findByText("Entrada actual")).toBeVisible();
    expect(screen.queryByText("Gasto anterior")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver todo el día" }));
    expect(screen.getByText("Gasto anterior")).toBeVisible();
    expect(await screen.findByText("Todos los movimientos del día")).toBeVisible();
  });
  it("después de un corte sólo muestra la actividad posterior, como Caja actual", async () => {
    mock.get.mockResolvedValue(report({ session: { ...opened, status: "reconciled", finished_at: `${date}T19:00:02Z` } }));
    show(); expect(await screen.findByText("Otro ingreso")).toBeVisible();
    expect(screen.getAllByRole("listitem")).toHaveLength(2);
    expect(screen.queryByText("Abono")).not.toBeInTheDocument();
  });
  it("cambiar la fecha consulta todo ese día sin perder la caja seleccionada", async () => {
    show(); await screen.findByText("Mensualidad");
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "26/09/2026" } });
    await waitFor(() => expect(mock.get).toHaveBeenCalledWith("/api/v1/cash-close", { query: { date: "2026-09-26", cash_drawer_id: "drawer-secondary" } }));
    expect(await screen.findByText("Todos los movimientos del día")).toBeVisible();
  });
  it("conserva las herramientas de corrección y permite volver al mismo detalle", async () => {
    show(); await screen.findByText("Mensualidad");
    fireEvent.click(screen.getByRole("button", { name: "Corregir entradas y salidas" }));
    expect(screen.getByText("Herramientas de corrección: cash")).toBeVisible();
    expect(screen.getByLabelText("Ruta")).toHaveTextContent("from=2026-09-27&to=2026-09-27");
    fireEvent.click(screen.getByRole("button", { name: "← Volver a movimientos" }));
    expect(await screen.findByText("Mensualidad")).toBeVisible();
  });
  it("los enlaces existentes de reportes conservan su rango y abren las correcciones", () => {
    show("from=2026-09-01&to=2026-09-27");
    expect(screen.getByText("Herramientas de corrección: cash")).toBeVisible();
    expect(mock.get).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Ruta")).toHaveTextContent("from=2026-09-01&to=2026-09-27");
  });
  it("un fallo de consulta muestra Reintentar y no una lista vacía", async () => {
    mock.get.mockRejectedValueOnce(new Error("Sin conexión"));
    show(); const alert = await screen.findByRole("alert");
    expect(alert).toHaveTextContent("No se pudieron cargar los movimientos.");
    expect(screen.queryByText("Sin movimientos de efectivo.")).not.toBeInTheDocument();
    fireEvent.click(within(alert).getByRole("button", { name: "Reintentar" }));
    expect(await screen.findByText("Mensualidad")).toBeVisible();
  });
});
