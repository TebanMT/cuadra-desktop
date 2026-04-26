import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { RefundModal } from "../RefundModal";
import type { Payment } from "@/hooks/useBilling";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(async () => ({
        id: "refund-1",
        gym_id: "g1",
        member_id: "m1",
        amount: -500,
        payment_method: "cash",
        concept: "refund",
        reference: "REF-000001",
        balance_pending: 0,
        payment_date: "2026-04-25",
        created_at: "2026-04-25T10:00:00Z",
      })),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      blob: vi.fn(),
    },
  };
});

const payment: Payment = {
  id: "pay-1",
  gym_id: "g1",
  member_id: "m1",
  amount: 500,
  payment_method: "cash",
  concept: "membership",
  reference: "MEM-000087",
  balance_pending: 0,
  payment_date: "2026-04-20",
  created_at: "2026-04-20T10:00:00Z",
};

describe("RefundModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requiere razón obligatoria", async () => {
    const user = userEvent.setup();
    renderWithProviders(<RefundModal payment={payment} open onOpenChange={() => {}} />);
    await user.click(screen.getByRole("button", { name: /confirmar cancelación/i }));
    expect(await screen.findByText(/escribe una razón/i)).toBeInTheDocument();
  });

  it("muestra opción de revertir vigencia para membership", () => {
    renderWithProviders(<RefundModal payment={payment} open onOpenChange={() => {}} />);
    expect(screen.getByText(/Revertir vigencia/i)).toBeInTheDocument();
  });

  it("oculta opción de revertir vigencia para no-membership", () => {
    renderWithProviders(
      <RefundModal
        payment={{ ...payment, concept: "product" }}
        open
        onOpenChange={() => {}}
      />
    );
    expect(screen.queryByText(/Revertir vigencia/i)).not.toBeInTheDocument();
  });

  it("submite con razón y cierra el modal", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(<RefundModal payment={payment} open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText(/Razón/i), "cobro doble del 14 abr");
    await user.click(screen.getByRole("button", { name: /confirmar cancelación/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
