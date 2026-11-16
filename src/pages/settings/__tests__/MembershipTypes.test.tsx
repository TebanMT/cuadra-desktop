import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import MembershipTypesPage from "../MembershipTypes";
import { useAuthStore } from "@/stores/useAuthStore";

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(async () => [
    {
      id: "p1",
      name: "Mensual",
      price: 500,
      duration_days: 30,
      enrollment_fee: 0,
      maintenance_fee: 0,
      active: true,
    },
    {
      id: "p2",
      name: "Visita",
      price: 80,
      duration_days: 1,
      enrollment_fee: 0,
      maintenance_fee: 0,
      active: false,
    },
  ]),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { get: mockGet, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

describe("MembershipTypesPage", () => {
  beforeEach(() => {
    mockGet.mockClear();
    useAuthStore.setState({ readOnly: false, user: { user_id: "u1", role: "owner" } as never });
  });

  it("lists active and inactive types and opens deactivate confirm", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <MemoryRouter>
        <MembershipTypesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Mensual")).toBeInTheDocument();
    expect(screen.getByText("Visita")).toBeInTheDocument();
    expect(screen.getByText("Activa")).toBeInTheDocument();
    expect(screen.getByText("Desactivada")).toBeInTheDocument();

    const deactivateBtn = screen.getAllByRole("button", { name: /desactivar/i })[0];
    await user.click(deactivateBtn);

    await waitFor(() => {
      expect(screen.getByText(/¿Desactivar "Mensual"\?/i)).toBeInTheDocument();
    });
  });

  it("a un operador le muestra los planes sin acciones de gestión", async () => {
    useAuthStore.setState({ user: { user_id: "u2", role: "operator", permissions: [] } as never });
    renderWithProviders(
      <MemoryRouter>
        <MembershipTypesPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Mensual")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /desactivar/i })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /editar/i })).not.toBeInTheDocument();
    expect(screen.getByText("Solo el dueño puede cambiar los planes y las cuotas.")).toBeInTheDocument();
    expect(screen.getByText("Consulta los planes y las promociones que puedes aplicar al cobrar.")).toBeInTheDocument();
  });
});
