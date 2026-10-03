import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mutateAsync, refetch, sale, auth } = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  auth: { role: "owner" as "owner" | "operator" },
  sale: {
    id: "sale-1",
    version: 7,
    payment_id: "payment-1",
    folio: "V-0040",
    member_id: "member-1",
    subtotal: 40,
    discount: 0,
    total: 40,
    collected: 40,
    refunded: 0,
    refundable: 40,
    balance_pending: 0,
    lines: [
      {
        sale_item_id: "line-1",
        product_id: "product-1",
        product_name: "Agua",
        quantity: 40,
        unit_price: 1,
        line_total: 40,
        cost_complete: true,
      },
    ],
  },
}));

vi.mock("@/hooks/useSales", () => ({
  useSaleDetail: () => ({
    data: sale,
    isLoading: false,
    isError: false,
    refetch,
  }),
  useCorrectSale: () => ({ mutateAsync, isPending: false }),
}));

vi.mock("@/hooks/useProducts", () => ({
  useActiveProducts: () => ({ data: [
    { id: "product-1", name: "Agua", price: 1, stock: 100 },
    { id: "product-2", name: "Suero", price: 1, stock: 20 },
  ], isLoading: false }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn(), warning: vi.fn(), error: vi.fn() },
}));

vi.mock("@/components/cash/CashDrawerField", () => ({
  CashDrawerField: () => null,
}));

vi.mock("@/stores/useAuthStore", () => ({
  useAuthStore: (selector: (state: { user: { role: "owner" | "operator" } }) => unknown) =>
    selector({ user: { role: auth.role } }),
}));

import { SaleCorrectionModal } from "../SaleCorrectionModal";

function correctionResponse(resolution: "settled" | "refund_pending" = "settled") {
  return {
    correction_id: "correction-1",
    idempotency_key: "same-key",
    sale: { ...sale, version: 8, subtotal: 4, total: 4, collected: 4, lines: [{ ...sale.lines[0], quantity: 4, line_total: 4 }] },
    inventory_effects: [{ product_id: "product-1", delta: 36, stock_after: 50 }],
    money_effect: {
      old_sale_total: 40,
      new_sale_total: 4,
      collected: 4,
      refund_due: resolution === "refund_pending" ? 36 : 0,
      money_status: resolution,
    },
  };
}

function changeFortyToFour() {
  fireEvent.change(screen.getByLabelText("Agua, cantidad correcta"), {
    target: { value: "4" },
  });
}

describe("SaleCorrectionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = "owner";
    sale.subtotal = 40;
    sale.discount = 0;
    sale.total = 40;
    sale.collected = 40;
    sale.refundable = 40;
    mutateAsync.mockResolvedValue(correctionResponse());
  });

  it("previews 40→4, restores 36 units and record_only never invents a refund", async () => {
    const onOpenChange = vi.fn();
    render(
      <SaleCorrectionModal
        saleId="sale-1"
        open
        onOpenChange={onOpenChange}
      />
    );

    changeFortyToFour();

    expect(screen.getByText("Restaura 36 unidades")).toBeInTheDocument();
    expect(screen.getByText("Se restauran 36 unidades al inventario.")).toBeInTheDocument();
    expect(screen.getByText("$40.00")).toBeInTheDocument();
    expect(screen.getByText("$4.00")).toBeInTheDocument();
    expect(screen.getByText("Sólo estaba mal capturado")).toBeInTheDocument();
    expect(screen.getByText("Sí cobré de más; devolver ahora")).toBeInTheDocument();
    expect(screen.getByText("Sí cobré de más; devolver después")).toBeInTheDocument();

    fireEvent.click(screen.getByText("Sólo estaba mal capturado"));
    fireEvent.change(screen.getByLabelText(/Motivo de la corrección/), {
      target: { value: "Se capturó un cero extra" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      expected_version: 7,
      idempotency_key: expect.any(String),
      reason: "Se capturó un cero extra",
      lines: [{ sale_item_id: "line-1", product_id: "product-1", quantity: 4 }],
      money_resolution: "record_only",
    });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("requires a method before returning an overcharge now", async () => {
    render(<SaleCorrectionModal saleId="sale-1" open onOpenChange={vi.fn()} />);
    changeFortyToFour();
    fireEvent.click(screen.getByText("Sí cobré de más; devolver ahora"));
    fireEvent.change(screen.getByLabelText(/Motivo de la corrección/), {
      target: { value: "Cantidad equivocada" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    expect(await screen.findByText("Elige cómo se devolverá la diferencia."))
      .toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();

    fireEvent.click(screen.getByText("Efectivo"));
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      money_resolution: "refund_excess",
      refund_method: "cash",
    });
  });

  it("can leave the real overcharge pending without moving money now", async () => {
    mutateAsync.mockResolvedValueOnce(correctionResponse("refund_pending"));
    render(<SaleCorrectionModal saleId="sale-1" open onOpenChange={vi.fn()} />);
    changeFortyToFour();
    fireEvent.click(screen.getByText("Sí cobré de más; devolver después"));
    fireEvent.change(screen.getByLabelText(/Motivo de la corrección/), {
      target: { value: "Cliente pagó 40; falta devolver" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      money_resolution: "refund_pending",
    });
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty("refund_method");
  });

  it("limits an operator to record_only and explains when the owner is required", async () => {
    auth.role = "operator";
    render(<SaleCorrectionModal saleId="sale-1" open onOpenChange={vi.fn()} />);
    changeFortyToFour();

    expect(screen.getByText(/Puedes corregir ventas recientes/)).toBeInTheDocument();
    expect(screen.getByText(/Pide al dueño la devolución/)).toBeInTheDocument();
    expect(screen.queryByText("Sí cobré de más; devolver ahora")).not.toBeInTheDocument();
    expect(screen.queryByText("Sí cobré de más; devolver después")).not.toBeInTheDocument();

    fireEvent.change(screen.getByLabelText(/Motivo de la corrección/), {
      target: { value: "Capturé un cero de más" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ money_resolution: "record_only" });
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty("refund_method");
  });

  it("previews a discounted correction with the backend proportional rule", () => {
    sale.discount = 8;
    sale.total = 32;
    sale.collected = 32;
    sale.refundable = 32;
    render(<SaleCorrectionModal saleId="sale-1" open onOpenChange={vi.fn()} />);

    changeFortyToFour();

    expect(screen.getByText("$3.20")).toBeInTheDocument();
    expect(screen.getByText(/porcentaje de descuento original/i)).toBeInTheDocument();
  });

  it("replaces a wrongly captured product while keeping the original sale item trace", async () => {
    render(<SaleCorrectionModal saleId="sale-1" open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Producto correcto para Agua"), { target: { value: "product-2" } });
    fireEvent.change(screen.getByLabelText(/Motivo de la corrección/), { target: { value: "Era suero, no agua" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      lines: [{ sale_item_id: "line-1", product_id: "product-2", quantity: 40 }],
      money_resolution: "record_only",
    });
  });

  it("requires an explicit destination for the extra amount when quantity increases", async () => {
    render(<SaleCorrectionModal saleId="sale-1" open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Agua, cantidad correcta"), { target: { value: "41" } });
    expect(screen.getByText(/Qué pasó con los \$1.00 adicionales/)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Ya se habían cobrado"));
    fireEvent.change(screen.getByLabelText(/Motivo de la corrección/), { target: { value: "Faltó una pieza en la captura" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ increase_resolution: "already_collected", money_resolution: "record_only", lines: [{ quantity: 41 }] });
  });

  it("annuls a sale captured by mistake instead of sending an empty replacement", async () => {
    render(<SaleCorrectionModal saleId="sale-1" open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Agua, cantidad correcta"), { target: { value: "0" } });
    expect(screen.getByText(/la venta quedará anulada/i)).toBeInTheDocument();
    fireEvent.click(screen.getByText("Sólo estaba mal capturado"));
    fireEvent.change(screen.getByLabelText(/Motivo de la corrección/), { target: { value: "La venta nunca ocurrió" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({ annul: true, lines: [], money_resolution: "record_only" });
  });
});
