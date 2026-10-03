import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { mutateAsync } = vi.hoisted(() => ({ mutateAsync: vi.fn() }));

vi.mock("@/hooks/useBilling", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/hooks/useBilling")>();
  return {
    ...original,
    useCorrectPayment: () => ({ mutateAsync, isPending: false }),
    usePaymentCorrectionHistory: () => ({ data: { items: [], total: 0 } }),
  };
});

vi.mock("@/components/cash/CashDrawerField", () => ({ CashDrawerField: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));

import { PaymentCorrectionModal } from "../PaymentCorrectionModal";
import type { Payment } from "@/hooks/useBilling";

const payment: Payment = {
  id: "payment-1",
  version: 3,
  gym_id: "gym-1",
  member_id: "member-1",
  member_name: "Ana",
  amount: 400,
  recognized_amount: 400,
  payment_method: "cash",
  cash_drawer_id: "drawer-1",
  concept: "membership",
  reference: "MEM-0001",
  balance_pending: 100,
  payment_date: "2026-08-20",
  created_at: "2026-08-20T12:00:00Z",
};

describe("PaymentCorrectionModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mutateAsync.mockResolvedValue({
      payment_version: 4,
      before: { amount: 400, balance_pending: 100 },
      after: { amount: 40, balance_pending: 460 },
    });
  });

  it("corrects 400→40 without inventing a refund and re-derives the pending obligation", async () => {
    const onOpenChange = vi.fn();
    render(<PaymentCorrectionModal payment={payment} open onOpenChange={onOpenChange} />);

    fireEvent.change(screen.getByLabelText("Monto registrado"), { target: { value: "40" } });
    expect(screen.getByText(/quedaría pendiente \$460\.00/)).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Motivo de la corrección"), {
      target: { value: "Se capturó un cero extra" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      expected_version: 3,
      reason: "Se capturó un cero extra",
      amount: 40,
      payment_method: "cash",
      payment_date: "2026-08-20",
      cash_drawer_id: "drawer-1",
      idempotency_key: expect.any(String),
    });
    expect(mutateAsync.mock.calls[0][0]).not.toHaveProperty("refund_method");
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("keeps the same idempotency key when an identical retry follows a lost response", async () => {
    mutateAsync
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce({
        payment_version: 4,
        before: { amount: 400, balance_pending: 100 },
        after: { amount: 40, balance_pending: 460 },
      });
    render(<PaymentCorrectionModal payment={payment} open onOpenChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Monto registrado"), { target: { value: "40" } });
    fireEvent.change(screen.getByLabelText("Motivo de la corrección"), {
      target: { value: "Se capturó un cero extra" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    fireEvent.click(screen.getByRole("button", { name: "Guardar corrección" }));
    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(2));

    expect(mutateAsync.mock.calls[0][0].idempotency_key)
      .toBe(mutateAsync.mock.calls[1][0].idempotency_key);
  });

  it("refuses to use the generic path for concepts with dedicated consequences", () => {
    render(
      <PaymentCorrectionModal
        payment={{ ...payment, concept: "balance_settlement" }}
        open
        onOpenChange={vi.fn()}
      />,
    );
    expect(screen.getByText(/Corrige los productos desde la venta/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Guardar corrección" })).not.toBeInTheDocument();
  });

  it("annuls only a false extraordinary income without mixing field edits", async () => {
    mutateAsync.mockResolvedValueOnce({
      payment_version: 4,
      annulled: true,
      before: { amount: 400, balance_pending: 0, annulled: false },
      after: { amount: 400, balance_pending: 0, annulled: true },
    });
    render(
      <PaymentCorrectionModal
        payment={{ ...payment, concept: "other", member_id: null, balance_pending: 0 }}
        open
        onOpenChange={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByLabelText("Anular ingreso inexistente"));
    fireEvent.change(screen.getByLabelText("Motivo de la corrección"), {
      target: { value: "Nunca ocurrió la venta del activo" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Anular ingreso" }));

    await waitFor(() => expect(mutateAsync).toHaveBeenCalledTimes(1));
    expect(mutateAsync).toHaveBeenCalledWith({
      expected_version: 3,
      reason: "Nunca ocurrió la venta del activo",
      annul: true,
      idempotency_key: expect.any(String),
    });
  });
});
