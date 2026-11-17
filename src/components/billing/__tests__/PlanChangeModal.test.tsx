import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { addDays, format } from "date-fns";
import { renderWithProviders } from "@/test/utils";
import { PlanChangeModal } from "../PlanChangeModal";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

// Ciclo de 30 días con 15 restantes (hoy cuenta): delta Gym→Combo = $250,
// proporcional = round(250 × 15/30) = $125. Fechas relativas a hoy para no
// congelar relojes.
const startIso = format(addDays(new Date(), -15), "yyyy-MM-dd");
const expiryIso = format(addDays(new Date(), 15), "yyyy-MM-dd");

const membershipTypes = [
  {
    id: "type-gym",
    name: "Gym",
    price: 450,
    duration_days: 30,
    duration_months: 1,
    enrollment_fee: 0,
    maintenance_fee: 0,
    active: true,
  },
  {
    id: "type-combo",
    name: "Gym + Clases",
    price: 700,
    duration_days: 30,
    duration_months: 1,
    enrollment_fee: 0,
    maintenance_fee: 0,
    active: true,
  },
  // Más barato: nunca elegible (downgrade se hace al renovar, DA-48.1).
  {
    id: "type-clases",
    name: "Clases",
    price: 300,
    duration_days: 30,
    duration_months: 1,
    enrollment_fee: 0,
    maintenance_fee: 0,
    active: true,
  },
  // Inactivo: nunca elegible.
  {
    id: "type-old",
    name: "Premium viejo",
    price: 900,
    duration_days: 30,
    duration_months: 1,
    enrollment_fee: 0,
    maintenance_fee: 0,
    active: false,
  },
];

let typesMock = membershipTypes;

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/cash-drawers"))
          return { items: [{ id: "main", name: "Caja principal", active: true, is_main: true }] };
        if (path.includes("/membership-types")) return typesMock;
        if (path.includes("/sync/status")) {
          return { state: "online", last_synced_at: null, queue_pending_count: 0, last_error: null };
        }
        return null;
      }),
      // Espeja planChangeResp del backend — shape flat.
      post: vi.fn(async () => ({
        payment_id: "pay-1",
        folio: "MEM-000091",
        delta: 250,
        prorated_suggested: 125,
        subtotal: 125,
        discount: 0,
        total: 125,
        paid: 125,
        balance_pending: 0,
        new_membership_id: "ms-2",
        expiry: expiryIso,
        old_type_name: "Gym",
        new_type_name: "Gym + Clases",
        charge_option: "prorated",
        days_remaining: 15,
        cycle_days: 30,
      })),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      blob: vi.fn(),
    },
  };
});

const member = { id: "m1", full_name: "Juan Pérez" };

const currentMembership = {
  id: "ms-1",
  membership_type_id: "type-gym",
  type_name: "Gym",
  price: 450,
  start_date: startIso,
  expiry_date: expiryIso,
  status: "active" as const,
  duration_days_snapshot: 30,
};

describe("PlanChangeModal", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    typesMock = membershipTypes;
    useAuthStore.setState({ readOnly: false, user: { user_id: "u1", role: "owner" } as never });
  });

  it("preselecciona el único plan elegible y sugiere el prorrateo", async () => {
    renderWithProviders(
      <PlanChangeModal member={member} currentMembership={currentMembership} open onOpenChange={() => {}} />,
    );
    // Único elegible: Combo ($700 ≥ $450). Clases ($300) e inactivo quedan fuera.
    await waitFor(() =>
      expect(screen.getByRole("combobox", { name: "Plan nuevo" })).toHaveTextContent("Gym + Clases"),
    );
    // Proporcional por default: round(250 × 15/30) = $125.
    expect(screen.getByRole("radio", { name: /Proporcional/ })).toBeChecked();
    expect(screen.getByRole("button", { name: /Cobrar \$125\.00 y cambiar/ })).toBeInTheDocument();
    // La vigencia conservada se anuncia en el pie.
    expect(screen.getByText(/sigue venciendo/i)).toBeInTheDocument();
  });

  it("la diferencia completa actualiza el monto del botón", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <PlanChangeModal member={member} currentMembership={currentMembership} open onOpenChange={() => {}} />,
    );
    await waitFor(() => screen.getByRole("button", { name: /Cobrar \$125\.00 y cambiar/ }));
    await user.click(screen.getByRole("radio", { name: /Diferencia completa/ }));
    expect(screen.getByRole("button", { name: /Cobrar \$250\.00 y cambiar/ })).toBeInTheDocument();
  });

  it("envía el payload del plan-change con idempotencia", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <PlanChangeModal
        member={member}
        currentMembership={currentMembership}
        open
        onOpenChange={onOpenChange}
      />,
    );
    const submit = await waitFor(() => {
      const btn = screen.getByRole("button", { name: /Cobrar \$125\.00 y cambiar/ });
      expect(btn).toBeEnabled();
      return btn;
    });
    await user.click(submit);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [path, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(path).toBe("/api/v1/payments/plan-change");
    expect(body).toMatchObject({
      member_id: "m1",
      new_membership_type_id: "type-combo",
      amount: 125,
      payment_method: "cash",
    });
    expect(body.idempotency_key).toEqual(expect.any(String));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("cambio lateral: sin cobro, sin método y amount 0", async () => {
    typesMock = [
      membershipTypes[0],
      {
        ...membershipTypes[0],
        id: "type-gym-pm",
        name: "Gym Tardes",
      },
    ];
    const user = userEvent.setup();
    renderWithProviders(
      <PlanChangeModal member={member} currentMembership={currentMembership} open onOpenChange={() => {}} />,
    );
    const submit = await waitFor(() => {
      const btn = screen.getByRole("button", { name: "Cambiar sin cobro" });
      expect(btn).toBeEnabled();
      return btn;
    });
    expect(screen.getByText(/Cambio sin costo/)).toBeInTheDocument();
    // Sin cobro no hay método de pago ni caja que elegir.
    expect(screen.queryByRole("radiogroup", { name: "Método de pago" })).not.toBeInTheDocument();
    await user.click(submit);
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    const [, body] = vi.mocked(api.post).mock.calls[0] as [string, Record<string, unknown>];
    expect(body).toMatchObject({ new_membership_type_id: "type-gym-pm", amount: 0 });
    expect(body.payment_method).toBeUndefined();
  });

  it("sin planes elegibles explica que el downgrade se hace al renovar", async () => {
    typesMock = [membershipTypes[0], membershipTypes[2]]; // actual + uno más barato
    renderWithProviders(
      <PlanChangeModal member={member} currentMembership={currentMembership} open onOpenChange={() => {}} />,
    );
    await waitFor(() =>
      expect(screen.getByText(/Para cambiar a un plan más barato, elígelo al renovar/)).toBeInTheDocument(),
    );
    expect(screen.queryByRole("combobox", { name: "Plan nuevo" })).not.toBeInTheDocument();
  });
});
