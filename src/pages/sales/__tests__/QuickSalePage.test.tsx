import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { state, sell } = vi.hoisted(() => ({
 state: { user: "u1", products: [
  { id: "water", name: "Agua botella", price: 20, stock: 0, active: true, category: "Bebidas" },
  { id: "shaker", name: "Botella shaker", price: 100, stock: 3, active: true, category: "Accesorios" },
 ] }, sell: vi.fn(),
}));
vi.mock("@/hooks/useProducts", () => ({ useActiveProducts: () => ({ data: state.products, isLoading: false, refetch: vi.fn() }), stockLevel: () => "ok" }));
vi.mock("@/hooks/useSales", () => ({ useRegisterSale: () => ({ mutateAsync: sell, isPending: false }) }));
vi.mock("@/hooks/useBilling", () => ({ usePaymentHistory: () => ({ data: { items: [], total_pending: 0 }, refetch: vi.fn() }), fmtMoney: (n: number) => `$${n.toFixed(2)}` }));
vi.mock("@/hooks/useSyncStatus", () => ({ useSyncStatus: () => ({ data: { state: "online" } }) }));
vi.mock("@/stores/useAuthStore", () => ({ useAuthStore: (selector: (v: unknown) => unknown) => selector({ gym: { gym_id: "g1" }, user: { user_id: state.user } }) }));
vi.mock("@/components/products/ProductPhoto", () => ({ ProductPhoto: () => null }));
vi.mock("@/components/billing/PromotionPickerModal", () => ({ PromotionPickerModal: () => null }));
vi.mock("@/components/billing/SettleBalanceModal", () => ({ SettleBalanceModal: () => null }));
vi.mock("@/components/billing/ReceiptViewer", () => ({ ReceiptViewer: () => null }));
vi.mock("@/components/sales/SaleCorrectionModal", () => ({ SaleCorrectionModal: () => null }));
vi.mock("@/components/sales/CheckoutModal", () => ({ CheckoutModal: ({ open, onConfirm, blockedReason }: { open: boolean; onConfirm(v: unknown): void; blockedReason?: string }) => open ? <button disabled={!!blockedReason} onClick={() => { void Promise.resolve(onConfirm({ method: "cash", received: 100 })).catch(() => {}); }}>Confirmar prueba</button> : null }));
import QuickSalePage from "../QuickSalePage";
import { ApiError } from "@/lib/api";
function app() { return <MemoryRouter><QuickSalePage /></MemoryRouter>; }
beforeEach(() => {
 localStorage.clear(); state.user = "u1"; state.products[0].price = 20;
 sell.mockReset().mockResolvedValue({ sale_id: "s1", payment_id: "p1", folio: "PRD-1", paid: 20, total: 20, balance_pending: 0 });
});
describe("Venta en curso", () => {
 it("Enter vacío no agrega; la primera coincidencia visible sí", () => {
  render(app()); const search = screen.getByRole("textbox", { name: "Buscar producto" });
  fireEvent.keyDown(search, { key: "Enter" }); expect(screen.getByRole("button", { name: "Cobrar $0.00" })).toBeDisabled();
  fireEvent.change(search, { target: { value: "botella" } }); fireEvent.keyDown(search, { key: "Enter" });
  expect(screen.getByRole("button", { name: "Cobrar $20.00" })).toBeEnabled();
 });
 it("edita cantidades sin limitarse a existencias y rechaza fracciones", () => {
  render(app()); fireEvent.click(screen.getByRole("button", { name: "Agregar Agua botella" }));
  const quantity = screen.getByLabelText("Cantidad de Agua botella");
  fireEvent.change(quantity, { target: { value: "5" } }); fireEvent.blur(quantity);
  expect(screen.getByRole("button", { name: "Cobrar $100.00" })).toBeEnabled();
  fireEvent.change(quantity, { target: { value: "1.5" } }); fireEvent.blur(quantity);
  expect(screen.getByRole("button", { name: "Cobrar $100.00" })).toBeEnabled();
  expect(screen.getByText("Escribe una cantidad entera mayor a cero.")).toBeInTheDocument();
 });
 it("recupera el borrador, aislado por usuario", () => {
  const page = render(app()); fireEvent.click(screen.getByRole("button", { name: "Agregar Agua botella" })); page.unmount();
  const next = render(app()); expect(screen.getByRole("button", { name: "Cobrar $20.00" })).toBeEnabled();
  state.user = "u2"; next.rerender(app()); expect(screen.getByRole("button", { name: "Cobrar $0.00" })).toBeDisabled();
 });
 it("exige revisar precios nuevos y conserva la cantidad", () => {
  const page = render(app()); fireEvent.click(screen.getByRole("button", { name: "Agregar Agua botella" }));
  state.products = state.products.map(p => p.id === "water" ? { ...p, price: 30 } : p); page.rerender(app());
  expect(screen.getByRole("button", { name: "Cobrar $20.00" })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "Revisar cambios" })); fireEvent.click(screen.getByRole("button", { name: "Actualizar venta" }));
  expect(screen.getByRole("button", { name: "Cobrar $30.00" })).toBeEnabled();
 });
 it("mantiene el cambio visible tras cobrar y envía el total confirmado", async () => {
  render(app()); fireEvent.click(screen.getByRole("button", { name: "Agregar Agua botella" })); fireEvent.click(screen.getByRole("button", { name: "Cobrar $20.00" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar prueba" }));
  await screen.findByText("Cambio: $80.00"); expect(sell.mock.calls[0][0].expected_total).toBe(20);
  expect(screen.getByRole("button", { name: "Cobrar $0.00" })).toBeDisabled();
 });
 it("reintenta la misma operación tras una respuesta perdida y recarga", async () => {
  sell.mockRejectedValueOnce(new ApiError(503, "unavailable", "Respuesta perdida"));
  const page = render(app()); fireEvent.click(screen.getByRole("button", { name: "Agregar Agua botella" })); fireEvent.click(screen.getByRole("button", { name: "Cobrar $20.00" })); fireEvent.click(screen.getByRole("button", { name: "Confirmar prueba" }));
  await screen.findByRole("button", { name: "Reintentar confirmación" }); await waitFor(() => expect(sell).toHaveBeenCalledTimes(1));
  const first = sell.mock.calls[0][0]; page.unmount(); render(app());
  fireEvent.click(screen.getByRole("button", { name: "Reintentar confirmación" }));
  await waitFor(() => expect(sell).toHaveBeenCalledTimes(2)); expect(sell.mock.calls[1][0]).toEqual(first);
 });
});
