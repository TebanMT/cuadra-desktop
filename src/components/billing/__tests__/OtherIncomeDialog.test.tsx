import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { income, entry, success } = vi.hoisted(() => ({ income: vi.fn(), entry: vi.fn(), success: vi.fn() }));
vi.mock("@/hooks/useBilling", () => ({ useRegisterOtherIncome: () => ({ mutateAsync: income, isPending: false }) }));
vi.mock("@/hooks/useExpenses", () => ({ useRecordCashEntry: () => ({ mutateAsync: entry, isPending: false }) }));
vi.mock("@/components/cash/CashDrawerField", () => ({ CashDrawerField: () => null }));
vi.mock("sonner", () => ({ toast: { success } }));
import { OtherIncomeDialog } from "../OtherIncomeDialog";

function fill(kind = "earned", amount = "19.99") {
  fireEvent.change(screen.getByLabelText("Monto"), { target: { value: amount } });
  fireEvent.change(screen.getByLabelText("Fecha de recepción"), { target: { value: "2026-08-23" } });
  fireEvent.change(screen.getByLabelText("Concepto"), { target: { value: "Venta de caminadora usada" } });
}
function submit() { fireEvent.click(screen.getByRole("button", { name: "Registrar ingreso" })); }

describe("OtherIncomeDialog", () => {
  beforeEach(() => { vi.clearAllMocks(); income.mockResolvedValue({ payment_id: "payment-1" }); entry.mockResolvedValue({ id: "entry-1" }); });

  it("registra la venta como ingreso y conserva captura y llave al reintentar", async () => {
    income.mockRejectedValueOnce(new Error("No se pudo guardar"));
    const onOpenChange = vi.fn();
    render(<OtherIncomeDialog open onOpenChange={onOpenChange} />);
    fill(); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar");
    expect(screen.getByLabelText("Monto")).toHaveValue(19.99);
    expect(screen.getByLabelText("Concepto")).toHaveValue("Venta de caminadora usada");
    submit();
    await waitFor(() => expect(income).toHaveBeenCalledTimes(2));
    expect(income.mock.calls[0][0]).toEqual(income.mock.calls[1][0]);
    expect(income).toHaveBeenLastCalledWith({ amount: 19.99, payment_method: "transfer", payment_date: "2026-08-23", description: "Venta de caminadora usada", cash_destination: "gym_fund", idempotency_key: expect.any(String) });
    expect(entry).not.toHaveBeenCalled();
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("exige elegir dónde quedó el efectivo y respeta el destino fuera de caja", async () => {
    render(<OtherIncomeDialog open onOpenChange={vi.fn()} />);
    fill(); fireEvent.change(screen.getByLabelText("Método"), { target: { value: "cash" } }); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("Selecciona dónde quedó el efectivo");
    expect(income).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("¿Dónde quedó el efectivo?"), { target: { value: "gym_fund" } }); submit();
    await waitFor(() => expect(income).toHaveBeenCalledWith(expect.objectContaining({ payment_method: "cash", cash_destination: "gym_fund" })));
    expect(income.mock.calls[0][0]).not.toHaveProperty("cash_drawer_id");
  });

  it("mantiene las aportaciones fuera del formulario de ingresos", () => {
    render(<OtherIncomeDialog open onOpenChange={vi.fn()} />);
    expect(screen.queryByLabelText("¿Qué vas a registrar?")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Concepto")).toBeVisible();
    expect(screen.queryByRole("button", {name: "Registrar entrada a caja"})).not.toBeInTheDocument();
    expect(entry).not.toHaveBeenCalled();
  });

  it("rechaza cero y conceptos vacíos", async () => {
    render(<OtherIncomeDialog open onOpenChange={vi.fn()} />);
    fill("earned", "0"); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("mayor a cero");
    fireEvent.change(screen.getByLabelText("Monto"), { target: { value: "1.10" } });
    fireEvent.change(screen.getByLabelText("Concepto"), { target: { value: "" } }); submit();
    expect(await screen.findByRole("alert")).toHaveTextContent("concepto");
    expect(income).not.toHaveBeenCalled(); expect(entry).not.toHaveBeenCalled();
  });
});
