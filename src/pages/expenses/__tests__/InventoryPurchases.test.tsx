import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { payMutate } = vi.hoisted(() => ({ payMutate: vi.fn() }));

vi.mock("@/hooks/useExpenses", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/hooks/useExpenses")>();
  return { ...actual, usePayInventoryPurchase: () => ({ mutateAsync: payMutate, isPending: false }) };
});
vi.mock("@/hooks/useMoneyVisibility", () => ({ useMoneyVisibility: () => ({ fmt: (value: number) => `$${value.toFixed(2)}`, hidden: false }) }));
vi.mock("@/components/cash/CashDrawerField", () => ({
  CashDrawerField: ({ value, onChange }: { value?: string; onChange(value?: string): void }) => (
    <select aria-label="Cajón" value={value ?? ""} onChange={(event) => onChange(event.target.value || undefined)}>
      <option value="">Selecciona</option><option value="drawer-main">Caja principal</option>
    </select>
  ),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { InventoryPurchasesPanel, PayInventoryPurchaseDialog } from "../ExpensesPage";
import type { InventoryPurchase } from "@/hooks/useExpenses";

const purchase: InventoryPurchase = {
  id: "purchase-1", version: 2, stock_movement_id: "movement-1", product_id: "product-1", product_name: "Agua",
  quantity: 4, unit_cost: 8.5, total_amount: 34, status: "unpaid", created_by: "owner-1", created_at: "2026-08-24T12:00:00Z",
};

describe("compras de inventario pendientes", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("explica que el stock ya llegó y permite iniciar el pago", () => {
    const onPay = vi.fn();
    const onCorrect = vi.fn();
    render(<InventoryPurchasesPanel items={[purchase]} loading={false} error={null} onPay={onPay} onCorrect={onCorrect} />);
    expect(screen.getByText("Compras por pagar")).toBeInTheDocument();
    expect(screen.getByText(/Recibido 24 ago 2026/)).toHaveTextContent("4 uds × $8.50");
    fireEvent.click(screen.getByRole("button", { name: "Registrar pago" }));
    expect(onPay).toHaveBeenCalledWith(purchase);
    fireEvent.click(screen.getByRole("button", { name: "Corregir" }));
    expect(onCorrect).toHaveBeenCalledWith(purchase);
  });

  it("registra una sola salida de caja y conserva la key al reintentar", async () => {
    payMutate.mockRejectedValueOnce(new Error("sin respuesta")).mockResolvedValueOnce({ ...purchase, status: "paid", version: 3 });
    const onClose = vi.fn();
    render(<PayInventoryPurchaseDialog purchase={purchase} onClose={onClose} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Método"), { target: { value: "cash" } });
    fireEvent.change(within(dialog).getByLabelText("Pagado desde"), { target: { value: "cash_drawer" } });
    fireEvent.change(within(dialog).getByLabelText("Cajón"), { target: { value: "drawer-main" } });
    const submit = within(dialog).getByRole("button", { name: "Registrar pago" });
    fireEvent.click(submit);
    await waitFor(() => expect(payMutate).toHaveBeenCalledTimes(1));
    fireEvent.click(submit);
    await waitFor(() => expect(payMutate).toHaveBeenCalledTimes(2));

    const first = payMutate.mock.calls[0][0];
    const second = payMutate.mock.calls[1][0];
    expect(first).toEqual(expect.objectContaining({ id: "purchase-1", version: 2, payment_method: "cash", paid_from: "cash_drawer", cash_drawer_id: "drawer-main", idempotency_key: expect.any(String) }));
    expect(second.idempotency_key).toBe(first.idempotency_key);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("vincula una salida existente sin crear una segunda", async () => {
    payMutate.mockResolvedValueOnce({ ...purchase, status: "paid", version: 3 });
    render(<PayInventoryPurchaseDialog purchase={purchase} cashMovements={[{ id: "cash-out-1", version: 1, movement_on: "2026-08-24", amount: 34, movement_type: "cash_out", reason: "Compra de aguas", operator_id: "operator-1", cash_drawer_id: "drawer-main", classification_status: "unclassified" }]} onClose={vi.fn()} />);
    const dialog = screen.getByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("Método"), { target: { value: "cash" } });
    fireEvent.change(within(dialog).getByLabelText("Pagado desde"), { target: { value: "cash_drawer" } });
    fireEvent.change(within(dialog).getByLabelText("Salida de caja ya registrada"), { target: { value: "cash-out-1" } });
    expect(within(dialog).getByText("Esta salida ya se descontó de caja.")).toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "Registrar pago" }));
    await waitFor(() => expect(payMutate).toHaveBeenCalledTimes(1));
    expect(payMutate).toHaveBeenCalledWith(expect.objectContaining({ cash_movement_id: "cash-out-1", cash_drawer_id: "drawer-main", paid_on: "2026-08-24" }));
  });
});

it("mantiene el pago remoto en la web y señala la recepción pendiente",()=>{
 render(<InventoryPurchasesPanel items={[{...purchase,remote:true,stock_movement_id:null,receipt_status:"pending"}]} loading={false} error={null} onPay={vi.fn()} onCorrect={vi.fn()}/>);
 expect(screen.getByText(/Pendiente de recibir/)).toBeInTheDocument();
 expect(screen.queryByRole("button",{name:"Registrar pago"})).not.toBeInTheDocument();
 expect(screen.getByText("Pago administrado en la web")).toBeInTheDocument();
});
