import { describe, it, expect, vi, beforeEach } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { makeClient, renderWithProviders } from "@/test/utils";
import { PaymentModal } from "../PaymentModal";
import { MemberForm } from "@/components/members/MemberForm";
import { api } from "@/lib/api";
import { GYM_CHARGE_SETTINGS_KEY } from "@/hooks/useGymChargeSettings";
import { useAuthStore } from "@/stores/useAuthStore";
const scenario = vi.hoisted(() => ({ state: "error" as "pending" | "error" | "ready" | "empty" }));
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: {
    get: vi.fn(async (path: string) => {
      if (path.endsWith("charge-settings")) {
        if (scenario.state === "pending") return new Promise(() => {});
        if (scenario.state === "error") throw new Error("Fallo ficticio en cuotas");
        return scenario.state === "empty" ? {} : { charges_enrollment: true, enrollment_amount: 150 };
      }
      if (path.includes("cash-drawers")) return { items: [{ id: "main", name: "Caja principal", active: true, is_main: true }] };
      if (path.includes("membership-types")) return [{ id: "type-1", name: "Mensual", price: 500, duration_days: 30, enrollment_fee: 0, maintenance_fee: 0, active: true }];
      if (path.includes("sync/status")) return { state: "offline_no_internet", queue_pending_count: 0 };
      if (/\/members(\?|$)/.test(path)) return { items: [], total: 0 };
      return null;
    }),
    post: vi.fn(async () => ({ payment_id: "fake-pay", folio: "FAKE-1", paid: 650, total: 650, new_expiry: "2026-12-11" })),
    patch: vi.fn(),
  }
}));
const payment = <PaymentModal open onOpenChange={() => {}} member={{ id: "fake-m1", full_name: "Ana Ejemplo", phone: null, enrollment_paid: false }} currentMembership={{ id: "ms1", membership_type_id: "type-1", type_name: "Mensual", price: 500, start_date: "2026-11-01", expiry_date: "2026-11-30", status: "active", duration_days_snapshot: 30 }} />;
beforeEach(() => { vi.clearAllMocks(); scenario.state = "error"; useAuthStore.setState({ readOnly: false }); });
describe("Cuotas confirmadas antes de cobrar", () => {
  it.each(["error", "pending"] as const)("bloquea cobro y envío por formulario con cuotas %s", async state => {
    scenario.state = state;
    renderWithProviders(payment);
    const charge = screen.getByRole("button", { name: "Cobrar" });
    expect(charge).toBeDisabled();
    fireEvent.submit(charge.closest("form")!);
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText("Total por confirmar")).toBeInTheDocument();
    if (state === "error") expect(await screen.findByRole("button", { name: "Reintentar cuotas" })).toBeEnabled();
  });
  it("reintenta, incorpora inscripción y permite cobrar desde datos locales", async () => {
    renderWithProviders(payment);
    const retry = await screen.findByRole("button", { name: "Reintentar cuotas" });
    scenario.state = "ready";
    await userEvent.click(retry);
    const charge = await screen.findByRole("button", { name: /Cobrar \$650/ });
    await waitFor(() => expect(charge).toBeEnabled());
    await userEvent.click(charge);
    await waitFor(() => expect(api.post).toHaveBeenCalled());
    expect(vi.mocked(api.post).mock.calls[0][1]).toMatchObject({ amount: 650, charge_enrollment: true });
  });
  it("acepta configuración vacía confirmada: no inventa cuotas", async () => {
    scenario.state = "empty";
    renderWithProviders(payment);
    const charge = await screen.findByRole("button", { name: /Cobrar \$500/ });
    await waitFor(() => expect(charge).toBeEnabled());
  });
  it("conserva las cuotas conocidas cuando falla su actualización", async () => {
    const client = makeClient();
    client.setQueryData(GYM_CHARGE_SETTINGS_KEY, { charges_enrollment: true, enrollment_amount: 150 });
    renderWithProviders(payment, { client });
    await client.refetchQueries({ queryKey: GYM_CHARGE_SETTINGS_KEY });
    await waitFor(() => expect(screen.getByRole("button", { name: /Cobrar \$650/ })).toBeEnabled());
  });
  it.each(["error", "pending"] as const)("inscripción bloquea cobro con cuotas %s, pero permite alta sin cobro", async state => {
    scenario.state = state;
    const submit = vi.fn();
    renderWithProviders(<MemoryRouter><MemberForm mode="create" submitting={false} onSubmit={submit} onCancel={() => {}} /></MemoryRouter>);
    const charge = screen.getByRole("button", { name: "Inscribir y cobrar" });
    expect(charge).toBeDisabled();
    fireEvent.submit(charge.closest("form")!);
    expect(submit).not.toHaveBeenCalled();
    await userEvent.type(screen.getByLabelText(/nombre completo/i), "Ana Ejemplo");
    await userEvent.click(screen.getByLabelText(/sin teléfono/i));
    await userEvent.click(screen.getByRole("checkbox", { name: /cobrar/i }));
    const noCharge = screen.getByRole("button", { name: "Inscribir sin cobro" });
    expect(noCharge).toBeEnabled();
    await userEvent.click(noCharge);
    expect(submit).toHaveBeenCalledTimes(1);
    expect(submit.mock.calls[0][0].values.charge_first_payment).toBe(false);
  });
});
