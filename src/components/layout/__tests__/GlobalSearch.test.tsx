import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { GlobalSearch } from "../GlobalSearch";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";

const { members, products } = vi.hoisted(() => ({
  members: { data: [{ member_id: "demo", full_name: "Ana Ejemplo", phone: "5500000000" }] as unknown[], isFetching: false, isError: false, refetch: vi.fn() },
  products: { data: [] as unknown[] },
}));
vi.mock("@/hooks/useSales", () => ({ useMemberSearch: () => members }));
vi.mock("@/hooks/useProducts", () => ({ useActiveProducts: () => products }));
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: (value: string) => value }));
function Destination() { const path = useLocation(); return <output data-testid="destination">{path.pathname}{path.search}</output>; }

beforeEach(() => { members.isError = false; members.data = [{ member_id: "demo", full_name: "Ana Ejemplo", phone: "5500000000" }]; products.data = []; vi.clearAllMocks(); });

describe("Búsqueda global de recepción", () => {
  it("abre una ficha al activar el resultado con teclado", async () => {
    const user = userEvent.setup(); const selected = vi.fn();
    renderWithProviders(<MemoryRouter><GlobalSearch onSelect={selected} /><Destination /></MemoryRouter>);
    await user.type(screen.getByRole("combobox"), "Ana");
    await user.tab(); await user.keyboard("{Enter}");
    expect(screen.getByTestId("destination")).toHaveTextContent("/members/demo");
    expect(selected).toHaveBeenCalledOnce();
  });

  it("distingue homónimos con número de socio y contesta «¿está vigente?»", async () => {
    members.data = [
      { member_id: "a", full_name: "Ana Ejemplo", phone: "5500000001", member_number: 1201, access_status: "allowed_active", current_membership: { expiry_date: "2099-12-03" } },
      { member_id: "b", full_name: "Ana Ejemplo", phone: "5500000002", member_number: 1202, access_status: "denied_expired", current_membership: { expiry_date: "2026-10-01" } },
    ];
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><GlobalSearch /></MemoryRouter>);
    await user.type(screen.getByRole("combobox"), "Ana");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Nº 1201");
    expect(options[0]).toHaveTextContent("Vigente");
    expect(options[1]).toHaveTextContent("Nº 1202");
    expect(options[1]).toHaveTextContent("Vencido");
    expect(screen.getByRole("group", { name: "Socios" })).toBeInTheDocument();
  });

  it("marca la opción activa con superficie y anillo, y la flecha reabre tras Escape", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><GlobalSearch /></MemoryRouter>);
    const input = screen.getByRole("combobox");
    await user.type(input, "Ana");
    expect(screen.getByRole("option")).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("option")).toHaveClass("bg-accent", "ring-1", "ring-ring");
    await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    expect(input).toHaveFocus();
    await user.keyboard("{ArrowDown}");
    expect(screen.getByRole("listbox")).toBeInTheDocument();
    expect(input).toHaveAttribute("aria-expanded", "true");
  });

  it("un producto elegido abre el catálogo ya filtrado", async () => {
    members.data = [];
    products.data = [{ id: "p1", name: "Agua 1 L", price: 20, stock: 0 }];
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><GlobalSearch /><Destination /></MemoryRouter>);
    await user.type(screen.getByRole("combobox"), "agua");
    expect(screen.getByRole("option")).toHaveTextContent("Sin existencias");
    expect(screen.getByRole("option")).toHaveTextContent("$20.00");
    await user.keyboard("{Enter}");
    expect(screen.getByTestId("destination")).toHaveTextContent("/products?q=Agua%201%20L");
  });

  it("recupera una búsqueda fallida sin presentarla como vacía", async () => {
    members.isError = true; members.data = [];
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><GlobalSearch /></MemoryRouter>);
    await user.type(screen.getByRole("combobox"), "Ana");
    expect(screen.queryByText(/Sin resultados/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar búsqueda" }));
    expect(members.refetch).toHaveBeenCalledOnce();
  });

  it.each(["A", "Nadie"])("cierra el diálogo al navegar a una búsqueda filtrada: %s", async (term) => {
    members.data = [];
    const user = userEvent.setup(); const selected = vi.fn();
    renderWithProviders(<MemoryRouter><GlobalSearch onSelect={selected} /><Destination /></MemoryRouter>);
    await user.type(screen.getByRole("combobox"), term); await user.keyboard("{Enter}");
    expect(screen.getByTestId("destination")).toHaveTextContent("/members");
    expect(selected).toHaveBeenCalledOnce();
  });

  it("Escape descarta sugerencias antes de cerrar la búsqueda en diálogo", async () => {
    const user = userEvent.setup(); const close = vi.fn();
    renderWithProviders(<MemoryRouter><Dialog open onOpenChange={close}><DialogContent><DialogTitle>Buscar en Tinta</DialogTitle><GlobalSearch inFlow /></DialogContent></Dialog></MemoryRouter>);
    await user.type(screen.getByRole("combobox"), "Ana");
    await user.keyboard("{Escape}");
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.keyboard("{Escape}");
    expect(close).toHaveBeenCalledWith(false);
  });
});
