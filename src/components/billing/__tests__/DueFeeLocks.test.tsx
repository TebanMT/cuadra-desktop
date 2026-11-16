import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { PaymentModal } from "../PaymentModal";
import { MemberForm } from "@/components/members/MemberForm";
import { useAuthStore } from "@/stores/useAuthStore";

const fees = vi.hoisted(() => ({ frequency: "monthly" as string | undefined }));
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: {
    get: vi.fn(async (path: string) => {
      if (path.endsWith("charge-settings")) {
        return { charges_enrollment: true, enrollment_amount: 150, charges_maintenance: true, maintenance_amount: 80, maintenance_frequency: fees.frequency };
      }
      if (path.includes("cash-drawers")) return { items: [{ id: "main", name: "Caja principal", active: true, is_main: true }] };
      if (path.includes("membership-types")) return [{ id: "type-1", name: "Mensual", price: 500, duration_days: 30, enrollment_fee: 0, maintenance_fee: 0, active: true }];
      if (path.includes("sync/status")) return { state: "offline_no_internet", queue_pending_count: 0 };
      if (/\/members(\?|$)/.test(path)) return { items: [], total: 0 };
      return null;
    }),
    post: vi.fn(),
    patch: vi.fn(),
  },
}));

const membership = { id: "ms1", membership_type_id: "type-1", type_name: "Mensual", price: 500, start_date: "2026-11-01", expiry_date: "2026-11-30", status: "active" as const, duration_days_snapshot: 30 };
const checkbox = (name: RegExp) => screen.getByRole("checkbox", { name });

function signIn(role: "owner" | "operator") {
  useAuthStore.setState({ readOnly: false, user: { user_id: "u1", role, permissions: [] } as never });
}

beforeEach(() => {
  vi.clearAllMocks();
  fees.frequency = "monthly";
});

describe("Cuotas que tocan, sin permiso de descuentos", () => {
  it("cobro: deja fijas la inscripción y el mantenimiento que tocan", async () => {
    signIn("operator");
    renderWithProviders(
      <PaymentModal open onOpenChange={() => {}} member={{ id: "m1", full_name: "Ana Ejemplo", phone: null, enrollment_paid: false }} currentMembership={membership} />
    );
    await waitFor(() => expect(checkbox(/Inscripción/)).toBeChecked());
    expect(checkbox(/Inscripción/)).toBeDisabled();
    expect(checkbox(/Mantenimiento/)).toBeChecked();
    expect(checkbox(/Mantenimiento/)).toBeDisabled();
    // La razón nombra el permiso que hay que pedir para quitar esas cuotas.
    expect(screen.getByText(/No puedes quitar la inscripción ni el mantenimiento\./)).toBeInTheDocument();
    expect(screen.getAllByText("«Descuentos y montos»").length).toBeGreaterThan(0);
    expect(screen.getByRole("button", { name: /Cobrar \$730\.00/ })).toBeInTheDocument();
  });

  it("cobro: una inscripción ya pagada queda libre para forzarla", async () => {
    signIn("operator");
    renderWithProviders(
      <PaymentModal open onOpenChange={() => {}} member={{ id: "m1", full_name: "Ana Ejemplo", phone: null, enrollment_paid: true }} currentMembership={membership} />
    );
    await waitFor(() => expect(checkbox(/Inscripción/)).toBeEnabled());
    expect(checkbox(/Inscripción/)).not.toBeChecked();
    await userEvent.click(checkbox(/Inscripción/));
    expect(checkbox(/Inscripción/)).toBeChecked();
  });

  it("cobro: el dueño puede quitar una cuota que toca", async () => {
    signIn("owner");
    renderWithProviders(
      <PaymentModal open onOpenChange={() => {}} member={{ id: "m1", full_name: "Ana Ejemplo", phone: null, enrollment_paid: false }} currentMembership={membership} />
    );
    await waitFor(() => expect(checkbox(/Inscripción/)).toBeEnabled());
    await userEvent.click(checkbox(/Inscripción/));
    expect(checkbox(/Inscripción/)).not.toBeChecked();
  });

  it("alta: inscripción fija, mantenimiento libre sin frecuencia y sin fecha atrasada", async () => {
    signIn("operator");
    fees.frequency = undefined;
    const submit = vi.fn();
    renderWithProviders(
      <MemoryRouter>
        <MemberForm mode="create" initial={{ start_date: "2020-01-15" }} submitting={false} onSubmit={submit} onCancel={() => {}} />
      </MemoryRouter>
    );
    await waitFor(() => expect(checkbox(/Inscripción/)).toBeDisabled());
    expect(checkbox(/Inscripción/)).toBeChecked();
    expect(checkbox(/Mantenimiento/)).toBeEnabled();
    expect(screen.getByText(/Con cobro inicial, el inicio es hoy o después/)).toBeInTheDocument();

    await userEvent.type(screen.getByLabelText(/nombre completo/i), "Ana Ejemplo");
    await userEvent.click(screen.getByLabelText(/sin teléfono/i));
    await userEvent.click(screen.getByRole("button", { name: /Inscribir y cobrar/ }));
    expect(submit).not.toHaveBeenCalled();
    expect(screen.getAllByText(/o una fecha posterior/).length).toBeGreaterThan(0);
  });

  it("alta: con frecuencia el mantenimiento también queda fijo y se manda cobrado", async () => {
    signIn("operator");
    const submit = vi.fn();
    renderWithProviders(
      <MemoryRouter>
        <MemberForm mode="create" initial={{ charge_enrollment: false, charge_maintenance: false }} submitting={false} onSubmit={submit} onCancel={() => {}} />
      </MemoryRouter>
    );
    await waitFor(() => expect(checkbox(/Mantenimiento/)).toBeDisabled());
    expect(checkbox(/Mantenimiento/)).toBeChecked();
    expect(checkbox(/Inscripción/)).toBeChecked();

    await userEvent.type(screen.getByLabelText(/nombre completo/i), "Ana Ejemplo");
    await userEvent.click(screen.getByLabelText(/sin teléfono/i));
    await userEvent.click(screen.getByRole("button", { name: /Inscribir y cobrar/ }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0].values).toMatchObject({ charge_enrollment: true, charge_maintenance: true });
  });

  it("alta: el dueño conserva la fecha atrasada", async () => {
    signIn("owner");
    const submit = vi.fn();
    renderWithProviders(
      <MemoryRouter>
        <MemberForm mode="create" initial={{ start_date: "2020-01-15" }} submitting={false} onSubmit={submit} onCancel={() => {}} />
      </MemoryRouter>
    );
    await waitFor(() => expect(checkbox(/Inscripción/)).toBeEnabled());
    expect(screen.queryByText(/Con cobro inicial, el inicio es hoy o después/)).not.toBeInTheDocument();
    await userEvent.type(screen.getByLabelText(/nombre completo/i), "Ana Ejemplo");
    await userEvent.click(screen.getByLabelText(/sin teléfono/i));
    await userEvent.click(screen.getByRole("button", { name: /Inscribir y cobrar/ }));
    await waitFor(() => expect(submit).toHaveBeenCalledTimes(1));
    expect(submit.mock.calls[0][0].values.start_date).toBe("2020-01-15");
  });
});
