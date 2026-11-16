import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { MemoryRouter, useLocation } from "react-router-dom";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, logoutMutate, authState } = vi.hoisted(() => ({
  getMock: vi.fn(),
  logoutMutate: vi.fn(),
  authState: { readOnly: false },
}));

vi.mock("@/lib/api", () => ({ api: { get: (...args: unknown[]) => getMock(...args) } }));
vi.mock("@/hooks/useAuth", () => ({ useLogout: () => ({ mutate: logoutMutate, isPending: false }) }));
vi.mock("@/stores/useAuthStore", () => ({ useAuthStore: (selector: (state: typeof authState) => unknown) => selector(authState) }));

import { useCashAwareLogout } from "../useCashAwareLogout";

function Harness() {
  const logout = useCashAwareLogout();
  const location = useLocation();
  return <>
    <button type="button" onClick={() => void logout.requestLogout()}>Cerrar sesión</button>
    <output aria-label="Ruta">{location.pathname}</output>
    {logout.dialog}
  </>;
}

function show() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  render(<QueryClientProvider client={client}><MemoryRouter initialEntries={["/"]}><Harness /></MemoryRouter></QueryClientProvider>);
  fireEvent.click(screen.getByRole("button", { name: "Cerrar sesión" }));
}

const todayOpen = { date: "2026-11-12", is_today: true, cash_drawer_id: "main", drawer_name: "Caja principal", is_main_drawer: true, reason: "open", uncovered_cash: 0, count_now: false };
const yesterdayOpen = { ...todayOpen, date: "2026-11-11", is_today: false };

describe("cerrar sesión con la caja sin corte", () => {
  beforeEach(() => { vi.clearAllMocks(); authState.readOnly = false; });

  it("recuerda el corte de hoy y deja salir sin corte", async () => {
    getMock.mockResolvedValue({ items: [todayOpen, yesterdayOpen] });
    show();
    expect(await screen.findByRole("dialog", { name: "La caja de hoy sigue sin corte" })).toBeInTheDocument();
    expect(getMock).toHaveBeenCalledWith("/api/v1/cash-close/pending-days", { query: { include_today: true } });
    expect(screen.getByText("La caja sigue abierta.")).toBeInTheDocument();
    expect(logoutMutate).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Salir sin corte" }));
    expect(logoutMutate).toHaveBeenCalledTimes(1);
  });

  it("lleva a Caja sin cerrar la sesión", async () => {
    getMock.mockResolvedValue({ items: [todayOpen] });
    show();
    fireEvent.click(await screen.findByRole("button", { name: "Ir a Caja" }));
    expect(screen.getByLabelText("Ruta")).toHaveTextContent("/reports/cash-close");
    expect(logoutMutate).not.toHaveBeenCalled();
  });

  it("sale de inmediato cuando sólo quedan días anteriores o la consulta falla", async () => {
    getMock.mockResolvedValueOnce({ items: [yesterdayOpen] });
    show();
    await waitFor(() => expect(logoutMutate).toHaveBeenCalledTimes(1));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    getMock.mockRejectedValueOnce(new Error("offline"));
    fireEvent.click(screen.getAllByRole("button", { name: "Cerrar sesión" })[0]);
    await waitFor(() => expect(logoutMutate).toHaveBeenCalledTimes(2));
  });

  it("en solo lectura no pregunta por la caja", () => {
    authState.readOnly = true;
    show();
    expect(getMock).not.toHaveBeenCalled();
    expect(logoutMutate).toHaveBeenCalledTimes(1);
  });
});
