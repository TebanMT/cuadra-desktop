import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MembershipTypeForm } from "../MembershipTypeForm";
import type { MembershipType } from "@/hooks/useMembershipTypes";

// Estos tests anclan el CONTRATO del payload de duración: la unidad
// (calendario vs días) viaja explícita en duration_months y nunca se
// infiere del número de días. Regresión del bug de prod jul-2026:
// una "mensual" creada sin duration_months vencía a +30 días en lugar
// de +1 mes de calendario.

function renderForm(
  props: Partial<React.ComponentProps<typeof MembershipTypeForm>> = {},
) {
  const onSubmit = vi.fn();
  render(
    <MembershipTypeForm
      submitting={false}
      chargeEnrollment={false}
      chargeMaintenance={false}
      maintenanceFrequency="monthly"
      defaultEnrollmentAmount={0}
      defaultMaintenanceAmount={0}
      onSubmit={onSubmit}
      onCancel={() => {}}
      {...props}
    />,
  );
  return { onSubmit };
}

async function fillBasics(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText(/nombre/i), "Plan de prueba");
  await user.type(screen.getByLabelText(/precio/i), "500");
}

describe("MembershipTypeForm — unidad de duración explícita", () => {
  it("el preset default (1 mes) manda duration_months: 1", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await fillBasics(user);

    await user.click(screen.getByRole("button", { name: /crear membresía/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ duration_days: 30, duration_months: 1 }),
    );
  });

  it("personalizada en días manda duration_months: null (días literales)", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await fillBasics(user);

    await user.click(screen.getByLabelText(/duración/i));
    await user.click(await screen.findByRole("option", { name: /personalizada/i }));
    await user.type(screen.getByLabelText(/cantidad/i), "45");

    await user.click(screen.getByRole("button", { name: /crear membresía/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ duration_days: 45, duration_months: null }),
    );
  });

  it("personalizada en meses manda duration_months (calendario)", async () => {
    const user = userEvent.setup();
    const { onSubmit } = renderForm();
    await fillBasics(user);

    await user.click(screen.getByLabelText(/duración/i));
    await user.click(await screen.findByRole("option", { name: /personalizada/i }));
    await user.type(screen.getByLabelText(/cantidad/i), "5");
    await user.click(screen.getByLabelText(/unidad/i));
    await user.click(await screen.findByRole("option", { name: /^meses$/i }));

    await user.click(screen.getByRole("button", { name: /crear membresía/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ duration_days: 150, duration_months: 5 }),
    );
  });

  it("editar un plan legacy de 30 días SIN meses abre en personalizada y NO lo adivina mensual", async () => {
    const user = userEvent.setup();
    const legacy: MembershipType = {
      id: "p1",
      name: "Mensual viejo",
      price: 500,
      duration_days: 30,
      duration_months: null,
      enrollment_fee: 0,
      maintenance_fee: 0,
      active: true,
    };
    const { onSubmit } = renderForm({ initial: legacy });

    // Se muestra el valor real (30) en modo personalizado — la unidad
    // la re-declara el dueño, no la adivinamos del número.
    expect(screen.getByLabelText(/cantidad/i)).toHaveValue("30");

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ duration_days: 30, duration_months: null }),
    );
  });

  it("editar un plan mensual (duration_months: 1) abre en el preset '1 mes'", async () => {
    const user = userEvent.setup();
    const mensual: MembershipType = {
      id: "p2",
      name: "Mensual",
      price: 500,
      duration_days: 30,
      duration_months: 1,
      enrollment_fee: 0,
      maintenance_fee: 0,
      active: true,
    };
    const { onSubmit } = renderForm({ initial: mensual });

    expect(screen.getByLabelText(/duración/i)).toHaveTextContent(/1 mes/i);

    await user.click(screen.getByRole("button", { name: /guardar cambios/i }));

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({ duration_days: 30, duration_months: 1 }),
    );
  });
});
