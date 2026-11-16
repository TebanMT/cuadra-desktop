import { useState } from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { PaymentModal } from "../PaymentModal";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.endsWith("/charge-settings")) return {};
        if (path.includes("/cash-drawers")) return { items: [{ id: "main", name: "Caja principal", active: true, is_main: true }] };
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
          return { state: "online", last_synced_at: null, queue_pending_count: 0, last_error: null };
        }
        return null;
      }),
      // Espeja registerPaymentResp del backend — shape flat.
      post: vi.fn(async () => ({
        payment_id: "pay-1",
        folio: "MEM-000087",
        subtotal: 500,
        discount: 0,
        total: 500,
        paid: 500,
        balance_pending: 0,
        new_membership_id: "ms-2",
        new_expiry: "2026-05-25",
        enrollment_charged: false,
        maintenance_charged: false,
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
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ readOnly: false, user: { user_id: "u1", role: "owner" } as never });
  });

  it("oculta descuento y cobro a medias a un operador sin esos permisos", async () => {
    useAuthStore.setState({ user: { user_id: "u2", role: "operator", permissions: [] } as never });
    const user = userEvent.setup();
    renderWithProviders(
      <PaymentModal member={member} currentMembership={currentMembership} open onOpenChange={() => {}} />
    );
    await waitFor(() => screen.getByRole("button", { name: /Cobrar \$500\.00/ }));
    await user.click(screen.getByText("Promoción, descuento o pago parcial"));
    expect(screen.queryByRole("button", { name: /aplicar descuento/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Pago parcial \(diferido\)/ })).not.toBeInTheDocument();
    // Nombran el permiso exacto que hay que pedir, no un «pídeselo» genérico.
    expect(screen.getByText(/No puedes aplicar descuentos\./)).toBeInTheDocument();
    expect(screen.getByText(/No puedes cobrar a medias\./)).toBeInTheDocument();
    expect(screen.getAllByText("«Descuentos y montos»").length).toBeGreaterThan(0);
    expect(screen.getByText("«Fiar»")).toBeInTheDocument();
  });

  it("muestra el descuento a un operador con el permiso", async () => {
    useAuthStore.setState({ user: { user_id: "u2", role: "operator", permissions: ["discounts"] } as never });
    const user = userEvent.setup();
    renderWithProviders(
      <PaymentModal member={member} currentMembership={currentMembership} open onOpenChange={() => {}} />
    );
    await waitFor(() => screen.getByRole("button", { name: /Cobrar \$500\.00/ }));
    await user.click(screen.getByText("Promoción, descuento o pago parcial"));
    expect(screen.getByRole("button", { name: /aplicar descuento/i })).toBeInTheDocument();
    expect(screen.queryByText(/No puedes aplicar descuentos/)).not.toBeInTheDocument();
    expect(screen.getByText(/No puedes cobrar a medias\./)).toBeInTheDocument();
  });

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
    expect(screen.getByRole("radiogroup", { name: "Método de pago" })).toBeInTheDocument();
  });

  it("deja el importe en un solo lugar protagonista además del botón", async () => {
    renderWithProviders(
      <PaymentModal member={member} currentMembership={currentMembership} open onOpenChange={() => {}} />
    );
    await waitFor(() => screen.getByRole("button", { name: /Cobrar \$500\.00/ }));
    // Pie fijo: total con método. Sin desglose cuando sólo hay plan.
    expect(screen.getAllByText("$500.00")).toHaveLength(1);
    expect(screen.getByText("Total · Efectivo")).toBeInTheDocument();
    expect(screen.queryByText("Desglose")).not.toBeInTheDocument();
    // El selector muestra el plan sin repetir su precio.
    expect(screen.getByRole("combobox", { name: "Membresía" })).toHaveTextContent(/^Mensual$/);
  });

  it("muestra la vigencia actual con la insignia compartida", async () => {
    renderWithProviders(
      <PaymentModal member={member} currentMembership={currentMembership} accessStatus="denied_expired" open onOpenChange={() => {}} />
    );
    await waitFor(() => screen.getByRole("button", { name: /Cobrar \$500\.00/ }));
    expect(screen.getByText("Vigencia actual")).toBeInTheDocument();
    expect(screen.getByText("Vencido")).toBeInTheDocument();
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

    await user.click(screen.getByText("Promoción, descuento o pago parcial"));
    await user.click(screen.getByRole("button", { name: /aplicar descuento/i }));
    const discountInput = screen.getByLabelText(/Monto del descuento/i);
    await user.type(discountInput, "100");

    await waitFor(() =>
      expect(screen.getByRole("button", { name: /Cobrar \$400\.00/ })).toBeInTheDocument()
    );
    // El desglose aparece en cuanto el total tiene más de una pieza.
    expect(screen.getByText("Desglose")).toBeInTheDocument();
    expect(screen.getByText("−$100.00")).toBeInTheDocument();
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
    await user.click(screen.getByText("Promoción, descuento o pago parcial"));
    await user.click(screen.getByRole("button", { name: /aplicar descuento/i }));
    await user.type(screen.getByLabelText(/Monto del descuento/i), "100");
    await user.click(screen.getByRole("button", { name: /Cobrar/ }));

    expect(await screen.findByText(/escribe la razón/i)).toBeInTheDocument();
  });

  it("cierra tras confirmar y entrega el comprobante a la ficha", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    const onPaid = vi.fn();
    renderWithProviders(
      <PaymentModal
        member={member}
        currentMembership={currentMembership}
        open
        onPaid={onPaid}
        onOpenChange={onOpenChange}
      />
    );
    await waitFor(() => screen.getByRole("button", { name: /Cobrar \$500\.00/ }));
    await waitFor(() => expect(screen.getByRole("button", { name: /Cobrar \$500\.00/ })).toBeEnabled());
    await user.click(screen.getByRole("button", { name: /Cobrar \$500\.00/ }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
    expect(onPaid).toHaveBeenCalledWith(expect.objectContaining({ payment_id: "pay-1", folio: "MEM-000087" }));
  });

  it("reutiliza la llave del mismo cobro si la respuesta se pierde", async () => {
    const user = userEvent.setup();
    const post = vi.mocked(api.post);
    post
      .mockRejectedValueOnce(new Error("respuesta perdida"))
      .mockResolvedValueOnce({
        payment_id: "pay-1",
        folio: "MEM-000087",
        subtotal: 500,
        discount: 0,
        total: 500,
        paid: 500,
        balance_pending: 0,
        new_membership_id: "ms-2",
        new_expiry: "2026-05-25",
        enrollment_charged: false,
        maintenance_charged: false,
      });

    renderWithProviders(
      <PaymentModal
        member={member}
        currentMembership={currentMembership}
        open
        onOpenChange={() => {}}
      />
    );
    const submit = await screen.findByRole("button", { name: /Cobrar \$500\.00/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.click(submit);
    await screen.findByText(/No pudimos cobrar/i);
    await user.click(submit);

    await waitFor(() => expect(post).toHaveBeenCalledTimes(2));
    const first = post.mock.calls[0][1] as { idempotency_key: string };
    const second = post.mock.calls[1][1] as { idempotency_key: string };
    expect(first.idempotency_key).toBeTruthy();
    expect(second.idempotency_key).toBe(first.idempotency_key);
  });
});

describe("confirmed payment lifecycle", () => {
  it.each([null, currentMembership])("cierra incluso cuando la ficha se actualiza tras la activación: %j", async initial => {
    vi.clearAllMocks();
    const paid = vi.fn();
    function Parent() {
      const [open, setOpen] = useState(true);
      const [membership, setMembership] = useState(initial);
      return <PaymentModal member={member} currentMembership={membership} open={open} onOpenChange={setOpen} onPaid={receipt => {
        paid(receipt);
        setMembership({ ...currentMembership, membership_type_id: "type-2" });
      }} />;
    }
    const user = userEvent.setup();
    renderWithProviders(<Parent />);
    if (!initial) { await user.click(await screen.findByRole("combobox", { name: "Membresía" })); await user.click(await screen.findByRole("option", { name: /Mensual/ })); }
    const submit = await screen.findByRole("button", { name: /Cobrar \$/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.dblClick(submit);
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(api.post).toHaveBeenCalledTimes(1);
    expect(paid).toHaveBeenCalledTimes(1);
  });

  it("no se descarta ni repite un cobro mientras espera confirmación", async () => {
    vi.clearAllMocks();
    let resolve!: (receipt: unknown) => void;
    vi.mocked(api.post).mockImplementationOnce(() => new Promise(done => { resolve = done; }) as never);
    const close = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<PaymentModal member={member} currentMembership={currentMembership} open onOpenChange={close} />);
    const submit = await screen.findByRole("button", { name: /Cobrar \$500/ });
    await waitFor(() => expect(submit).toBeEnabled());
    await user.dblClick(submit);
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Cerrar" })).toBeDisabled();
    expect(screen.getByRole("dialog")).toHaveAttribute("aria-busy", "true");
    expect(close).not.toHaveBeenCalled();
    expect(api.post).toHaveBeenCalledTimes(1);
    await act(async () => resolve({ payment_id: "p1", folio: "F1", paid: 500, total: 500, balance_pending: 0, new_expiry: "2026-12-11" }));
    await waitFor(() => expect(close).toHaveBeenCalledWith(false));
  });
});
