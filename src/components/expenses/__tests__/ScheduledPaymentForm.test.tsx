import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ScheduledPaymentForm } from "../ScheduledPaymentForm";
import { todayIso } from "@/lib/dates";

const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api: { get, post } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

const occurrence = {
  id: "due-rent", version: 1, template_id: "rent", name: "Renta",
  due_on: "2026-01-01", expected_amount: 1500, category: "renta",
  payment_method: "transfer", classification: "fixed", status: "pending",
} as const;
const expense = {
  id: "expense-rent", version: 1, paid_on: "2026-01-02", expense_date: "2026-01-02",
  amount: 1500, category: "renta", description: "Renta pagada",
  payment_method: "transfer", paid_from: "gym_fund", classification: "fixed", source: "manual",
  created_by: "owner", created_at: "2026-01-02T12:00:00Z",
} as const;

function show(expenses = [expense]) {
  get.mockImplementation(async (path: string) => {
    if (path === "/api/v1/expenses") return { items: expenses, total: expenses.length };
    if (path === "/api/v1/cash-movements/unclassified") return { items: [], total: 0 };
    throw new Error(`Unexpected request: ${path}`);
  });
  const onClose = vi.fn();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  render(<QueryClientProvider client={client}><ScheduledPaymentForm occurrence={occurrence} onClose={onClose} /></QueryClientProvider>);
  return onClose;
}

function choosePaymentSource() {
  fireEvent.change(screen.getByLabelText("Pagado con *"), { target: { value: "gym_fund:transfer" } });
}

describe("Registro de pagos programados vencidos", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    post.mockResolvedValue({ id: "paid-expense" });
  });

  it("permite pulsar Registrar pago y pide revisar coincidencias sin aparentar una carga", async () => {
    const onClose = show();
    const button = await screen.findByRole("button", { name: "Registrar pago" });
    expect(button).toBeEnabled();
    expect(button.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByRole("button", { name: "Cancelar" })).toBeEnabled();

    choosePaymentSource();
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("Selecciona si el pago corresponde a un gasto existente o es uno nuevo.");
    expect(screen.getByLabelText("Hay gastos registrados en esta categoría")).toHaveFocus();
    expect(post).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("registra un pago nuevo después de revisar los gastos existentes", async () => {
    const onClose = show();
    const button = await screen.findByRole("button", { name: "Registrar pago" });
    choosePaymentSource();
    fireEvent.click(button);
    fireEvent.change(screen.getByLabelText("Hay gastos registrados en esta categoría"), { target: { value: "new" } });
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    fireEvent.click(button);

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith("/api/v1/expense-occurrences/due-rent/pay", expect.objectContaining({
      paid_on: todayIso(), amount: 1500, paid_from: "gym_fund", payment_method: "transfer", idempotency_key: expect.any(String),
    }));
    expect(post.mock.calls[0][1]).not.toHaveProperty("expense_id");
  });

  it("relaciona el gasto elegido sin registrar un segundo gasto", async () => {
    const onClose = show();
    fireEvent.change(await screen.findByLabelText("Hay gastos registrados en esta categoría"), { target: { value: expense.id } });
    fireEvent.click(screen.getByRole("button", { name: "Relacionar este gasto" }));

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledOnce();
    expect(post).toHaveBeenCalledWith("/api/v1/expense-occurrences/due-rent/pay", expect.objectContaining({
      expense_id: expense.id, paid_on: expense.paid_on, amount: expense.amount,
    }));
  });

  it("registra sin pedir coincidencias cuando no hay gastos existentes", async () => {
    const onClose = show([]);
    const button = await screen.findByRole("button", { name: "Registrar pago" });
    expect(button).toBeEnabled();
    expect(screen.queryByLabelText("Hay gastos registrados en esta categoría")).not.toBeInTheDocument();
    choosePaymentSource();
    fireEvent.click(button);
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledOnce();
  });

  it("muestra carga solamente mientras el pago se guarda y bloquea envíos repetidos", async () => {
    let finish!: (value: unknown) => void;
    post.mockImplementation(() => new Promise(resolve => { finish = resolve; }));
    const onClose = show();
    const button = await screen.findByRole("button", { name: "Registrar pago" });
    fireEvent.change(screen.getByLabelText("Hay gastos registrados en esta categoría"), { target: { value: "new" } });
    choosePaymentSource();
    fireEvent.click(button);

    await waitFor(() => expect(button).toBeDisabled());
    expect(button.querySelector(".animate-spin")).not.toBeNull();
    fireEvent.click(button);
    expect(post).toHaveBeenCalledOnce();
    expect(onClose).not.toHaveBeenCalled();
    await act(async () => finish({ id: "paid-expense" }));
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
  });

  it("conserva los datos y permite reintentar después de un error", async () => {
    post.mockRejectedValueOnce(new Error("No se pudo guardar"));
    const onClose = show();
    const button = await screen.findByRole("button", { name: "Registrar pago" });
    fireEvent.change(screen.getByLabelText("Hay gastos registrados en esta categoría"), { target: { value: "new" } });
    choosePaymentSource();
    fireEvent.change(screen.getByLabelText("Concepto *"), { target: { value: "Renta de enero" } });
    fireEvent.click(button);

    expect(await screen.findByRole("alert")).toHaveTextContent("No se pudo guardar");
    expect(button).toBeEnabled();
    expect(button.querySelector(".animate-spin")).toBeNull();
    expect(screen.getByLabelText("Concepto *")).toHaveValue("Renta de enero");
    expect(screen.getByLabelText("Hay gastos registrados en esta categoría")).toHaveValue("new");
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.click(button);

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce());
    expect(post).toHaveBeenCalledTimes(2);
    expect(post.mock.calls[0][1]).toEqual(post.mock.calls[1][1]);
  });
});
