import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { RefundModal } from "../RefundModal";
import type { Payment } from "@/hooks/useBilling";
import { api } from "@/lib/api";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/refund-preview")) {
          return {
            selected_payment_id: "pay-1",
            root_payment_id: "pay-1",
            selected_refundable: 500,
            aggregate_collected: 500,
            aggregate_refunded: 0,
            aggregate_refundable: 500,
            balance_pending: 0,
            revert_membership_total: 500,
            membership_revert_allowed: true,
          };
        }
        if (path.includes("/cash-drawers")) {
          return {
            items: [
              {
                id: "drawer-main",
                code: "main",
                name: "Caja principal",
                active: true,
                is_main: true,
                version: 1,
              },
            ],
          };
        }
        return null;
      }),
      post: vi.fn(async () => ({
        id: "refund-1",
        version: 1,
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
  version: 1,
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
    await user.click(await screen.findByRole("button", { name: /registrar devolución/i }));
    expect(await screen.findByText(/escribe una razón/i)).toBeInTheDocument();
  });

  it("muestra opción explícita para cancelar la membresía", async () => {
    renderWithProviders(<RefundModal payment={payment} open onOpenChange={() => {}} />);
    expect(await screen.findByText(/Cancelar también esta membresía/i)).toBeInTheDocument();
  });

  it("oculta opción de revertir vigencia para no-membership", () => {
    renderWithProviders(
      <RefundModal
        payment={{ ...payment, concept: "product" }}
        open
        onOpenChange={() => {}}
      />
    );
    expect(screen.queryByText(/Cancelar también esta membresía/i)).not.toBeInTheDocument();
  });

  it("nunca devuelve una venta de productos sin elegir sus líneas", () => {
    renderWithProviders(
      <RefundModal
        payment={{ ...payment, concept: "product", sale_id: "sale-1" }}
        open
        onOpenChange={() => {}}
      />
    );

    expect(screen.getByText(/se devuelven desde el detalle de la venta/i)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /registrar devolución/i })).not.toBeInTheDocument();
    expect(api.post).not.toHaveBeenCalled();
  });

  it("no ofrece una devolución ficticia sin salida de dinero", () => {
    renderWithProviders(<RefundModal payment={payment} open onOpenChange={() => {}} />);
    expect(screen.queryByText("No se devuelve")).not.toBeInTheDocument();
  });

  it("incluye tarjeta como método real de devolución", () => {
    renderWithProviders(<RefundModal payment={payment} open onOpenChange={() => {}} />);
    expect(screen.getByText("Se devuelve a la tarjeta")).toBeInTheDocument();
  });

  it("submite con razón y cierra el modal", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(<RefundModal payment={payment} open onOpenChange={onOpenChange} />);
    await user.type(screen.getByLabelText(/Razón/i), "cobro doble del 14 abr");
    await user.click(await screen.findByRole("button", { name: /registrar devolución/i }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(api.post).toHaveBeenCalledWith(
      "/api/v1/payments/pay-1/refund",
      expect.objectContaining({
        amount: 500,
        idempotency_key: expect.any(String),
        payment_method: "cash",
        revert_membership: false,
      }),
    );
  });
});
