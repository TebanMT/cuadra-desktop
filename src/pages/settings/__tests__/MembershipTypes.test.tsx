import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import MembershipTypesPage from "../MembershipTypes";

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
  beforeEach(() => mockGet.mockClear());

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
});
