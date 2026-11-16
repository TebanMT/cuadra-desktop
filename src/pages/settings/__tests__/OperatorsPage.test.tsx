import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import OperatorsPage from "../OperatorsPage";

const state = vi.hoisted(() => ({ fail: true, pending: false, items: [] as unknown[] }));
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: { get: vi.fn(async () => {
    if (state.pending) return new Promise(() => {});
    if (state.fail) throw new Error("Error ficticio");
    return { items: state.items };
  }) },
}));
beforeEach(() => { state.fail = true; state.pending = false; state.items = []; useAuthStore.setState({ readOnly: false, gym: null }); });
// Datos ficticios.
const person = (id: string, role: "owner" | "operator", active = true) => ({
  id, gym_id: "g1", email: "", full_name: `Persona ${id}`, phone: null, role, active,
  must_change_password: false, has_pin: true, last_login_at: null, permissions: [],
});
describe("Disponibilidad de operadores", () => {
  it("no inventa cupo mientras carga y anuncia el estado", () => {
    state.pending = true;
    renderWithProviders(<MemoryRouter><OperatorsPage /></MemoryRouter>);
    expect(screen.getByRole("status")).toHaveTextContent("Consultando operadores");
    expect(screen.queryByText(/Cupo de operadores/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar operador" })).toBeDisabled();
  });
  it("recupera el catálogo sin ofrecer creación con capacidad desconocida", async () => {
    renderWithProviders(<MemoryRouter><OperatorsPage /></MemoryRouter>);
    const retry = await screen.findByRole("button", { name: "Reintentar operadores" });
    expect(screen.queryByText(/Cupo de operadores/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar operador" })).toBeDisabled();
    state.fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Agregar operador" })).toBeEnabled();
  });
  it("cuenta el cupo como el servidor: sólo operadores activos, sin el dueño", async () => {
    state.fail = false;
    state.items = [person("a", "owner"), person("b", "operator"), person("c", "operator", false)];
    useAuthStore.setState({ gym: { subscription_plan: "plus_monthly" } as never });
    renderWithProviders(<MemoryRouter><OperatorsPage /></MemoryRouter>);
    expect(await screen.findByText(
      "Cupo de operadores: 1 de 10 activos. El dueño y el operador inactivo no ocupan lugar. Puedes agregar o activar 9 más.",
    )).toBeInTheDocument();
    expect(screen.getAllByRole("row")).toHaveLength(4);
  });
  it("con el cupo lleno no ofrece crear y lo explica", async () => {
    state.fail = false;
    state.items = [person("a", "owner"), person("b", "operator")];
    renderWithProviders(<MemoryRouter><OperatorsPage /></MemoryRouter>);
    expect(await screen.findByText("Cupo de operadores: 1 de 1 activos. El dueño no ocupa lugar.")).toBeInTheDocument();
    const add = screen.getByRole("button", { name: "Agregar operador" });
    expect(add).toBeDisabled();
    expect(add).toHaveAccessibleDescription(/Esta instalación tiene habilitado 1 operador activo\. Para dar acceso a otra persona/);
  });
});
