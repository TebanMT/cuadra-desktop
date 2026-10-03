import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, mutateAsync, refetch, settleAsync, sale } = vi.hoisted(() => ({
  auth: { role: "owner" as "owner" | "operator" },
  mutateAsync: vi.fn(),
  refetch: vi.fn(),
  settleAsync: vi.fn(),
  sale: {
    id: "sale-1",
    version: 1,
    payment_id: "payment-1",
    folio: "V-0012",
    subtotal: 30,
    discount: 3,
    total: 27,
    collected: 27,
    refunded: 0,
    refundable: 27,
    balance_pending: 0,
    payment: {
      amount: 27,
      recognized_amount: 27,
      payment_method: "cash" as const,
      payment_date: "2026-08-24",
    },
    pending_refund_due: 0,
    pending_refunds: [],
    lines: [
      {
        sale_item_id: "line-1",
        product_id: "product-1",
        product_name: "Agua",
        quantity: 3,
        unit_price: 10,
        line_total: 30,
        cost_complete: true,
        refundable_quantity: 3,
        refunded_quantity: 0,
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
  useRefundSale: () => ({ mutateAsync, isPending: false }),
  useSettlePendingSaleRefund: () => ({ mutateAsync: settleAsync, isPending: false }),
}));

vi.mock("@/stores/useAuthStore", () => ({
  useAuthStore: (selector: (state: { user: { role: "owner" | "operator" } }) => unknown) =>
    selector({ user: { role: auth.role } }),
}));

vi.mock("sonner", () => ({
  toast: { success: vi.fn() },
}));

vi.mock("@/components/cash/CashDrawerField", () => ({
  CashDrawerField: ({
    value,
    onChange,
  }: {
    value?: string;
    onChange(value: string): void;
  }) => (
    <select
      aria-label="Caja de prueba"
      value={value ?? ""}
      onChange={(event) => onChange(event.target.value)}
    >
      <option value="">Elige una caja</option>
      <option value="drawer-front">Recepción</option>
      <option value="drawer-back">Caja secundaria</option>
    </select>
  ),
}));

import { ProductRefundModal } from "../ProductRefundModal";

const DISPOSITIONS = [
  ["returned_to_stock", /Regresó en buen estado/],
  ["damaged", /Regresó dañado/],
  ["not_returned", /No regresó/],
] as const;

async function fillRefund(dispositionLabel: RegExp) {
  const user = userEvent.setup();
  await user.click(screen.getByRole("checkbox", { name: "Devolver Agua" }));
  fireEvent.change(screen.getByLabelText("Cantidad a devolver de Agua"), {
    target: { value: "2" },
  });
  await user.click(screen.getByRole("combobox", { name: "Disposición de Agua" }));
  await user.click(screen.getByRole("option", { name: dispositionLabel }));
  await user.click(screen.getByText("Tarjeta"));
  await user.type(screen.getByLabelText(/^Motivo/), "Cliente solicitó devolución");
  return user;
}

describe("ProductRefundModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = "owner";
    sale.balance_pending = 0;
    sale.refundable = 27;
    mutateAsync.mockResolvedValue({ refund_id: "refund-1", amount: 18, balance_cancelled: 0 });
  });

  it.each(DISPOSITIONS)(
    "envía la disposición %s con líneas, método real, preview e idempotencia",
    async (disposition, label) => {
      const onOpenChange = vi.fn();
      render(<ProductRefundModal saleId="sale-1" open onOpenChange={onOpenChange} />);

      const user = await fillRefund(label);

      // La venta tenía 10% de descuento: 2 × $10 distribuidos = $18.
      expect(screen.getByText("$18.00")).toBeInTheDocument();

      await user.click(screen.getByRole("button", { name: "Registrar devolución" }));

      await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
      expect(mutateAsync).toHaveBeenCalledWith({
        reason: "Cliente solicitó devolución",
        method: "card",
        payment_date: expect.any(String),
        idempotency_key: expect.any(String),
        line_items: [
          {
            sale_item_id: "line-1",
            quantity: 2,
            disposition,
          },
        ],
      });
      expect(onOpenChange).toHaveBeenCalledWith(false);
    }
  );

  it("conserva la misma llave idempotente al reintentar el mismo intento", async () => {
    mutateAsync
      .mockRejectedValueOnce(new Error("respuesta perdida"))
      .mockResolvedValueOnce({ refund_id: "refund-1", amount: 18, balance_cancelled: 0 });
    render(<ProductRefundModal saleId="sale-1" open onOpenChange={vi.fn()} />);
    const user = await fillRefund(/Regresó en buen estado/);

    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));
    expect(await screen.findByText("No pudimos registrar la devolución.")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));
    expect(mutateAsync.mock.calls[1][0].idempotency_key).toBe(
      mutateAsync.mock.calls[0][0].idempotency_key
    );
  });

  it("no permite que un operador invoque la devolución aunque abra el modal directamente", () => {
    auth.role = "operator";
    render(<ProductRefundModal saleId="sale-1" open onOpenChange={vi.fn()} />);

    expect(screen.getByText(/Solo el dueño del gym/)).toBeInTheDocument();
    expect(screen.queryByRole("checkbox", { name: "Devolver Agua" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Registrar devolución" })).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("separa deuda cancelada de dinero físico cuando la venta estaba fiada", async () => {
    sale.balance_pending = 10;
    sale.refundable = 8;
    mutateAsync.mockResolvedValueOnce({
      refund_id: "refund-1",
      amount: 8,
      balance_cancelled: 10,
    });
    render(<ProductRefundModal saleId="sale-1" open onOpenChange={vi.fn()} />);
    const user = await fillRefund(/Regresó en buen estado/);

    expect(screen.getAllByText("$8.00")).toHaveLength(2);
    expect(screen.getByText("$10.00")).toBeInTheDocument();
    expect(screen.getByText(/De \$18.00/)).toHaveTextContent(
      /se cancelan \$10.00.*se devuelven \$8.00/
    );

    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
  });

  it("atribuye una devolución cash al cajón físico del que sale", async () => {
    const user = userEvent.setup();
    render(<ProductRefundModal saleId="sale-1" open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("checkbox", { name: "Devolver Agua" }));
    await user.selectOptions(screen.getByLabelText("Caja de prueba"), "drawer-back");
    await user.type(screen.getByLabelText(/^Motivo/), "Producto regresado");
    await user.click(screen.getByRole("button", { name: "Registrar devolución" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      method: "cash",
      cash_drawer_id: "drawer-back",
    });
  });
});
