import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { auth, mutateAsync } = vi.hoisted(() => ({
  auth: { role: "owner" as "owner" | "operator" },
  mutateAsync: vi.fn(),
}));

vi.mock("@/hooks/useSales", () => ({
  useSettlePendingSaleRefund: () => ({ mutateAsync, isPending: false }),
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

import { PendingRefundsPanel } from "../PendingRefundsPanel";

const pending = [
  {
    correction_id: "correction-1",
    amount_due: 36,
    created_at: "2026-08-23T20:00:00Z",
    reason: "Se cobraron 40 aguas y eran 4",
  },
];

describe("PendingRefundsPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.role = "owner";
    mutateAsync.mockResolvedValue({
      refund_id: "refund-1",
      amount: 36,
      payment_method: "card",
      refunded_on: "2026-08-24",
      pending_amount: 0,
    });
  });

  it("muestra el monto pendiente y permite al dueño liquidarlo con método real", async () => {
    const user = userEvent.setup();
    render(
      <PendingRefundsPanel
        saleId="sale-1"
        pendingRefundDue={36}
        pendingRefunds={pending}
        defaultMethod="cash"
      />
    );

    expect(screen.getByText("$36.00")).toBeInTheDocument();
    expect(screen.getByText(/todavía no han salido del gym/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entregar ahora" }));
    await user.click(screen.getByText("Tarjeta"));
    await user.click(screen.getByRole("button", { name: "Confirmar entrega" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      payment_method: "card",
      payment_date: expect.any(String),
      idempotency_key: expect.any(String),
    });
  });

  it("un operador puede ver la deuda pero no declararla entregada", () => {
    auth.role = "operator";
    render(
      <PendingRefundsPanel
        saleId="sale-1"
        pendingRefundDue={36}
        pendingRefunds={pending}
      />
    );

    expect(screen.getByText("$36.00")).toBeInTheDocument();
    expect(screen.getByText(/Solo el dueño puede confirmar/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Entregar ahora" })).not.toBeInTheDocument();
    expect(mutateAsync).not.toHaveBeenCalled();
  });

  it("atribuye una devolución en efectivo al cajón físico elegido", async () => {
    const user = userEvent.setup();
    render(
      <PendingRefundsPanel
        saleId="sale-1"
        pendingRefundDue={36}
        pendingRefunds={pending}
        defaultMethod="cash"
      />
    );

    await user.click(screen.getByRole("button", { name: "Entregar ahora" }));
    await user.selectOptions(screen.getByLabelText("Caja de prueba"), "drawer-back");
    await user.click(screen.getByRole("button", { name: "Confirmar entrega" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync.mock.calls[0][0]).toMatchObject({
      payment_method: "cash",
      cash_drawer_id: "drawer-back",
    });
  });
});
