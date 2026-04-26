import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { PaymentModal } from "../PaymentModal";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/membership-types")) {
          return [
            {
              id: "type-1",
              name: "Mensual",
              price: 500,
              duration_days: 30,
              enrollment_fee: 0,
              maintenance_fee: 0,
              active: true,
            },
            {
              id: "type-2",
              name: "Trimestral",
              price: 1200,
              duration_days: 90,
              enrollment_fee: 0,
              maintenance_fee: 0,
              active: true,
            },
          ];
        }
        if (path.includes("/sync/status")) {
          return { state: "online", last_sync_at: null, pending_count: 0, last_error: null };
        }
        return null;
      }),
      post: vi.fn(async () => ({
        payment: {
          id: "pay-1",
          gym_id: "g1",
          member_id: "m1",
          amount: 500,
          payment_method: "cash",
          concept: "membership",
          reference: "MEM-000087",
          balance_pending: 0,
          payment_date: "2026-04-25",
          created_at: "2026-04-25T10:00:00Z",
          receipt_sent_via: null,
        },
        membership_id: "ms-2",
        new_expiry_date: "2026-05-25",
        balance_pending: 0,
      })),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      blob: vi.fn(),
    },
  };
});

const member = {
  id: "m1",
  full_name: "Juan Pérez",
  phone: "5512345678",
  enrollment_paid: true,
  last_maintenance_paid: undefined,
};

const currentMembership = {
  id: "ms-1",
  membership_type_id: "type-1",
  type_name: "Mensual",
  price: 500,
  start_date: "2026-04-01",
  expiry_date: "2026-04-30",
  status: "active" as const,
  duration_days_snapshot: 30,
};

describe("PaymentModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("muestra el total y el botón refleja el monto", async () => {
    renderWithProviders(
      <PaymentModal
        member={member}
        currentMembership={currentMembership}
        open
        onOpenChange={() => {}}
      />
    );

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Cobrar \$500\.00/ })).toBeInTheDocument()
    );
  });

  it("aplica descuento y actualiza el total", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PaymentModal
        member={member}
        currentMembership={currentMembership}
        open
        onOpenChange={() => {}}
      />
    );

    await waitFor(() => screen.getByRole("button", { name: /Cobrar \$500\.00/ }));

    await user.click(screen.getByRole("button", { name: /aplicar descuento/i }));
    const discountInput = screen.getByLabelText(/Monto del descuento/i);
    await user.type(discountInput, "100");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Cobrar \$400\.00/ })).toBeInTheDocument()
    );
  });

  it("requiere razón cuando hay descuento", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PaymentModal
        member={member}
        currentMembership={currentMembership}
        open
        onOpenChange={() => {}}
      />
    );
    await waitFor(() => screen.getByRole("button", { name: /Cobrar/ }));
    await user.click(screen.getByRole("button", { name: /aplicar descuento/i }));
    await user.type(screen.getByLabelText(/Monto del descuento/i), "100");
    await user.click(screen.getByRole("button", { name: /Cobrar/ }));

    expect(await screen.findByText(/escribe la razón/i)).toBeInTheDocument();
  });

  it("cobra exitosamente y muestra acciones post-cobro", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <PaymentModal
        member={member}
        currentMembership={currentMembership}
        open
        onOpenChange={onOpenChange}
      />
    );
    await waitFor(() => screen.getByRole("button", { name: /Cobrar \$500\.00/ }));
    await user.click(screen.getByRole("button", { name: /Cobrar \$500\.00/ }));

    expect(await screen.findByRole("button", { name: /imprimir comprobante/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar por whatsapp/i })).toBeInTheDocument();
  });
});
