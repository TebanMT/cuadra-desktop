import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import ProductsPage from "../ProductsPage";
const state = vi.hoisted(() => ({ fail: true, get: vi.fn(), items: [] as unknown[], totals: undefined as unknown }));
vi.mock("@/lib/api", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  api: { get: (path: string, options?: unknown) => { state.get(path, options); if (path === "/api/v1/products" && state.fail) return Promise.reject(new Error("offline")); return Promise.resolve({ items: state.items, total: state.items.length, totals: state.totals }); } },
}));
vi.mock("@/components/products/StockCount", () => ({ StockCountButton: () => null }));
vi.mock("@/components/products/AdjustStockModal", () => ({ AdjustStockModal: () => null }));
vi.mock("@/components/products/PurchaseDeliveries", () => ({ PurchaseDeliveries: ({ showEmpty }: { showEmpty?: boolean }) => <p>Compras disponibles{showEmpty ? " · con vacío" : ""}</p> }));
vi.mock("@/pages/expenses/ExpensesPage", () => ({ ExpensesWorkspace: () => null }));
beforeEach(() => { state.fail = true; state.items = []; state.totals = undefined; state.get.mockClear(); useAuthStore.setState({ readOnly: false, user: null, gym: null }); });
const product = { id: "p1", gym_id: "g1", name: "Agua natural", category: "Bebidas", price: 20, stock: 12, stock_minimum: 3, active: true, created_at: "2026-01-01" };
function signIn(role: "owner" | "operator", permissions?: string[]) {
  useAuthStore.setState({ readOnly: false, user: { user_id: "u1", role, permissions } as never });
}
const productQueries = () => state.get.mock.calls.filter(([path]) => path === "/api/v1/products").map(([, options]) => (options as { query: Record<string, unknown> }).query);
describe("Products query states", () => {
  it("does not announce empty or healthy inventory on failure and can retry", async () => {
    renderWithProviders(<MemoryRouter><ProductsPage /></MemoryRouter>);
    const retry = await screen.findByRole("button", { name: "Reintentar" });
    expect(screen.queryByText(/Aún no hay productos/)).not.toBeInTheDocument();
    expect(screen.queryByText(/todo en orden/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Existencias del catálogo")).not.toBeInTheDocument();
    state.fail = false;
    fireEvent.click(retry);
    expect(await screen.findByText(/Aún no hay productos/)).toBeInTheDocument();
    await waitFor(() => expect(screen.queryByRole("button", { name: "Reintentar" })).not.toBeInTheDocument());
  });
  it("names both filters and exposes the selected view", () => {
    renderWithProviders(<MemoryRouter><ProductsPage /></MemoryRouter>);
    expect(screen.getByRole("combobox", { name: "Categoría" })).toBeInTheDocument();
    expect(screen.getByRole("combobox", { name: "Estado del producto" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Catálogo" })).toHaveAttribute("aria-pressed", "true");
    fireEvent.click(screen.getByRole("button", { name: "Compras" }));
    expect(screen.getByRole("button", { name: "Compras" })).toHaveAttribute("aria-pressed", "true");
  });
});

describe("Catálogo de productos", () => {
  it("usa ?q= como búsqueda al llegar desde Buscar", async () => {
    state.fail = false; state.items = [product];
    renderWithProviders(<MemoryRouter initialEntries={["/products?q=Agua"]}><ProductsPage /></MemoryRouter>);
    expect(await screen.findByLabelText("Buscar producto…")).toHaveValue("Agua");
    await waitFor(() => expect(productQueries().some(query => query.q === "Agua")).toBe(true));
  });

  it("no pinta iniciales y nombra cada acción con su producto", async () => {
    state.fail = false; state.items = [product];
    signIn("owner");
    renderWithProviders(<MemoryRouter><ProductsPage /></MemoryRouter>);
    const row = (await screen.findByRole("button", { name: "Editar Agua natural" })).closest("tr")!;
    expect(within(row).queryByText("AG")).not.toBeInTheDocument();
    expect(within(row).getByRole("button", { name: "Ajustar existencias de Agua natural" })).toHaveClass("h-11", "w-11");
    expect(within(row).getByText("Con existencias")).toBeInTheDocument();
    expect(within(row).queryByText("OK")).not.toBeInTheDocument();
    // One control per action: the stock number is not a second «Ajustar».
    expect(within(row).getAllByRole("button", { name: /Ajustar existencias/ })).toHaveLength(1);
  });

  it("dice existencias con los mismos nombres que Inicio", async () => {
    state.fail = false; state.items = [product];
    state.totals = { total_value: 0, low_count: 0, out_count: 4, potential_profit: 0, cost_value: 0, margin_pct: null, products_total: 4, products_with_cost: 0 };
    renderWithProviders(<MemoryRouter><ProductsPage /></MemoryRouter>);
    const summary = await screen.findByLabelText("Existencias del catálogo");
    expect(summary).toHaveTextContent("0 con pocas existencias");
    expect(summary).toHaveTextContent("4 agotados");
    expect(screen.getByText("Solo por surtir")).toBeInTheDocument();
  });

  it("nombra el permiso que falta para editar o ajustar", async () => {
    state.fail = false;
    signIn("operator", []);
    renderWithProviders(<MemoryRouter><ProductsPage /></MemoryRouter>);
    const notes = await screen.findAllByRole("note");
    expect(notes.map(note => note.textContent)).toEqual([
      "No puedes crear ni editar productos. Requiere el permiso «Productos y precios». Pídeselo al dueño.",
      "No puedes ajustar ni contar existencias. Requiere el permiso «Ajustar inventario». Pídeselo al dueño.",
    ]);
  });

  it("Compras no queda en blanco para el operador", () => {
    signIn("operator", []);
    renderWithProviders(<MemoryRouter initialEntries={["/products?view=purchases"]}><ProductsPage /></MemoryRouter>);
    expect(screen.getByText("Compras disponibles · con vacío")).toBeInTheDocument();
    expect(screen.getByText("El historial de compras y sus pagos los consulta el dueño.")).toBeInTheDocument();
  });
});
