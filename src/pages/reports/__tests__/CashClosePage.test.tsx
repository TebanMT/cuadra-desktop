import { MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
const { closeMutate, reconcileMutate, withdrawMutate, movementMutate, expenseMutate, openMutate, reviewMutate, voidMutate, identity, pendingDays } = vi.hoisted(() => ({
  closeMutate: vi.fn(), reconcileMutate: vi.fn(), withdrawMutate: vi.fn(), movementMutate: vi.fn(), expenseMutate: vi.fn(), openMutate: vi.fn(), reviewMutate: vi.fn(), voidMutate: vi.fn(), identity: { role: "operator", user_id: "ricardo" } as { role: string; user_id: string; permissions?: string[] },
  pendingDays: { items: [] as import("@/hooks/useCashClose").CashPendingDay[] },
}));
vi.mock("@/hooks/useCashClose", () => ({
  useCashCloseReport: vi.fn(), useCloseCashRegister: () => ({ mutateAsync: closeMutate, isPending: false }),
  useReconcileCashSession: () => ({ mutateAsync: reconcileMutate, isPending: false }), useWithdrawCashSession: () => ({ mutateAsync: withdrawMutate, isPending: false }),
  useCreateCashMovement: () => ({ mutateAsync: movementMutate, isPending: false }), useOpenCashSession: () => ({ mutateAsync: openMutate, isPending: false }),
  useReviewCashDay: () => ({ mutateAsync: reviewMutate, isPending: false }),
  useVoidCashMovement: () => ({ mutateAsync: voidMutate, isPending: false }),
  useCashPendingDays: () => ({ data: pendingDays.items, isLoading: false, isError: false }),
}));
vi.mock("@/hooks/useMoneyVisibility", () => ({ useMoneyVisibility: () => ({ hidden: false, fmt: (value: number) => `$${value.toFixed(2)}` }) }));
vi.mock("@/hooks/useExpenses", () => ({ useCreateExpense: () => ({ mutateAsync: expenseMutate, isPending: false }) }));
vi.mock("@/stores/useAuthStore", () => ({ useAuthStore: (selector: (state: { user: { role: string; user_id: string } }) => unknown) => selector({ user: identity }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/cash/CashDrawerManager", () => ({ CashDrawerManager: () => null }));
import CashClosePage, { ReportView } from "../CashClosePage";
import { useCashCloseReport } from "@/hooks/useCashClose";
import { CashHistory, periodEntries } from "@/components/cash/CashReview";
import type { CashCloseReport, CashSessionSnapshot } from "@/hooks/useCashClose";
import { ApiError } from "@/lib/api";
function report(overrides: Partial<CashCloseReport> = {}): CashCloseReport {
  return { date: "2026-09-27", by_method: { cash: 50, card: 900, transfer: 1000 }, by_concept: {} as CashCloseReport["by_concept"], refunds_total: 0, refund_by_method: {}, refunds_count: 0, total: 1950, expenses: [], expenses_total: 0, expenses_by_method: {}, cash_movements: [], cash_in_total: 0, cash_out_total: 0, net_total: 1950, operators: [], ...overrides };
}
const opened: CashSessionSnapshot = { id: "session-1", drawer_id: "drawer-main", drawer_code: "main", operational_date: "2026-09-27", sequence: 1, status: "open", opening_cash: 100, opening_cash_known: true, activity_cash: 50, expected_cash: 150, counted_cash: null, difference: null, cash_left: null, withdrawn_cash: null, opened_at: "2026-09-27T06:00:00Z" };
const withdrawn: CashSessionSnapshot = { ...opened, status: "withdrawn", counted_cash: 150, difference: 0, cash_left: 100, withdrawn_cash: 50, finished_at: "2026-09-27T18:00:00Z" };
function view(data = report({ session: opened })) { return render(<ReportView report={data} date="2026-09-27" canClose />); }
async function count(value: string) {
  fireEvent.click(screen.getByRole("button", { name: "Hacer corte" }));
  const dialog = within(await screen.findByRole("dialog"));
  fireEvent.change(dialog.getByLabelText("¿Cuánto efectivo hay en la caja?"), { target: { value } });
  fireEvent.click(dialog.getByRole("button", { name: "Ver resultado" }));
  return dialog;
}
describe("Caja simple", () => {
  beforeEach(() => { vi.clearAllMocks(); identity.role = "operator"; identity.permissions = undefined; pendingDays.items = []; closeMutate.mockResolvedValue({ cash_close_id: "session-1" }); movementMutate.mockResolvedValue({ id: "movement-1" }); expenseMutate.mockResolvedValue({ expense_id: "expense-1" }); openMutate.mockResolvedValue({ ...opened, id: "session-2", sequence: 2 }); });
  afterEach(() => vi.useRealTimers());
  it("abre caja con el día del gimnasio aunque la computadora esté en el día siguiente", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 28, 1));
    vi.mocked(useCashCloseReport).mockReturnValue({ data: report({ timezone: "America/Mexico_City" }), isLoading: false, isError: false } as ReturnType<typeof useCashCloseReport>);
    render(<MemoryRouter><CashClosePage /></MemoryRouter>);

    fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("¿Con cuánto efectivo empiezas?"), { target: { value: "500" } });
    fireEvent.click(dialog.getByRole("button", { name: "Confirmar efectivo inicial" }));

    await waitFor(() => expect(openMutate).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-09-27", opening_cash: 500 })));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(useCashCloseReport).toHaveBeenCalledWith(undefined, undefined);
  });
  it("abre el detalle con la misma caja y el período actual", () => {
    identity.role = "owner";
    vi.mocked(useCashCloseReport).mockReturnValue({ data: report({ cash_drawer_id: "drawer-secondary", session: opened }), isLoading: false, isError: false } as ReturnType<typeof useCashCloseReport>);
    function Route() { const location = useLocation(); return <output aria-label="Ruta">{location.pathname}{location.search}</output>; }
    render(<MemoryRouter><CashClosePage /><Route /></MemoryRouter>);
    fireEvent.click(screen.getByRole("button", { name: "Revisar movimientos" }));
    const target = new URL(screen.getByLabelText("Ruta").textContent!, "http://localhost");
    expect(target.pathname).toBe("/reports/cash-close/movements");
    expect(target.searchParams.get("view")).toBe("ledger");
    expect(target.searchParams.get("period")).toBe("current");
    expect(target.searchParams.get("cash_drawer_id")).toBe("drawer-secondary");
    expect(target.searchParams.get("from")).toBe("2026-09-27");
    expect(target.searchParams.get("to")).toBe("2026-09-27");
  });
  it("conserva la fecha elegida en historial y limita el calendario al día del gimnasio", () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date("2026-09-28T02:00:00Z"));
    vi.mocked(useCashCloseReport).mockImplementation(date => ({ data: report({ date: date ?? "2026-09-27", timezone: "America/Mexico_City" }), isLoading: false, isError: false }) as ReturnType<typeof useCashCloseReport>);
    render(<MemoryRouter><CashClosePage /></MemoryRouter>);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Historial de cortes" }), { button: 0, ctrlKey: false });
    const input = screen.getByLabelText("Fecha");
    expect(input).toHaveValue("27/09/2026");
    fireEvent.change(input, { target: { value: "26/09/2026" } });
    expect(useCashCloseReport).toHaveBeenLastCalledWith("2026-09-26", undefined);
    fireEvent.change(input, { target: { value: "28/09/2026" } });
    expect(input).toHaveAttribute("aria-invalid", "true");
    expect(useCashCloseReport).toHaveBeenLastCalledWith("2026-09-26", undefined);
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Caja actual" }), { button: 0, ctrlKey: false });
    expect(useCashCloseReport).toHaveBeenLastCalledWith(undefined, undefined);
  });
  it("abre el historial en la fecha del enlace y lleva al dueño a los movimientos de ese día", () => {
    identity.role = "owner";
    vi.mocked(useCashCloseReport).mockImplementation(date => ({ data: report({ date: date ?? "2026-09-27", cash_drawer_id: "drawer-main" }), isLoading: false, isError: false }) as ReturnType<typeof useCashCloseReport>);
    function Route() { const location = useLocation(); return <output aria-label="Ruta">{location.pathname}{location.search}</output>; }
    render(<MemoryRouter initialEntries={["/reports/cash-close?tab=history&date=2026-09-20"]}><CashClosePage /><Route /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Historial de cortes" })).toHaveAttribute("aria-selected", "true");
    expect(useCashCloseReport).toHaveBeenLastCalledWith("2026-09-20", undefined);
    expect(screen.getByLabelText("Fecha")).toHaveValue("20/09/2026");
    fireEvent.click(screen.getByRole("link", { name: "Ver movimientos del día" }));
    const target = new URL(screen.getByLabelText("Ruta").textContent!, "http://localhost");
    expect(target.pathname).toBe("/reports/cash-close/movements");
    expect(target.searchParams.get("view")).toBe("ledger");
    expect(target.searchParams.get("from")).toBe("2026-09-20");
    expect(target.searchParams.get("to")).toBe("2026-09-20");
    expect(target.searchParams.get("period")).toBeNull();
    expect(target.searchParams.get("cash_drawer_id")).toBe("drawer-main");
  });
  it("sin permiso de totales, el historial se queda en hoy aunque el enlace traiga otro día", () => {
    identity.permissions = [];
    vi.mocked(useCashCloseReport).mockImplementation(date => ({ data: report({ date: date ?? "2026-09-27" }), isLoading: false, isError: false }) as ReturnType<typeof useCashCloseReport>);
    render(<MemoryRouter initialEntries={["/reports/cash-close?tab=history&date=2026-09-20"]}><CashClosePage /></MemoryRouter>);
    expect(screen.getByRole("tab", { name: "Historial de cortes" })).toHaveAttribute("aria-selected", "true");
    expect(useCashCloseReport).toHaveBeenLastCalledWith(undefined, undefined);
    expect(useCashCloseReport).not.toHaveBeenCalledWith("2026-09-20", expect.anything());
    expect(screen.queryByLabelText("Fecha")).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Ves solo los cortes de hoy. Requiere el permiso «Ver totales de dinero». Pídeselo al dueño.");
  });
  it("sin permiso de totales explica el resumen del día en su lugar; con permiso lo muestra", () => {
    identity.permissions = [];
    const { unmount } = view();
    expect(screen.queryByText("Resumen del día")).not.toBeInTheDocument();
    expect(screen.queryByText("Cobros en efectivo")).not.toBeInTheDocument();
    expect(screen.getAllByRole("note").some(note => /resumen del día.*«Ver totales de dinero»/.test(note.textContent ?? ""))).toBe(true);
    unmount();
    identity.permissions = ["view_totals"];
    view();
    expect(screen.getByText("Resumen del día")).toBeInTheDocument();
    expect(screen.queryByText(/«Ver totales de dinero»/)).not.toBeInTheDocument();
  });
  it("con la caja sin abrir, «Abrir caja» es la única acción principal y los movimientos quedan aparte", () => {
    view(report());
    const open = screen.getByRole("button", { name: "Abrir caja" });
    expect(open).toHaveClass("h-12");
    const before = screen.getByRole("group", { name: "Movimientos antes de abrir" });
    // Quedan detrás de una pregunta cerrada: no compiten con «Abrir caja».
    expect(before.closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText("¿Entró o salió efectivo antes de abrir la caja?")).toBeInTheDocument();
    for (const name of ["Agregar efectivo", "Registrar salida"]) {
      const button = within(before).getByRole("button", { name });
      expect(button).toHaveClass("hover:bg-accent");
      expect(button).not.toHaveClass("bg-primary");
    }
  });
  it("el historial vacío dice la fecha consultada", () => {
    render(<CashHistory report={report({ date: "2026-09-20", sessions: [] })} />);
    expect(screen.getByText("No hay cortes del 20 sep 2026.")).toBeInTheDocument();
  });
  it("no pinta el resumen como $0 si la respuesta no trae totales", () => {
    const withoutTotals = report({ session: opened });
    delete withoutTotals.by_method; delete withoutTotals.refund_by_method; delete withoutTotals.operators; delete withoutTotals.total;
    view(withoutTotals);
    expect(screen.queryByText("Resumen del día")).not.toBeInTheDocument();
  });
  it("abre el corte de la caja que trae el enlace", () => {
    identity.role = "owner";
    vi.mocked(useCashCloseReport).mockImplementation((date, drawer) => ({ data: report({ date: date ?? "2026-09-27", cash_drawer_id: drawer ?? "drawer-main" }), isLoading: false, isError: false }) as ReturnType<typeof useCashCloseReport>);
    render(<MemoryRouter initialEntries={["/reports/cash-close?tab=history&date=2026-09-20&cash_drawer_id=drawer-secondary"]}><CashClosePage /></MemoryRouter>);
    expect(useCashCloseReport).toHaveBeenLastCalledWith("2026-09-20", "drawer-secondary");
    const href = screen.getByRole("link", { name: "Ver movimientos del día" }).getAttribute("href")!;
    expect(new URL(href, "http://localhost").searchParams.get("cash_drawer_id")).toBe("drawer-secondary");
  });
  it("el dueño cierra sin conteo un día pasado que quedó sin corte, con una nota obligatoria", async () => {
    identity.role = "owner";
    reviewMutate.mockResolvedValue({ ...opened, status: "closed_unverified", reviewed_without_count: true });
    vi.mocked(useCashCloseReport).mockImplementation((date, drawer) => ({ data: report({ date: date ?? "2026-09-27", cash_drawer_id: drawer ?? "drawer-main", session: null, uncovered_cash_activity: 120, requires_new_session: true, pending_review: true }), isLoading: false, isError: false }) as ReturnType<typeof useCashCloseReport>);
    render(<MemoryRouter initialEntries={["/reports/cash-close?tab=history&date=2026-09-20&cash_drawer_id=drawer-secondary"]}><CashClosePage /></MemoryRouter>);
    expect(screen.getByText("Este día quedó sin corte")).toBeInTheDocument();
    expect(screen.getByText("Se registraron $120.00 en efectivo sin abrir la caja.")).toBeInTheDocument();
    expect(screen.getByText(/no dirá que la caja cuadró/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cerrar día sin conteo" }));
    const dialog = within(await screen.findByRole("dialog"));
    const submit = dialog.getByRole("button", { name: "Cerrar día" });
    fireEvent.change(dialog.getByLabelText("¿Qué pasó?"), { target: { value: "   " } });
    expect(submit).toBeDisabled();
    fireEvent.change(dialog.getByLabelText("¿Qué pasó?"), { target: { value: "  Se olvidó abrir la caja " } });
    fireEvent.click(submit);
    await waitFor(() => expect(reviewMutate).toHaveBeenCalledWith({ date: "2026-09-20", cash_drawer_id: "drawer-secondary", note: "Se olvidó abrir la caja" }));
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });
  it("sólo el dueño ve el cierre sin conteo y sólo cuando el día lo necesita", () => {
    const pending = report({ date: "2026-09-20", session: { ...opened, operational_date: "2026-09-20" }, pending_review: true });
    vi.mocked(useCashCloseReport).mockReturnValue({ data: pending, isLoading: false, isError: false } as ReturnType<typeof useCashCloseReport>);
    const { unmount } = render(<MemoryRouter initialEntries={["/reports/cash-close?tab=history&date=2026-09-20"]}><CashClosePage /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Cerrar día sin conteo" })).not.toBeInTheDocument();
    unmount();
    identity.role = "owner";
    vi.mocked(useCashCloseReport).mockReturnValue({ data: { ...pending, pending_review: false }, isLoading: false, isError: false } as ReturnType<typeof useCashCloseReport>);
    render(<MemoryRouter initialEntries={["/reports/cash-close?tab=history&date=2026-09-20"]}><CashClosePage /></MemoryRouter>);
    expect(screen.queryByRole("button", { name: "Cerrar día sin conteo" })).not.toBeInTheDocument();
  });
  it("el historial distingue un día cerrado por el dueño sin conteo y muestra su nota", async () => {
    const reviewed: CashSessionSnapshot = { ...opened, status: "closed_unverified", opening_cash_known: false, closed_at: "2026-09-21T15:00:00Z", reviewed_without_count: true, review_note: "Se olvidó abrir la caja" };
    render(<CashHistory report={report({ session: reviewed, sessions: [reviewed] })} />);
    expect(screen.getAllByText("Cerrado por el dueño · sin conteo").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: "Ver corte 1" }));
    expect(await screen.findByText("Nota del dueño: Se olvidó abrir la caja")).toBeInTheDocument();
  });
  it("recuerda en la mañana la caja que quedó abierta y permite contarla con la fecha de ese día", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(new Date(2026, 8, 28, 9));
    const leftOpen = { ...opened, operational_date: "2026-09-27", expected_cash: 900 };
    pendingDays.items = [
      { date: "2026-09-27", is_today: false, cash_drawer_id: "drawer-main", drawer_name: "Caja principal", is_main_drawer: true, reason: "open", expected_cash: 900, uncovered_cash: 0, count_now: true, session: leftOpen },
      { date: "2026-09-25", is_today: false, cash_drawer_id: "drawer-main", drawer_name: "Caja principal", is_main_drawer: true, reason: "no_opening", uncovered_cash: 150, count_now: false },
    ];
    vi.mocked(useCashCloseReport).mockReturnValue({ data: report({ date: "2026-09-28" }), isLoading: false, isError: false } as ReturnType<typeof useCashCloseReport>);
    render(<MemoryRouter><CashClosePage /></MemoryRouter>);
    const notice = within(screen.getByRole("region", { name: "Cortes pendientes" }));
    expect(notice.getByText("Quedaron 2 cortes pendientes")).toBeInTheDocument();
    // Staff count before seeing what should be there.
    expect(notice.getByText(/la caja quedó abierta sin corte$/)).toBeInTheDocument();
    expect(notice.queryByText(/esperado/)).not.toBeInTheDocument();
    expect(notice.getByText(/hubo \$150\.00 en efectivo sin abrir la caja/)).toBeInTheDocument();
    expect(notice.getByText("Ayer:")).toBeInTheDocument();
    expect(notice.getAllByRole("button", { name: "Contar ahora" })).toHaveLength(1);
    expect(notice.getByText("Avísale al dueño para que revise esos días.")).toBeInTheDocument();
    expect(notice.queryByRole("button", { name: "Revisar" })).not.toBeInTheDocument();

    fireEvent.click(notice.getByRole("button", { name: "Contar ahora" }));
    const dialog = within(await screen.findByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("¿Cuánto efectivo hay en la caja?"), { target: { value: "900" } });
    fireEvent.click(dialog.getByRole("button", { name: "Ver resultado" }));
    fireEvent.click(dialog.getByRole("button", { name: "Guardar corte" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ date: "2026-09-27", session_id: "session-1", cash_drawer_id: "drawer-main", expected_cash: 900, counted_cash: 900, finish: true })));
  });
  it("el dueño abre el día pendiente en el historial con su caja", () => {
    identity.role = "owner";
    pendingDays.items = [{ date: "2026-09-20", is_today: false, cash_drawer_id: "drawer-secondary", drawer_name: "Caja 2", is_main_drawer: false, reason: "after_close", uncovered_cash: 40, count_now: false }];
    vi.mocked(useCashCloseReport).mockImplementation((date, drawer) => ({ data: report({ date: date ?? "2026-09-27", cash_drawer_id: drawer ?? "drawer-main" }), isLoading: false, isError: false }) as ReturnType<typeof useCashCloseReport>);
    render(<MemoryRouter><CashClosePage /></MemoryRouter>);
    const notice = within(screen.getByRole("region", { name: "Cortes pendientes" }));
    expect(notice.getByText(/Caja 2:/)).toBeInTheDocument();
    expect(notice.queryByText(/Avísale al dueño/)).not.toBeInTheDocument();
    fireEvent.click(notice.getByRole("button", { name: "Revisar" }));
    expect(screen.getByRole("tab", { name: "Historial de cortes" })).toHaveAttribute("aria-selected", "true");
    expect(useCashCloseReport).toHaveBeenLastCalledWith("2026-09-20", "drawer-secondary");
  });
  it("al abrir tarde la caja pide contar sólo lo que había antes de los cobros de hoy", async () => {
    view(report({ session: null, uncovered_cash_activity: 50 }));
    expect(screen.getByText("Ya hubo movimientos de efectivo hoy. Abre la caja con lo que había antes de ellos.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    const dialog = within(await screen.findByRole("dialog"));
    expect(dialog.getByText(/Hoy ya hubo \$50\.00 en efectivo antes de abrir la caja/)).toBeInTheDocument();
  });
  it("el operador no ve el acceso a movimientos del día en el historial", () => {
    vi.mocked(useCashCloseReport).mockReturnValue({ data: report(), isLoading: false, isError: false } as ReturnType<typeof useCashCloseReport>);
    render(<MemoryRouter initialEntries={["/reports/cash-close?tab=history&date=2026-09-20"]}><CashClosePage /></MemoryRouter>);
    expect(screen.queryByRole("link", { name: "Ver movimientos del día" })).not.toBeInTheDocument();
  });
  it("respeta el milisegundo entre dos cortes y no mezcla movimientos del último segundo", () => {
    const session = { ...opened, opened_at: "2026-09-27T18:00:00.501Z" };
    const entries = [
      { id: "before", recorded_at: "2026-09-27T18:00:00.300Z", amount: 20, concept: "product", reason: "", operator_name: "Ana" },
      { id: "after", recorded_at: "2026-09-27T18:00:00.502Z", amount: 10, concept: "product", reason: "", operator_name: "Ana" },
    ];
    expect(periodEntries(report({ entries }), session).map(e => e.id)).toEqual(["after"]);
  });
  it("abre con el importe sugerido y nunca lo guarda sin confirmar", async () => {
    identity.role = "owner";
    view(report({ suggested_opening_cash: 250 }));
    expect(openMutate).not.toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Hacer corte" })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    const d = within(screen.getByRole("dialog")); expect(d.getByLabelText("¿Con cuánto efectivo empiezas?")).toHaveValue(250);
    fireEvent.change(d.getByLabelText("¿Con cuánto efectivo empiezas?"), { target: { value: "200" } });
    fireEvent.click(d.getByRole("button", { name: "Confirmar efectivo inicial" }));
    await waitFor(() => expect(openMutate).toHaveBeenCalledWith({ date: "2026-09-27", cash_drawer_id: undefined, opening_cash: 200, sequence: 1 }));
  });
  it("exige un importe inicial explícito, permite cero y rechaza fracciones de centavo", () => {
    view(report()); fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
    const d = within(screen.getByRole("dialog")); const input = d.getByLabelText("¿Con cuánto efectivo empiezas?"); const save = d.getByRole("button", { name: "Confirmar efectivo inicial" });
    expect(save).toBeDisabled(); fireEvent.change(input, { target: { value: "0" } }); expect(save).toBeEnabled(); fireEvent.change(input, { target: { value: "1.001" } }); expect(save).toBeDisabled();
  });
  it("cierra dejando todo el dinero y sin permitir omitir el conteo", async () => {
    view(); const d = await count("150");
    expect(d.getByText("La caja cuadra")).toBeInTheDocument();
    expect(d.getByLabelText("Retirar efectivo al terminar")).not.toBeChecked();
    expect(d.queryByText("Cerrar sin conteo")).not.toBeInTheDocument();
    fireEvent.click(d.getByRole("button", { name: "Guardar corte" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ session_id: "session-1", finish: true, expected_cash: 150, counted_cash: 150, withdraw: false, cash_left: undefined })));
    expect(withdrawMutate).not.toHaveBeenCalled();
  });
  it("expresa el faltante y permite dejarlo pendiente de aclarar", async () => {
    view(); const d = await count("140"); expect(d.getByText("Faltan $10.00")).toBeInTheDocument(); expect(d.getByRole("button", { name: "Guardar corte" })).toBeDisabled();
    fireEvent.click(d.getByRole("button", { name: "Aún no sé por qué" })); fireEvent.click(d.getByRole("button", { name: "Guardar corte" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ discrepancy_reason: "Pendiente de aclarar", counted_cash: 140 })));
    expect(expenseMutate).not.toHaveBeenCalled();
  });
  it("retira sólo por elección explícita y valida cuánto queda", async () => {
    view(); const d = await count("150"); fireEvent.click(d.getByLabelText("Retirar efectivo al terminar"));
    const save = d.getByRole("button", { name: "Guardar corte y retiro" }); expect(save).toBeDisabled();
    fireEvent.change(d.getByLabelText("¿Cuánto dejas para cambio?"), { target: { value: "160" } }); expect(save).toBeDisabled();
    fireEvent.change(d.getByLabelText("¿Cuánto dejas para cambio?"), { target: { value: "50" } }); fireEvent.click(save);
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ withdraw: true, cash_left: 50 })));
  });
  it("sin permiso para sacar dinero, el corte se guarda y el efectivo se queda en caja", async () => {
    identity.permissions = [];
    view();
    expect(screen.getByRole("button", { name: "Agregar efectivo" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar salida" })).not.toBeInTheDocument();
    expect(screen.getAllByRole("note").some(note => note.textContent === "No puedes registrar salidas ni retiros de efectivo. Requiere el permiso «Sacar dinero de caja». Pídeselo al dueño.")).toBe(true);
    const d = await count("150");
    expect(d.queryByLabelText("Retirar efectivo al terminar")).not.toBeInTheDocument();
    expect(d.getByRole("note")).toHaveTextContent("El efectivo se queda en caja. Requiere el permiso «Sacar dinero de caja». Pídeselo al dueño.");
    fireEvent.click(d.getByRole("button", { name: "Guardar corte" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ counted_cash: 150, withdraw: false, cash_left: undefined })));
    expect(withdrawMutate).not.toHaveBeenCalled();
  });
  it("un cobro posterior abre otro periodo con el efectivo que quedó", async () => {
    view(report({ session: withdrawn, sessions: [withdrawn], requires_new_session: true, uncovered_cash_activity: 50 }));
    const d = await count("150"); expect(openMutate).toHaveBeenCalledWith(expect.objectContaining({ opening_cash: 100, sequence: 2 }));
    fireEvent.click(d.getByRole("button", { name: "Guardar corte" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ session_id: "session-2", expected_cash: 150 })));
  });
  it("el personal ve lo que debía haber sólo después de contar; el dueño lo ve siempre", async () => {
    const { unmount } = view();
    expect(screen.queryByText("Efectivo esperado")).not.toBeInTheDocument();
    expect(screen.getByText("Efectivo inicial")).toBeInTheDocument();
    expect(screen.getByText("$100.00")).toBeInTheDocument();
    expect(screen.queryByText("$150.00")).not.toBeInTheDocument();
    expect(screen.getByText("Cuánto debería haber lo verás al hacer el corte, después de contar.")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Hacer corte" }));
    const d = within(await screen.findByRole("dialog"));
    fireEvent.change(d.getByLabelText("¿Cuánto efectivo hay en la caja?"), { target: { value: "140" } });
    expect(d.queryByText(/Debía haber/)).not.toBeInTheDocument();
    expect(d.queryByText("Faltan $10.00")).not.toBeInTheDocument();
    expect(d.queryByRole("button", { name: "Guardar corte" })).not.toBeInTheDocument();
    fireEvent.click(d.getByRole("button", { name: "Ver resultado" }));
    expect(d.getByRole("status")).toHaveTextContent("Faltan $10.00Debía haber: $150.00Si no cuadra, vuelve a contar antes de guardar.");
    unmount();

    identity.role = "owner";
    view();
    expect(screen.getByText("Efectivo esperado")).toBeInTheDocument();
    expect(screen.getByText("$150.00")).toBeInTheDocument();
  });
  it("si cambia el conteo después de ver el resultado, el dueño ve el primero", async () => {
    view(); const d = await count("140");
    fireEvent.click(d.getByRole("button", { name: "Volver a contar" }));
    fireEvent.change(d.getByLabelText("¿Cuánto efectivo hay en la caja?"), { target: { value: "150" } });
    fireEvent.click(d.getByRole("button", { name: "Ver resultado" }));
    expect(d.getByRole("status")).toHaveTextContent("La caja cuadra");
    expect(d.getByRole("status")).toHaveTextContent("Antes contaste $140.00. El dueño verá los dos conteos.");
    fireEvent.click(d.getByRole("button", { name: "Guardar corte" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ counted_cash: 150, discrepancy_reason: "Primer conteo: $140.00." })));
  });
  it("un segundo conteo que sigue sin cuadrar guarda los dos datos en la nota", async () => {
    view(); const d = await count("140");
    fireEvent.click(d.getByRole("button", { name: "Volver a contar" }));
    fireEvent.change(d.getByLabelText("¿Cuánto efectivo hay en la caja?"), { target: { value: "145" } });
    fireEvent.click(d.getByRole("button", { name: "Ver resultado" }));
    expect(d.getByRole("button", { name: "Guardar corte" })).toBeDisabled();
    fireEvent.click(d.getByRole("button", { name: "Aún no sé por qué" }));
    fireEvent.click(d.getByRole("button", { name: "Guardar corte" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ counted_cash: 145, discrepancy_reason: "Primer conteo: $140.00. Pendiente de aclarar" })));
  });
  it("volver a contar el mismo número no deja rastro", async () => {
    view(); const d = await count("150");
    fireEvent.click(d.getByRole("button", { name: "Volver a contar" }));
    fireEvent.click(d.getByRole("button", { name: "Ver resultado" }));
    expect(d.getByRole("status")).not.toHaveTextContent("Antes contaste");
    fireEvent.click(d.getByRole("button", { name: "Guardar corte" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ counted_cash: 150, discrepancy_reason: undefined })));
  });
  it("el historial muestra responsable, diferencia, nota y retiro", async () => {
    render(<CashHistory report={report({ sessions: [{ ...withdrawn, closed_by_name: "Ana", difference: -5, discrepancy_reason: "Pendiente de aclarar" }] })} />);
    expect(screen.getByText("Ana")).toBeInTheDocument(); expect(screen.getAllByText("Faltan $5.00")[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver corte 1" })); const d = within(screen.getByRole("dialog")); expect(d.getByText("Nota: Pendiente de aclarar")).toBeInTheDocument(); expect(d.getByText("Se quedó en caja")).toBeInTheDocument();
  });
  it("muestra sólo los movimientos del periodo actual y deja fuera tarjeta y transferencias", () => {
    identity.role = "owner";
    view(report({ session: withdrawn, uncovered_cash_activity: 20, requires_new_session: true, entries: [
      { id: "old", recorded_at: "2026-09-27T17:00:00Z", amount: 50, concept: "cash_in", reason: "Entrada anterior", operator_name: "Ana" },
      { id: "new", recorded_at: "2026-09-27T19:00:00Z", amount: 20, concept: "cash_in", reason: "Entrada nueva", operator_name: "Ana" },
    ] }));
    expect(screen.getByText("$120.00")).toBeInTheDocument(); expect(screen.getByText("Entrada nueva")).toBeInTheDocument(); expect(screen.queryByText("Entrada anterior")).not.toBeInTheDocument();
  });
  it("permite al operador entregar dinero sin crear un gasto ni dejarlo pendiente", async () => {
    render(
      <ReportView
        date="2026-08-24"
        canClose
        report={report({ session: withdrawn, sessions: [withdrawn] })}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Registrar salida" }));
    const dialog = screen.getByRole("dialog");
    fireEvent.click(within(dialog).getByRole("radio", { name: "Entregar o mover dinero" }));
    fireEvent.change(within(dialog).getByLabelText("Monto"), {
      target: { value: "150" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motivo"), {
      target: { value: "Entrega al dueño" },
    });
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar salida" }));

    await waitFor(() => expect(movementMutate).toHaveBeenCalledTimes(1));
    expect(movementMutate).toHaveBeenCalledWith({
      movement_on: "2026-08-24",
      amount: 150,
      movement_type: "cash_out",
      reason: "Entrega al dueño",
      purpose: "non_operating",
      cash_drawer_id: "drawer-main",
      idempotency_key: expect.any(String),
    });
  });

  it.each(["owner", "operator"])("%s paga un gasto en una sola operación y reintenta sin duplicarlo", async role => {
    identity.role = role;
    movementMutate.mockRejectedValueOnce(new Error("Respuesta perdida"));
    render(<ReportView date="2026-08-24" canClose report={report()} />);
    fireEvent.click(screen.getByRole("button", { name: "Registrar salida" }));
    const dialog = within(screen.getByRole("dialog"));
    expect(dialog.getByRole("group", { name: "¿Para qué sale el dinero?" })).toBeInTheDocument();
    expect(dialog.queryByLabelText("Registrar también como gasto pagado")).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("radio", { name: "Pagar un gasto" }));
    fireEvent.change(dialog.getByLabelText("Monto"), { target: { value: "19.99" } });
    fireEvent.change(dialog.getByLabelText("¿Qué pagaste?"), { target: { value: "Limpieza de recepción" } });
    expect(dialog.getByRole("button", { name: "Guardar gasto" })).toBeDisabled();
    fireEvent.keyDown(dialog.getByRole("combobox", { name: "Categoría" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Servicios" }));
    fireEvent.click(dialog.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(movementMutate).toHaveBeenCalledTimes(1));
    expect(await dialog.findByText("No pudimos registrar el movimiento de caja.")).toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Guardar gasto" }));
    await waitFor(() => expect(movementMutate).toHaveBeenCalledTimes(2));
    expect(movementMutate.mock.calls[0][0]).toEqual(movementMutate.mock.calls[1][0]);
    expect(movementMutate).toHaveBeenCalledWith(expect.objectContaining({ amount: 19.99, movement_type: "cash_out", purpose: "expense", reason: "Limpieza de recepción", category: "servicios" }));
    expect(expenseMutate).not.toHaveBeenCalled();
  });

  it("exige elegir el uso del dinero y no envía categoría al cambiar a entrega", async () => {
    view();
    fireEvent.click(screen.getByRole("button", { name: "Registrar salida" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.change(dialog.getByLabelText("Monto"), { target: { value: "200" } });
    fireEvent.change(dialog.getByLabelText("Motivo"), { target: { value: "Entrega al dueño" } });
    expect(dialog.getByRole("button", { name: "Registrar salida" })).toBeDisabled();
    fireEvent.click(dialog.getByRole("radio", { name: "Pagar un gasto" }));
    fireEvent.keyDown(dialog.getByRole("combobox", { name: "Categoría" }), { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Servicios" }));
    fireEvent.click(dialog.getByRole("radio", { name: "Entregar o mover dinero" }));
    expect(dialog.queryByRole("combobox", { name: "Categoría" })).not.toBeInTheDocument();
    fireEvent.click(dialog.getByRole("button", { name: "Registrar salida" }));
    await waitFor(() => expect(movementMutate).toHaveBeenCalledTimes(1));
    expect(movementMutate.mock.calls[0][0].purpose).toBe("non_operating");
    expect(movementMutate.mock.calls[0][0]).not.toHaveProperty("category");
  });

  it("bloquea un segundo envío mientras se está guardando", async () => {
    let finish!: (result: unknown) => void;
    movementMutate.mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    view();
    fireEvent.click(screen.getByRole("button", { name: "Registrar salida" }));
    const dialog = within(screen.getByRole("dialog"));
    fireEvent.click(dialog.getByRole("radio", { name: "Entregar o mover dinero" }));
    fireEvent.change(dialog.getByLabelText("Monto"), { target: { value: "200" } });
    fireEvent.change(dialog.getByLabelText("Motivo"), { target: { value: "Entrega al dueño" } });
    const save = dialog.getByRole("button", { name: "Registrar salida" });
    fireEvent.click(save); fireEvent.click(save);
    expect(movementMutate).toHaveBeenCalledTimes(1);
    finish({ id: "movement-1" });
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
  });

  it("mantiene la misma llave idempotente cuando se reintenta una entrada", async () => {
    movementMutate
      .mockRejectedValueOnce(new Error("offline"))
      .mockResolvedValueOnce({ id: "movement-2" });
    render(<ReportView date="2026-08-24" canClose report={report()} />);

    fireEvent.click(screen.getByRole("button", { name: "Agregar efectivo" }));
    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText(/Dinero que agregas después de abrir/)).toBeInTheDocument();
    expect(expenseMutate).not.toHaveBeenCalled();
    fireEvent.change(within(dialog).getByLabelText("Monto"), {
      target: { value: "200" },
    });
    fireEvent.change(within(dialog).getByLabelText("Motivo"), {
      target: { value: "Fondo para cambio" },
    });
    const submit = within(dialog).getByRole("button", { name: "Registrar entrada" });
    fireEvent.click(submit);
    await waitFor(() => expect(movementMutate).toHaveBeenCalledTimes(1));
    fireEvent.click(submit);
    await waitFor(() => expect(movementMutate).toHaveBeenCalledTimes(2));

    const firstKey = movementMutate.mock.calls[0][0].idempotency_key;
    expect(movementMutate.mock.calls[1][0].idempotency_key).toBe(firstKey);
  });

  describe("apertura contra lo que quedó ayer", () => {
    const reference = { last_count_date: "2026-09-26", cash_left: 500, later_cash: 0, expected: 500 };
    const needsOpening = (ref = reference) => report({ session: null, suggested_opening_cash: ref.expected, opening_reference: ref });

    it("pide una nota cuando hoy empieza con menos de lo que quedó ayer", async () => {
      identity.role = "owner";
      view(needsOpening());
      fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
      const dialog = within(await screen.findByRole("dialog"));
      expect(dialog.getByText("Ayer quedaron $500.00 en el corte. Cuenta el efectivo antes de confirmar.")).toBeInTheDocument();
      expect(dialog.getByLabelText("¿Con cuánto efectivo empiezas?")).toHaveValue(500);
      expect(dialog.queryByLabelText("¿Qué pasó?")).not.toBeInTheDocument();
      fireEvent.change(dialog.getByLabelText("¿Con cuánto efectivo empiezas?"), { target: { value: "450" } });
      expect(dialog.getByRole("status")).toHaveTextContent("Faltan $50.00");
      expect(dialog.getByRole("status")).toHaveTextContent("el dueño lo verá en el reporte");
      const submit = dialog.getByRole("button", { name: "Confirmar efectivo inicial" });
      expect(submit).toBeDisabled();
      fireEvent.change(dialog.getByLabelText("¿Qué pasó?"), { target: { value: " Faltaban 50 al llegar " } });
      fireEvent.click(submit);
      await waitFor(() => expect(openMutate).toHaveBeenCalledWith(expect.objectContaining({ opening_cash: 450, opening_note: "Faltaban 50 al llegar", sequence: 1 })));
    });

    it("no pide nota cuando coincide y cuenta lo que entró después del corte", async () => {
      identity.role = "owner";
      view(needsOpening({ last_count_date: "2026-09-20", cash_left: 120, later_cash: 20, expected: 140 }));
      fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
      const dialog = within(await screen.findByRole("dialog"));
      expect(dialog.getByText(/quedaron \$120\.00 en el corte y después entraron \$20\.00\. Debería haber \$140\.00\./)).toBeInTheDocument();
      fireEvent.click(dialog.getByRole("button", { name: "Confirmar efectivo inicial" }));
      await waitFor(() => expect(openMutate).toHaveBeenCalledTimes(1));
      expect(openMutate.mock.calls[0][0]).not.toHaveProperty("opening_note");
      expect(openMutate.mock.calls[0][0].opening_cash).toBe(140);
    });

    it("el personal cuenta sin sugerencia y ve la comparación hasta después", async () => {
      view(needsOpening());
      fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
      const dialog = within(await screen.findByRole("dialog"));
      expect(dialog.queryByText(/Ayer quedaron/)).not.toBeInTheDocument();
      expect(dialog.getByLabelText("¿Con cuánto efectivo empiezas?")).toHaveValue(null);
      fireEvent.change(dialog.getByLabelText("¿Con cuánto efectivo empiezas?"), { target: { value: "450" } });
      expect(dialog.queryByRole("status")).not.toBeInTheDocument();
      expect(dialog.queryByRole("button", { name: "Confirmar efectivo inicial" })).not.toBeInTheDocument();
      fireEvent.click(dialog.getByRole("button", { name: "Ver resultado" }));
      expect(dialog.getByRole("status")).toHaveTextContent("Faltan $50.00");
      expect(dialog.getByRole("status")).toHaveTextContent("Ayer quedaron $500.00 en el corte.");
      expect(dialog.getByRole("status")).toHaveTextContent("Vuelve a contar y, si sigue igual, escribe qué pasó");
      expect(dialog.getByRole("button", { name: "Confirmar efectivo inicial" })).toBeDisabled();

      // Recounting to the reference is allowed, but the first count stays.
      fireEvent.click(dialog.getByRole("button", { name: "Volver a contar" }));
      fireEvent.change(dialog.getByLabelText("¿Con cuánto efectivo empiezas?"), { target: { value: "500" } });
      fireEvent.click(dialog.getByRole("button", { name: "Ver resultado" }));
      expect(dialog.getByRole("status")).toHaveTextContent("Coincide con el último corte");
      expect(dialog.getByRole("status")).toHaveTextContent("Antes contaste $450.00. El dueño verá los dos conteos.");
      fireEvent.click(dialog.getByRole("button", { name: "Confirmar efectivo inicial" }));
      await waitFor(() => expect(openMutate).toHaveBeenCalledWith(expect.objectContaining({ opening_cash: 500, opening_note: "Primer conteo: $450.00.", sequence: 1 })));
    });

    it("si al personal le coincide a la primera no deja nota", async () => {
      view(needsOpening());
      fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
      const dialog = within(await screen.findByRole("dialog"));
      fireEvent.change(dialog.getByLabelText("¿Con cuánto efectivo empiezas?"), { target: { value: "500" } });
      fireEvent.click(dialog.getByRole("button", { name: "Ver resultado" }));
      expect(dialog.getByRole("status")).not.toHaveTextContent("Antes contaste");
      fireEvent.click(dialog.getByRole("button", { name: "Confirmar efectivo inicial" }));
      await waitFor(() => expect(openMutate).toHaveBeenCalledTimes(1));
      expect(openMutate.mock.calls[0][0]).not.toHaveProperty("opening_note");
    });

    it("el personal no ve un importe sugerido aunque no haya con qué comparar", () => {
      view(report({ suggested_opening_cash: 250 }));
      fireEvent.click(screen.getByRole("button", { name: "Abrir caja" }));
      const dialog = within(screen.getByRole("dialog"));
      expect(dialog.getByLabelText("¿Con cuánto efectivo empiezas?")).toHaveValue(null);
      expect(dialog.getByRole("button", { name: "Confirmar efectivo inicial" })).toBeDisabled();
    });

    it("el detalle del corte enseña el primer conteo de una apertura que terminó coincidiendo", () => {
      render(<CashHistory report={report({ sessions: [{ ...withdrawn, opening_cash: 500, opening_expected_cash: 500, opening_difference: null, opening_note: "Primer conteo: $450.00." }] })} />);
      fireEvent.click(screen.getByRole("button", { name: "Ver corte 1" }));
      expect(within(screen.getByRole("dialog")).getByText("Al abrir: coincidió con el corte anterior. Nota: Primer conteo: $450.00.")).toBeInTheDocument();
    });

    it("muestra la diferencia de la apertura mientras la caja sigue abierta", () => {
      view(report({ session: { ...opened, opening_cash: 450, opening_expected_cash: 500, opening_difference: -50, opening_note: "Faltaban 50" } }));
      expect(screen.getByText("Al abrir: Faltan $50.00 respecto al corte anterior.")).toBeInTheDocument();
    });
  });

  describe("anular un movimiento propio", () => {
    const at = "2026-09-27T10:00:00Z";
    const withMovements = (session: CashSessionSnapshot) => report({
      session,
      entries: [
        { id: "m-own", recorded_at: at, amount: -500, concept: "cash_out", reason: "Garrafones", operator_name: "Ricardo" },
        { id: "m-other", recorded_at: at, amount: -80, concept: "cash_out", reason: "Entrega al dueño", operator_name: "Ana" },
        { id: "pay-1", recorded_at: at, amount: 50, concept: "membership", reason: "", operator_name: "Ricardo" },
      ],
      cash_movements: [
        { id: "m-own", movement_type: "cash_out", reason: "Garrafones", amount: 500, operator_id: "ricardo", classification_status: "expense", version: 2, recorded_at: at },
        { id: "m-other", movement_type: "cash_out", reason: "Entrega al dueño", amount: 80, operator_id: "ana", classification_status: "non_operating", version: 1, recorded_at: at },
      ],
    });

    it("el operador anula su salida mientras la caja sigue abierta, con motivo", async () => {
      voidMutate.mockResolvedValue(undefined);
      view(withMovements(opened));
      const buttons = screen.getAllByRole("button", { name: /^Anular/ });
      expect(buttons).toHaveLength(1);
      fireEvent.click(screen.getByRole("button", { name: "Anular Garrafones" }));
      const dialog = within(await screen.findByRole("dialog", { name: "¿Anular esta salida?" }));
      expect(dialog.getByText(/se anula el gasto que registró/)).toBeInTheDocument();
      const submit = dialog.getByRole("button", { name: "Anular movimiento" });
      expect(submit).toBeDisabled();
      fireEvent.change(dialog.getByLabelText("¿Qué pasó?"), { target: { value: "  Escribí 500 en vez de 50 " } });
      fireEvent.click(submit);
      await waitFor(() => expect(voidMutate).toHaveBeenCalledWith({ id: "m-own", version: 2, correction_reason: "Escribí 500 en vez de 50" }));
      await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    });

    it("muestra por qué no se pudo anular", async () => {
      voidMutate.mockRejectedValue(new ApiError(422, "business", "sólo puedes anular un movimiento mientras su caja sigue abierta; pídele al dueño que lo corrija"));
      view(withMovements(opened));
      fireEvent.click(screen.getByRole("button", { name: "Anular Garrafones" }));
      const dialog = within(await screen.findByRole("dialog"));
      fireEvent.change(dialog.getByLabelText("¿Qué pasó?"), { target: { value: "Me equivoqué" } });
      fireEvent.click(dialog.getByRole("button", { name: "Anular movimiento" }));
      expect(await dialog.findByText(/pídele al dueño que lo corrija/)).toBeInTheDocument();
    });

    it("después del corte ya no ofrece anular", () => {
      view(withMovements({ ...opened, status: "closed_unverified", closed_at: "2026-09-27T12:00:00Z" }));
      expect(screen.getByText("Garrafones")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /^Anular/ })).not.toBeInTheDocument();
    });
  });
});
