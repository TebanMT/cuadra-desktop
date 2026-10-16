import { validCount } from "../countValidation";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
const { get, post } = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", async () => { const actual = await vi.importActual<object>("@/lib/api"); return { ...actual, api: { get, post } }; });
import { StockCountButton } from "../StockCount";
import { useAuthStore } from "@/stores/useAuthStore";
function renderCount() { render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}><StockCountButton desktop /></QueryClientProvider>); fireEvent.click(screen.getByRole("button", { name: "Contar productos" })); }
describe("Conteo físico", () => {
 beforeEach(() => { vi.clearAllMocks(); localStorage.clear(); useAuthStore.setState({ user: { user_id: "operator", role: "operator" } as never, gym: { gym_id: "gym" } as never }); get.mockResolvedValue({ items: [{ id: "a", name: "Agua", stock: 4, count_revision: "one" }, { id: "b", name: "Barra", stock: 2, count_revision: "two" }], total: 2 }); });
 it("distingue cero, vacío, fracciones y cantidades inválidas", () => { expect(validCount("0")).toBe(true); for (const value of ["", "-1", "0.5", "1e3", "1000001", "NaN"]) expect(validCount(value)).toBe(false); });
 it("conserva un intento incierto al cerrar y lo consulta sin cambiar su identidad", async () => {
  post.mockRejectedValueOnce(new Error("response lost")).mockResolvedValue({ id: "done" }); renderCount();
  fireEvent.change(await screen.findByLabelText("Contadas: Agua"), { target: { value: "0" } });
  fireEvent.click(screen.getByLabelText(/Ya registré las compras recibidas/));fireEvent.click(screen.getByRole("button", { name: "Revisar diferencias" }));
  fireEvent.click(screen.getByRole("button", { name: "Confirmar conteo" }));
  await screen.findByText(/Aún no confirmamos el resultado/);const request=post.mock.calls[0][1]; expect(request.lines).toEqual([{ product_id: "a", revision: "one", quantity: 0 }]);
  fireEvent.click(screen.getByRole("button", { name: "Continuar después" }));fireEvent.click(screen.getByRole("button", { name: "Contar productos" }));
  fireEvent.click(await screen.findByRole("button", { name: "Comprobar guardado" }));await screen.findByText("Conteo confirmado en esta computadora.");
  expect(post.mock.calls[1][1]).toEqual(request);expect(localStorage.getItem("tinta:stock-count:v1:gym:operator")).toBeNull();
 });
 it("conserva captura al cerrar y protege cambios de otra ventana", async () => {
  renderCount();fireEvent.change(await screen.findByLabelText("Contadas: Agua"), { target: { value: "3" } });
  const key="tinta:stock-count:v1:gym:operator";const saved=localStorage.getItem(key);expect(saved).toContain('"quantity":"3"');
  localStorage.setItem(key, "another window");fireEvent.change(screen.getByLabelText("Contadas: Agua"), { target: { value: "2" } });
  await waitFor(() => expect(screen.getByRole("alert")).toHaveTextContent("otra ventana"));expect(localStorage.getItem(key)).toBe("another window");expect(post).not.toHaveBeenCalled();
 });
});
