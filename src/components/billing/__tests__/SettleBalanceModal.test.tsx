import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { SettleBalanceModal } from "../SettleBalanceModal";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(async () => ({
        payment: {
          id: "pay-2",
          gym_id: "g1",
          member_id: "m1",
          amount: 100,
          payment_method: "cash",
          concept: "balance_settlement",
          reference: "MEM-000088",
          balance_pending: 0,
          payment_date: "2026-04-25",
          created_at: "2026-04-25T10:00:00Z",
        },
        remaining_balance: 100,
      })),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      blob: vi.fn(),
    },
  };
});

describe("SettleBalanceModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("pre-llena con saldo total y submite", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <SettleBalanceModal
        paymentId="pay-1"
        memberName="Juan Pérez"
        pendingBalance={200}
        open
        onOpenChange={onOpenChange}
      />
    );

    const amount = screen.getByLabelText(/Cuánto vas a abonar/i) as HTMLInputElement;
    expect(parseFloat(amount.value)).toBe(200);

    await user.click(screen.getByRole("button", { name: /Abonar/ }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });

  it("rechaza monto mayor al saldo", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <SettleBalanceModal
        paymentId="pay-1"
        memberName="Juan Pérez"
        pendingBalance={50}
        open
        onOpenChange={() => {}}
      />
    );
    const amount = screen.getByLabelText(/Cuánto vas a abonar/i);
    await user.clear(amount);
    await user.type(amount, "200");
    await user.click(screen.getByRole("button", { name: /Abonar/ }));

    expect(await screen.findByText(/abono debe ser mayor a cero/i)).toBeInTheDocument();
  });

  it("conserva la llave del abono al reintentar tras una respuesta perdida", async () => {
    const user = userEvent.setup();
    const post = vi.mocked(api.post);
    post
      .mockRejectedValueOnce(new Error("respuesta perdida"))
      .mockResolvedValueOnce({
        settlement_id: "pay-2",
        folio: "MEM-000088",
        new_balance_pending: 0,
      });
    renderWithProviders(
      <SettleBalanceModal
        paymentId="pay-1"
        memberName="Juan Pérez"
        pendingBalance={200}
        open
        onOpenChange={() => {}}
      />
    );

    const submit = screen.getByRole("button", { name: /Abonar/ });
    await user.click(submit);
    await screen.findByText(/No pudimos registrar el abono/i);
    await user.click(submit);
    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));

    const first = post.mock.calls[0][1] as { idempotency_key: string };
    const second = post.mock.calls[1][1] as { idempotency_key: string };
    expect(first.idempotency_key).toBeTruthy();
    expect(second.idempotency_key).toBe(first.idempotency_key);
  });
});
