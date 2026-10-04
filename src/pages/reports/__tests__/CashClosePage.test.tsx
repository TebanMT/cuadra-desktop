import { MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { closeMutate, reconcileMutate, withdrawMutate, movementMutate, expenseMutate, openMutate, identity } = vi.hoisted(() => ({
  closeMutate: vi.fn(), reconcileMutate: vi.fn(), withdrawMutate: vi.fn(), movementMutate: vi.fn(), expenseMutate: vi.fn(), openMutate: vi.fn(), identity: { role: "operator" },
}));
vi.mock("@/hooks/useCashClose", () => ({
  useCashCloseReport: vi.fn(), useCloseCashRegister: () => ({ mutateAsync: closeMutate, isPending: false }),
  useReconcileCashSession: () => ({ mutateAsync: reconcileMutate, isPending: false }), useWithdrawCashSession: () => ({ mutateAsync: withdrawMutate, isPending: false }),
  useCreateCashMovement: () => ({ mutateAsync: movementMutate, isPending: false }), useOpenCashSession: () => ({ mutateAsync: openMutate, isPending: false }),
}));
vi.mock("@/hooks/useMoneyVisibility", () => ({ useMoneyVisibility: () => ({ hidden: false, fmt: (value: number) => `$${value.toFixed(2)}` }) }));
vi.mock("@/hooks/useExpenses", () => ({ useCreateExpense: () => ({ mutateAsync: expenseMutate, isPending: false }) }));
vi.mock("@/stores/useAuthStore", () => ({ useAuthStore: (selector: (state: { user: { role: string } }) => unknown) => selector({ user: identity }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/cash/CashDrawerManager", () => ({ CashDrawerManager: () => null }));
import CashClosePage, { ReportView } from "../CashClosePage";
import { useCashCloseReport } from "@/hooks/useCashClose";
import { CashHistory, periodEntries } from "@/components/cash/CashReview";
import type { CashCloseReport, CashSessionSnapshot } from "@/hooks/useCashClose";
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
  return dialog;
}
describe("Caja simple", () => {
  beforeEach(() => { vi.clearAllMocks(); identity.role = "operator"; closeMutate.mockResolvedValue({ cash_close_id: "session-1" }); movementMutate.mockResolvedValue({ id: "movement-1" }); expenseMutate.mockResolvedValue({ expense_id: "expense-1" }); openMutate.mockResolvedValue({ ...opened, id: "session-2", sequence: 2 }); });
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
    expect(target.searchParams.get("from")).toBe(target.searchParams.get("to"));
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
  it("un cobro posterior abre otro periodo con el efectivo que quedó", async () => {
    view(report({ session: withdrawn, sessions: [withdrawn], requires_new_session: true, uncovered_cash_activity: 50 }));
    const d = await count("150"); expect(openMutate).toHaveBeenCalledWith(expect.objectContaining({ opening_cash: 100, sequence: 2 }));
    fireEvent.click(d.getByRole("button", { name: "Guardar corte" }));
    await waitFor(() => expect(closeMutate).toHaveBeenCalledWith(expect.objectContaining({ session_id: "session-2", expected_cash: 150 })));
  });
  it("el historial muestra responsable, diferencia, nota y retiro", async () => {
    render(<CashHistory report={report({ sessions: [{ ...withdrawn, closed_by_name: "Ana", difference: -5, discrepancy_reason: "Pendiente de aclarar" }] })} />);
    expect(screen.getByText("Ana")).toBeInTheDocument(); expect(screen.getAllByText("Faltan $5.00")[0]).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Ver corte 1" })); const d = within(screen.getByRole("dialog")); expect(d.getByText("Nota: Pendiente de aclarar")).toBeInTheDocument(); expect(d.getByText("Se quedó en caja")).toBeInTheDocument();
  });
  it("muestra sólo los movimientos del periodo actual y deja fuera tarjeta y transferencias", () => {
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


});
