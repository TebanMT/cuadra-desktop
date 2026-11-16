import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mock = vi.hoisted(() => ({ plan: "standard_monthly", get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/runtime", () => ({ isDev: false }));
vi.mock("@/stores/useAuthStore", () => ({
  useAuthStore: (select: (state: unknown) => unknown) => select({
    gym: { gym_id: "gym-test", subscription_plan: mock.plan },
    user: { user_id: "owner-test", role: "owner" },
  }),
}));
vi.mock("@/lib/api", async importOriginal => ({
  ...await importOriginal<typeof import("@/lib/api")>(),
  api: { get: mock.get, post: mock.post, patch: vi.fn(), delete: vi.fn() },
}));
vi.mock("@/components/expenses/PaidExpensesLedger", () => ({ PaidExpensesLedger: () => <p>Lista de gastos pagados</p> }));
import { ExpensesWorkspace } from "@/pages/expenses/ExpensesPage";

function show(path = "/expenses") {
  return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } })}>
    <MemoryRouter initialEntries={[path]}><ExpensesWorkspace /></MemoryRouter>
  </QueryClientProvider>);
}
function scheduledRequests() {
  return mock.get.mock.calls.filter(([path]) => /expense-(templates|occurrences)/.test(path));
}

describe("Acceso visible a pagos recurrentes", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mock.plan = "standard_monthly";
    mock.get.mockResolvedValue({ items: [], total: 0 });
  });

  // Desde el 16 nov 2026 la prueba y Standard traen pagos programados; el
  // estado bloqueado sólo aplica a un gym sin la función (plan desconocido).
  it("un gym sin la función la descubre sin cargar pagos programados", async () => {
    mock.plan = "";
    show();
    const tab = screen.getByRole("tab", { name: "Pagos que se repiten No habilitado" });
    expect(tab).toBeEnabled();
    fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
    expect(await screen.findByRole("heading", { name: "Acceso no habilitado" })).toBeVisible();
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: "Consultar ayuda" })).toHaveAttribute("href", "/help");
    expect(screen.queryByRole("button", { name: "Programar pago" })).not.toBeInTheDocument();
    await act(async () => Promise.resolve());
    expect(scheduledRequests()).toEqual([]);
    expect(mock.post).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Pagados" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Lista de gastos pagados")).toBeVisible();
  });

  it("un enlace directo explica el plan requerido sin redirigir a Por pagar", async () => {
    mock.plan = "";
    show("/expenses?view=recurring");
    expect(screen.getByRole("tab", { name: "Pagos que se repiten No habilitado" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Acceso no habilitado" })).toBeVisible();
    await act(async () => Promise.resolve());
    expect(scheduledRequests()).toEqual([]);
  });

  it.each(["trial", "standard_monthly", "standard_annual", "plus_monthly", "plus_annual"])("%s tiene el registro y sus pagos programados", async plan => {
    mock.plan = plan;
    show("/expenses?view=recurring");
    expect(screen.getByRole("tab", { name: "Pagos que se repiten" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Programar pago" }).length).toBeGreaterThan(0));
    expect(scheduledRequests().some(([path]) => path.includes("expense-templates"))).toBe(true);
    expect(screen.queryByRole("link", { name: "Consultar ayuda" })).not.toBeInTheDocument();
  });
});
