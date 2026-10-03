import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
const mock = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), role: "owner", user: "purchase-test-user", gym: "purchase-test-gym" }));
vi.mock("@/lib/api", () => ({ api: { get: mock.get, post: mock.post } }));
vi.mock("@/stores/useAuthStore", () => ({ useAuthStore: (select: (s: unknown) => unknown) => select({ user: { role: mock.role, user_id: mock.user }, gym: { gym_id: mock.gym } }) }));
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: (s: string) => s }));
vi.mock("@/components/cash/CashDrawerField", () => ({ CashDrawerField: () => null }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import RegisterPurchasePage from "@/pages/products/RegisterPurchasePage";
import { MemoryRouter, Route, Routes } from "react-router-dom";
const desktop = true;
function show() { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}><MemoryRouter initialEntries={[{ pathname: "/products/purchases/new", state: { returnTo: "/expenses" } }]}><Routes><Route path="/products/purchases/new" element={<RegisterPurchasePage />} /><Route path="*" element={<p>Compra terminada</p>} /></Routes></MemoryRouter></QueryClientProvider>); }
async function add(name: string, quantity: string, cost: string) {
  fireEvent.focus(screen.getByLabelText("Buscar producto"));
  fireEvent.click(await screen.findByRole("button", { name }));
  fireEvent.change(screen.getByLabelText(`Cantidad de ${name}`), { target: { value: quantity } });
  fireEvent.change(screen.getByLabelText(`Costo de ${name}`), { target: { value: cost } });
}
describe("Registro de compra", () => {
  beforeEach(() => { sessionStorage.clear(); localStorage.clear(); vi.clearAllMocks(); mock.role = "owner"; mock.user = "purchase-test-user"; mock.gym = "purchase-test-gym"; mock.get.mockResolvedValue({ items: [{ id: "water", name: "Agua" }, { id: "bar", name: "Barra" }], total: 2 }); mock.post.mockResolvedValue({ items: [] }); });
  it("guarda varios productos en una sola operación y separa recepción de pago", async () => {
    show(); await add("Agua", "20", "10"); await add("Barra", "5", "12.50");
    expect(screen.getByText("$262.50")).toBeInTheDocument();
    expect(screen.getByLabelText("Ya recibí los productos")).toHaveProperty("checked", desktop);
    expect(screen.queryByLabelText("Pagado desde")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("radio", { name: "Pagado por otro medio" }));
    fireEvent.change(screen.getByLabelText("Pagado desde"), { target: { value: "gym_fund" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(1));
    expect(mock.post).toHaveBeenCalledWith("/api/v1/inventory-purchase-registrations", expect.objectContaining({ received: desktop, paid: true, payment_method: "transfer", paid_from: "gym_fund", items: [{ product_id: "water", quantity: 20, unit_cost: 10 }, { product_id: "bar", quantity: 5, unit_cost: 12.5 }] }));
  });
  it("captura la fecha en español, bloquea una fecha imposible y conserva ISO en la compra", async () => {
    show(); await add("Agua", "2", "10");
    fireEvent.click(screen.getByRole("radio", { name: "Pagado por otro medio" }));
    fireEvent.change(screen.getByLabelText("Pagado desde"), { target: { value: "gym_fund" } });
    const date = screen.getByLabelText("Fecha de pago");
    fireEvent.change(date, { target: { value: "31/02/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    expect(mock.post).not.toHaveBeenCalled();
    expect(date).toHaveFocus();
    fireEvent.change(date, { target: { value: "07/09/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(1));
    expect(mock.post.mock.calls[0][1]).toEqual(expect.objectContaining({ paid_on: "2026-09-07" }));
  });
  it("conserva la misma solicitud después de perder la respuesta", async () => {
    mock.post.mockRejectedValueOnce(new Error("connection lost")); show(); await add("Agua", "3", "10");
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar registro" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(2));
    expect(mock.post.mock.calls[1]).toEqual(mock.post.mock.calls[0]);
    expect(mock.post.mock.calls[0][1]).not.toHaveProperty("paid_on");
  });
  it("recupera un registro sin respuesta después de salir de la pantalla", async () => {
    mock.post.mockRejectedValueOnce(new Error("connection lost"));
    const first = show(); await add("Agua", "3", "10");
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    await screen.findByRole("button", { name: "Reintentar registro" });
    const payload = mock.post.mock.calls[0][1]; first.unmount(); show();
    expect(await screen.findByLabelText("Cantidad de Agua")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar registro" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(2));
    expect(mock.post.mock.calls[1][1]).toEqual(payload);
    await waitFor(() => expect(localStorage.getItem("tinta:purchase-draft:purchase-test-gym:purchase-test-user")).toBeNull());
  });
  it("deja la compra pendiente por defecto y limita las opciones del operador", async () => {
    mock.role = "operator"; show(); await add("Agua", "20", "10");
    expect(screen.queryByRole("radio", { name: "Pagado por otro medio" })).not.toBeInTheDocument();
    expect(screen.getByRole("radio", { name: "Pendiente de pago" })).toBeChecked();
    expect(!!screen.queryByRole("radio", { name: "Pagado con dinero de caja" })).toBe(desktop);
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ paid: false })));
  });
  it("crea el producto y la compra juntos, sin peticiones previas", async () => {
    show();
    fireEvent.change(screen.getByLabelText("Buscar producto"), { target: { value: "Bebida nueva" } });
    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
    expect(screen.getByLabelText("Nombre")).toHaveValue("Bebida nueva");
    fireEvent.change(screen.getByLabelText("Precio de venta", { exact: true }), { target: { value: "35" } });
    fireEvent.click(screen.getByRole("button", { name: "Agregar a la compra" }));
    expect(mock.post).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Cantidad de Bebida nueva"), { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText("Costo de Bebida nueva"), { target: { value: "15" } });
    expect(screen.getByLabelText("Subtotal de Bebida nueva")).toHaveTextContent("$180.00");
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(1));
    expect(mock.post.mock.calls[0][1].items).toEqual([{ product_id: expect.any(String), quantity: 12, unit_cost: 15, new_product: { name: "Bebida nueva", price: 35 } }]);
  });
  it("recupera cantidades y un producto nuevo sin terminar al volver", async () => {
    const first = show(); await add("Agua", "12", "9.50");
    fireEvent.click(screen.getByRole("button", { name: "Nuevo producto" }));
    fireEvent.change(screen.getByLabelText("Nombre"), { target: { value: "Proteína" } });
    fireEvent.change(screen.getByLabelText("Precio de venta", { exact: true }), { target: { value: "60" } });
    first.unmount(); show();
    expect(screen.getByLabelText("Cantidad de Agua")).toHaveValue(12);
    expect(screen.getByLabelText("Costo de Agua")).toHaveValue(9.5);
    expect(screen.getByLabelText("Nombre")).toHaveValue("Proteína");
    expect(screen.getByLabelText("Precio de venta", { exact: true })).toHaveValue(60);
    expect(mock.post).not.toHaveBeenCalled();
  });
  it("conserva la compra al volver a Gastos", async () => {
    show(); await add("Agua", "2", "10");
    fireEvent.click(screen.getByRole("button", { name: "Volver" }));
    expect(await screen.findByText("Compra terminada")).toBeInTheDocument();
    expect(mock.post).not.toHaveBeenCalled();
    expect(JSON.parse(localStorage.getItem("tinta:purchase-draft:purchase-test-gym:purchase-test-user")!).lines[0].quantity).toBe("2");
  });
  it("no mezcla borradores entre usuarios o gimnasios", async () => {
    const first = show(); await add("Agua", "2", "10"); first.unmount();
    mock.user = "another-user"; const second = show();
    expect(screen.queryByLabelText("Cantidad de Agua")).not.toBeInTheDocument(); second.unmount();
    mock.user = "purchase-test-user"; mock.gym = "another-gym"; show();
    expect(screen.queryByLabelText("Cantidad de Agua")).not.toBeInTheDocument();
  });
  it("muestra el error junto al costo y no envía una compra incompleta", async () => {
    show(); await add("Agua", "2", "");
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    expect(screen.getByLabelText("Costo de Agua")).toHaveAttribute("aria-invalid", "true");
    expect(screen.getByText("Escribe el costo por unidad, con hasta dos decimales.")).toBeInTheDocument();
    expect(mock.post).not.toHaveBeenCalled();
  });
  it("descarta el borrador sólo después de confirmarlo", async () => {
    show(); await add("Agua", "2", "10");
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    fireEvent.click(screen.getByRole("button", { name: "Seguir capturando" }));
    expect(screen.getByLabelText("Cantidad de Agua")).toHaveValue(2);
    fireEvent.click(screen.getByRole("button", { name: "Descartar borrador" }));
    fireEvent.click(screen.getAllByRole("button", { name: "Descartar borrador" }).at(-1)!);
    expect(screen.queryByLabelText("Cantidad de Agua")).not.toBeInTheDocument();
    expect(mock.post).not.toHaveBeenCalled();
  });
  it("bloquea cambios cuando otra pestaña modificó el mismo borrador", async () => {
    show(); await add("Agua", "2", "10");
    const key = "tinta:purchase-draft:purchase-test-gym:purchase-test-user";
    const other = JSON.parse(localStorage.getItem(key)!); other.lines[0].quantity = "7";
    localStorage.setItem(key, JSON.stringify(other));
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    expect(mock.post).not.toHaveBeenCalled();
    expect(screen.getByRole("button", { name: "Guardar compra" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Cargar borrador" }));
    expect(screen.getByLabelText("Cantidad de Agua")).toHaveValue(7);
  });
  it("no libera un registro incierto por un fallo posterior de autenticación", async () => {
    mock.post.mockRejectedValueOnce(new Error("lost response")).mockRejectedValueOnce(Object.assign(new Error("expired"), { status: 401 }));
    show(); await add("Agua", "2", "10");
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    fireEvent.click(await screen.findByRole("button", { name: "Reintentar registro" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(2));
    expect(await screen.findByRole("button", { name: "Reintentar registro" })).toBeEnabled();
    expect(screen.getByLabelText("Cantidad de Agua")).toBeDisabled();
    expect(screen.queryByRole("button", { name: "Descartar borrador" })).not.toBeInTheDocument();
  });
  it("recupera los registros inciertos del antiguo modal", async () => {
    const request = { id: "legacy-id", items: [{ product_id: "water", quantity: 3, unit_cost: 10 }], received: true, paid: false };
    sessionStorage.setItem("tinta:pending-purchase:purchase-test-gym", JSON.stringify({ request, lines: [{ id: "water", name: "Agua", quantity: "3", cost: "10" }] }));
    show();
    expect(screen.getByLabelText("Cantidad de Agua")).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar registro" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledWith("/api/v1/inventory-purchase-registrations", request));
  });

  it("no sobrescribe un borrador que no pudo recuperar", async () => {
    const key = "tinta:purchase-draft:purchase-test-gym:purchase-test-user";
    localStorage.setItem(key, "{invalid"); show();
    expect(screen.getByText("No se pudo recuperar el borrador. Intenta recargar la página.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Guardar compra" })).toBeDisabled();
    expect(localStorage.getItem(key)).toBe("{invalid");
    expect(mock.post).not.toHaveBeenCalled();
  });

  it("muestra las opciones disponibles sin desplegar campos antes de elegir", () => {
    show();
    expect(screen.getByRole("radio", { name: "Pendiente de pago" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Pagado por otro medio" })).toBeVisible();
    expect(!!screen.queryByRole("radio", { name: "Pagado con dinero de caja" })).toBe(desktop);
    expect(screen.queryByLabelText("Fecha de pago")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Método de pago")).not.toBeInTheDocument();
  });

  it("al volver a pendiente no envía datos del pago anterior", async () => {
    show(); await add("Agua", "2", "10");
    fireEvent.click(screen.getByRole("radio", { name: "Pagado por otro medio" }));
    fireEvent.change(screen.getByLabelText("Pagado desde"), { target: { value: "external" } });
    fireEvent.click(screen.getByRole("radio", { name: "Pendiente de pago" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(1));
    const request = mock.post.mock.calls[0][1];
    expect(request.paid).toBe(false);
    for (const field of ["paid_on", "paid_from", "payment_method", "cash_drawer_id"]) expect(request).not.toHaveProperty(field);
  });

  it("recupera un borrador de pago previo a las nuevas opciones", async () => {
    const first = show(); await add("Agua", "2", "10");
    const key = "tinta:purchase-draft:purchase-test-gym:purchase-test-user";
    first.unmount();
    const oldDraft = JSON.parse(localStorage.getItem(key)!);
    localStorage.setItem(key, JSON.stringify({ ...oldDraft, paid: true, method: "card", source: "external" }));
    show();
    expect(screen.getByRole("radio", { name: "Pagado por otro medio" })).toBeChecked();
    expect(screen.getByLabelText("Método de pago")).toHaveValue("card");
    expect(screen.getByLabelText("Pagado desde")).toHaveValue("external");
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledWith(expect.any(String), expect.objectContaining({ paid: true, payment_method: "card", paid_from: "external" })));
  });

  it.each(["owner", "operator"])("%s paga desde caja en una sola solicitud, incluso al reintentar después de recargar", async role => {
    mock.role = role;
    mock.post.mockRejectedValueOnce(new Error("lost response"));
    const first = show(); await add("Agua", "20", "10");
    fireEvent.click(screen.getByRole("radio", { name: "Pagado con dinero de caja" }));
    expect(screen.queryByLabelText("Método de pago")).not.toBeInTheDocument();
    expect(screen.queryByLabelText("Pagado desde")).not.toBeInTheDocument();
    expect(screen.getByText("Se descontarán $200.00 de caja.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    await screen.findByRole("button", { name: "Reintentar registro" });
    const request = mock.post.mock.calls[0][1];
    expect(request).toMatchObject({ paid: true, received: true, payment_method: "cash", paid_from: "cash_drawer", items: [{ product_id: "water", quantity: 20, unit_cost: 10 }] });
    first.unmount(); show();
    expect(screen.getByRole("radio", { name: "Pagado con dinero de caja" })).toBeChecked();
    expect(screen.getByRole("radio", { name: "Pendiente de pago" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Reintentar registro" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(2));
    expect(mock.post.mock.calls[1]).toEqual(mock.post.mock.calls[0]);
  });

  it("cambiar de caja a otro medio exige indicar de dónde salió el dinero", async () => {
    show(); await add("Agua", "2", "10");
    fireEvent.click(screen.getByRole("radio", { name: "Pagado con dinero de caja" }));
    fireEvent.click(screen.getByRole("radio", { name: "Pagado por otro medio" }));
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    expect(mock.post).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Pagado desde")).toHaveAttribute("aria-invalid", "true");
    fireEvent.change(screen.getByLabelText("Pagado desde"), { target: { value: "gym_fund" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    await waitFor(() => expect(mock.post).toHaveBeenCalledTimes(1));
    expect(mock.post.mock.calls[0][1]).toMatchObject({ paid: true, paid_from: "gym_fund", payment_method: "transfer" });
    expect(mock.post.mock.calls[0][1]).not.toHaveProperty("cash_drawer_id");
  });

  it("un cambio de rol no convierte silenciosamente un pago del dueño en una compra pendiente", async () => {
    const first = show(); await add("Agua", "2", "10");
    fireEvent.click(screen.getByRole("radio", { name: "Pagado por otro medio" }));
    fireEvent.change(screen.getByLabelText("Pagado desde"), { target: { value: "external" } });
    first.unmount(); mock.role = "operator"; show();
    fireEvent.click(screen.getByRole("button", { name: "Guardar compra" }));
    expect(mock.post).not.toHaveBeenCalled();
    expect(screen.getByText("En recepción puedes pagar con dinero de caja o dejar el pago pendiente.")).toBeInTheDocument();
  });

});
