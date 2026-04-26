import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { SettleBalanceModal } from "../SettleBalanceModal";

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
});
