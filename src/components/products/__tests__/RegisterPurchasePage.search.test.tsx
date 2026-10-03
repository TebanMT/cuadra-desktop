import { StrictMode } from "react";
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import RegisterPurchasePage from "@/pages/products/RegisterPurchasePage";

vi.mock("@/stores/useAuthStore", () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ user: { role: "owner", user_id: "search-user" }, gym: { gym_id: "search-gym" } }) }));
vi.mock("@/components/cash/CashDrawerField", () => ({ CashDrawerField: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const catalog = [{ id: "water", name: "Agua mineral" }, { id: "bar", name: "Barra de avena" }];
const requests: URL[] = [];
const submissions: unknown[] = [];
function show() {
  return render(<StrictMode><QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={["/products/purchases/new"]}><Routes><Route path="/products/purchases/new" element={<RegisterPurchasePage />} /><Route path="*" element={<p>Compra terminada</p>} /></Routes></MemoryRouter></QueryClientProvider></StrictMode>);
}
describe("Buscador de la compra con API y espera reales", () => {
  beforeEach(() => {
    localStorage.clear(); sessionStorage.clear(); requests.length = 0; submissions.length = 0;
    vi.stubGlobal("fetch", vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
      if (url.pathname === "/api/v1/products") {
        requests.push(url);
        const q = (url.searchParams.get("q") || "").trim().toLowerCase();
        const items = catalog.filter(p => p.name.toLowerCase().includes(q));
        return new Response(JSON.stringify({ status_code: 200, data: { items, total: items.length, page: 1, page_size: 50 } }), { status: 200, headers: { "Content-Type": "application/json" } });
      }
      if (url.pathname === "/api/v1/inventory-purchase-registrations") {
        submissions.push(JSON.parse(init!.body as string));
        return new Response(JSON.stringify({ status_code: 201, data: { items: [] } }), { status: 201, headers: { "Content-Type": "application/json" } });
      }
      throw new Error(`Unexpected request: ${url.pathname}`);
    }));
  });
  afterEach(() => vi.unstubAllGlobals());

  it("busca por parte del nombre y registra el producto encontrado", async () => {
    const user = userEvent.setup(); show();
    await screen.findByRole("button", { name: "Barra de avena" });
    await user.type(screen.getByLabelText("Buscar producto"), "MINERAL");
    await waitFor(() => expect(requests.some(url => url.searchParams.get("q") === "MINERAL" && url.searchParams.get("status") === "active")).toBe(true));
    await waitFor(() => expect(screen.queryByRole("button", { name: "Barra de avena" })).not.toBeInTheDocument());
    await user.click(await screen.findByRole("button", { name: "Agua mineral" }));
    await user.type(screen.getByLabelText("Costo de Agua mineral"), "10");
    await user.click(screen.getByRole("button", { name: "Guardar compra" }));
    await screen.findByText("Compra terminada");
    expect(submissions).toEqual([expect.objectContaining({ items: [{ product_id: "water", quantity: 1, unit_cost: 10 }] })]);
  });

  it("permite buscar aunque haya un producto nuevo sin terminar y conserva su captura", async () => {
    const user = userEvent.setup(); const first = show();
    await user.click(screen.getByRole("button", { name: "Nuevo producto" }));
    await user.type(screen.getByLabelText("Nombre", { exact: true }), "Bebida nueva");
    await user.type(screen.getByLabelText("Precio de venta", { exact: true }), "35");
    first.unmount(); show();
    await user.type(screen.getByLabelText("Buscar producto"), "mineral");
    await user.click(await screen.findByRole("button", { name: "Agua mineral" }));
    expect(screen.getByLabelText("Cantidad de Agua mineral")).toHaveValue(1);
    expect(screen.getByLabelText("Nombre", { exact: true })).toHaveValue("Bebida nueva");
    expect(screen.getByLabelText("Precio de venta", { exact: true })).toHaveValue(35);
    expect(submissions).toEqual([]);
  });
  it("no agrega con Enter un resultado de la búsqueda anterior", async () => {
    const user = userEvent.setup(); show();
    const search = screen.getByLabelText("Buscar producto");
    await user.type(search, "mineral");
    await waitFor(() => expect(requests.some(url => url.searchParams.get("q") === "mineral")).toBe(true));
    await screen.findByRole("button", { name: "Agua mineral" });
    await user.clear(search);
    await user.type(search, "avena");
    await user.keyboard("{Enter}");
    expect(screen.queryByLabelText("Cantidad de Agua mineral")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Agua mineral" })).not.toBeInTheDocument();
    await screen.findByRole("button", { name: "Barra de avena" });
    await user.keyboard("{Enter}");
    expect(screen.getByLabelText("Cantidad de Barra de avena")).toHaveValue(1);
    expect(submissions).toEqual([]);
  });

  it("avisa cuando no hay coincidencias y permite dar de alta el producto", async () => {
    const user = userEvent.setup(); show();
    await user.type(screen.getByLabelText("Buscar producto"), "Bebida nueva");
    await screen.findByText("No encontramos otro producto con ese nombre.");
    await user.click(screen.getByRole("button", { name: "Crear “Bebida nueva”" }));
    expect(screen.getByLabelText("Nombre", { exact: true })).toHaveValue("Bebida nueva");
    expect(submissions).toEqual([]);
  });

});
