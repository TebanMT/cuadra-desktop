import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseForm, type ExpenseFormValues } from "../ExpenseForm";
vi.mock("@/components/cash/CashDrawerField", () => ({ CashDrawerField: () => null }));
const initial: Partial<ExpenseFormValues> = { amount: "100", category: "servicios", payment_method: "transfer", paid_from: "gym_fund", expense_date: "2026-01-05", description: "Limpieza" };
const submit = () => fireEvent.click(screen.getByRole("button", { name: /Registrar gasto|Guardar cambios/ }));
describe("Captura cotidiana de gastos", () => {
  it.each(["19.99", "1.10", "0.29"])("acepta %s sin errores de representación decimal", amount => {
    const save=vi.fn();render(<ExpenseForm mode="create" initial={{ ...initial, amount }} submitting={false} onSubmit={save} onCancel={() => {}} />);submit();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ amount: Number(amount) }));
  });
  it.each([["0", "mayor a cero"], ["-1", "mayor a cero"], ["1.999", "hasta dos decimales"]])("explica por qué rechaza %s", (amount, message) => {
    const save=vi.fn();render(<ExpenseForm mode="create" initial={{ ...initial, amount }} submitting={false} onSubmit={save} onCancel={() => {}} />);submit();
    expect(save).not.toHaveBeenCalled();expect(screen.getByText(new RegExp(message))).toBeInTheDocument();
  });
  it("conserva una corrección y su motivo después de un fallo", () => {
    const save=vi.fn();const props={ mode: "edit" as const, submitting: false, onSubmit: save, onCancel: () => {} };
    const { rerender }=render(<ExpenseForm {...props} initial={{ ...initial }} />);
    fireEvent.change(screen.getByLabelText(/^Monto/), { target: { value: "200" } });
    fireEvent.change(screen.getByLabelText(/^Motivo de la corrección/), { target: { value: "El recibo fue por 200" } });submit();
    rerender(<ExpenseForm {...props} initial={{ ...initial }} submitting serverError="No se pudo guardar" />);
    rerender(<ExpenseForm {...props} initial={{ ...initial }} serverError="No se pudo guardar" />);
    expect(screen.getByLabelText(/^Monto/)).toHaveValue(200);submit();
    expect(save).toHaveBeenLastCalledWith(expect.objectContaining({ amount: 200, correction_reason: "El recibo fue por 200" }));
  });
  it("pide elegir un origen del dinero", () => {
    const save=vi.fn();render(<ExpenseForm mode="create" initial={{ ...initial, paid_from: "" }} submitting={false} onSubmit={save} onCancel={() => {}} />);submit();
    expect(save).not.toHaveBeenCalled();expect(screen.getByText("Selecciona de dónde salió el dinero.")).toBeInTheDocument();
  });
  it("pide revisar coincidencias y reutiliza la salida seleccionada", () => {
    const save=vi.fn();render(<ExpenseForm mode="create" initial={{ ...initial, payment_method: "cash", paid_from: "cash_drawer" }} cashMovements={[{ id: "cash1", version: 1, movement_on: "2026-01-05", amount: 100, movement_type: "cash_out", classification_status: "unclassified", reason: "Limpieza", operator_id: "op" }]} submitting={false} onSubmit={save} onCancel={() => {}} />);
    submit();expect(save).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Hay salidas de caja por este monto"),{ target:{value:"cash1"} });submit();
    expect(save).toHaveBeenCalledWith(expect.objectContaining({ cash_movement_id: "cash1", amount: 100, expense_date: "2026-01-05" }));
  });
});
