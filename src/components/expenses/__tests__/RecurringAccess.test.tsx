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

  it.each(["standard_monthly", "standard_annual", "trial"])("%s descubre la función y puede consultar los planes sin cargar datos Plus", async plan => {
    mock.plan = plan;
    show();
    const tab = screen.getByRole("tab", { name: "Pagos que se repiten Plus" });
    expect(tab).toBeEnabled();
    fireEvent.mouseDown(tab, { button: 0, ctrlKey: false });
    expect(await screen.findByRole("heading", { name: "Incluido en Plus" })).toBeVisible();
    expect(tab).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("link", { name: "Ver planes" })).toHaveAttribute("href", "/settings/subscription");
    expect(screen.queryByRole("button", { name: "Programar pago" })).not.toBeInTheDocument();
    await act(async () => Promise.resolve());
    expect(scheduledRequests()).toEqual([]);
    expect(mock.post).not.toHaveBeenCalled();
    fireEvent.mouseDown(screen.getByRole("tab", { name: "Pagados" }), { button: 0, ctrlKey: false });
    expect(await screen.findByText("Lista de gastos pagados")).toBeVisible();
  });

  it("un enlace directo explica el plan requerido sin redirigir a Por pagar", async () => {
    show("/expenses?view=recurring");
    expect(screen.getByRole("tab", { name: "Pagos que se repiten Plus" })).toHaveAttribute("aria-selected", "true");
    expect(screen.getByRole("heading", { name: "Incluido en Plus" })).toBeVisible();
    await act(async () => Promise.resolve());
    expect(scheduledRequests()).toEqual([]);
  });

  it.each(["plus_monthly", "plus_annual"])("%s conserva el acceso al registro y a sus pagos programados", async plan => {
    mock.plan = plan;
    show("/expenses?view=recurring");
    expect(screen.getByRole("tab", { name: "Pagos que se repiten" })).toHaveAttribute("aria-selected", "true");
    await waitFor(() => expect(screen.getAllByRole("button", { name: "Programar pago" }).length).toBeGreaterThan(0));
    expect(scheduledRequests().some(([path]) => path.includes("expense-templates"))).toBe(true);
    expect(screen.queryByRole("link", { name: "Ver planes" })).not.toBeInTheDocument();
  });
});
