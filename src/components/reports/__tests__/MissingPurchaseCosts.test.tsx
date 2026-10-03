import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, fireEvent } from "@testing-library/react";
const userEvent = { setup: () => ({ click: fireEvent.click, type: (node: HTMLElement, value: string) => fireEvent.change(node, { target: { value } }) }) };
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { FinancialNotice } from "../FinancialNotice";
import { api } from "@/lib/api";
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), post: vi.fn() } }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
const row = { movement_id: "movement-1", product_name: "Agua 1.5 L", quantity: 16, version: 1, recorded_on: "2026-09-04" };
function show(count = 1, warnings = ["legacy_inventory_purchase"]) {
 const client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
 return render(<QueryClientProvider client={client}><MemoryRouter><FinancialNotice count={count} warnings={warnings} incomplete={count > 0} from="2026-09-01" to="2026-09-07" /></MemoryRouter></QueryClientProvider>);
}
beforeEach(() => { vi.clearAllMocks(); vi.mocked(api.get).mockResolvedValue({ items: [row], total: 1, page: 1, page_size: 50 }); });
describe("Compras sin costo", () => {
 it("muestra el problema y permite completar una compra sin registrar otra recepción", async () => {
  const user = userEvent.setup(); show();
  expect(screen.getByText("1 compra sin costo")).toBeInTheDocument();
  expect(screen.getByText("Su importe aún no se incluye en las salidas. El resultado es parcial.")).toBeInTheDocument();
  expect(api.get).not.toHaveBeenCalled();
  await user.click(screen.getByRole("button", { name: "Completar costos" }));
  await user.click(await screen.findByRole("button", { name: "Completar costo de Agua 1.5 L" }));
  expect(api.get).toHaveBeenCalledWith("/api/v1/inventory-purchase-missing-costs", { query: { from: "2026-09-01", to: "2026-09-07", page: 1 } });
  expect(screen.getByRole("button", { name: "Guardar costo" })).toBeDisabled();
  await user.type(screen.getByLabelText("Costo por unidad"), "12.35");
  await user.type(screen.getByLabelText("Nota (opcional)"), "Factura 204");
  expect(screen.getByText(/Total de la compra:.*197.60/)).toBeInTheDocument();
  vi.mocked(api.post).mockResolvedValue({ saved: true });
  vi.mocked(api.get).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });
  await user.click(screen.getByRole("button", { name: "Guardar costo" }));
  await screen.findByText("No quedan compras sin costo en este período.");
  expect(api.post).toHaveBeenCalledTimes(1);
  expect(api.post).toHaveBeenCalledWith("/api/v1/inventory-purchase-missing-costs/movement-1/complete", { version: 1, unit_cost: 12.35, reason: "Factura 204" });
 });
 it("conserva lo escrito si falla el guardado", async () => {
  const user=userEvent.setup();show();
  await user.click(screen.getByRole("button",{name:"Completar costos"}));
  await user.click(await screen.findByRole("button",{name:"Completar costo de Agua 1.5 L"}));
  await user.type(screen.getByLabelText("Costo por unidad"),"12.35");
  await user.type(screen.getByLabelText("Nota (opcional)"),"Factura 204");
  vi.mocked(api.post).mockRejectedValue(new Error("No se pudo guardar el costo."));
  await user.click(screen.getByRole("button",{name:"Guardar costo"}));
  await screen.findByText("No se pudo guardar el costo.");
  expect(screen.getByLabelText("Costo por unidad")).toHaveValue("12.35");
  expect(screen.getByLabelText("Nota (opcional)")).toHaveValue("Factura 204");
  await waitFor(()=>expect(screen.getByRole("button",{name:"Guardar costo"})).toBeEnabled());
 });
 it("no muestra un aviso cuando el reporte está completo", () => {
  const {container}=show(0,[]);expect(container).toBeEmptyDOMElement();expect(api.get).not.toHaveBeenCalled();
 });
 it("abre la revisión de salidas del mismo período", () => {
  show(0,["unclassified_cash_out"]);
  expect(screen.getByRole("link",{name:"Revisar caja"})).toHaveAttribute("href","/reports/cash-close/movements?from=2026-09-01&to=2026-09-07");
  expect(screen.queryByRole("button",{name:"Completar costos"})).not.toBeInTheDocument();
 });
 it("envía los cobros sin concepto a Ingresos", () => {
  show(0,["unclassified_income"]);
  expect(screen.getByRole("link",{name:"Ver ingresos"})).toHaveAttribute("href","/billing");
 });

});
