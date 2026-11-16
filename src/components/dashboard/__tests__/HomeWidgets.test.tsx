import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/stores/useAuthStore";
import type { DashboardData } from "@/hooks/useReports";
vi.mock("@/hooks/useMoneyVisibility", () => ({ useMoneyVisibility: () => ({ hidden: false, fmt: (n: number) => `$${n.toFixed(2)}` }) }));
import { RecentPayments, ReviewList } from "../HomeWidgets";

function signIn(permissions?: string[]) {
  useAuthStore.setState({ user: { user_id: "u1", role: "operator", permissions } as never });
}
function show(recent: DashboardData["recent_payments"]) {
  render(<MemoryRouter><RecentPayments data={{ recent_payments: recent } as DashboardData} incomePath="/billing" /></MemoryRouter>);
}

describe("Cobros en Inicio según el permiso de totales", () => {
  beforeEach(() => useAuthStore.setState({ user: null }));
  it("sin «Ver totales de dinero» dice que son los de hoy y por qué no ve otros días", () => {
    signIn([]);
    show([]);
    expect(screen.getByRole("heading", { name: "Cobros de hoy" })).toBeInTheDocument();
    expect(screen.getByText("Sin cobros hoy.")).toBeInTheDocument();
    expect(screen.queryByText("Sin cobros recientes.")).not.toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Los cobros de otros días los ve el dueño. Requiere el permiso «Ver totales de dinero». Pídeselo al dueño.");
  });
  it("con el permiso conserva «Últimos cobros» sin nota", () => {
    signIn(["view_totals"]);
    show([]);
    expect(screen.getByRole("heading", { name: "Últimos cobros" })).toBeInTheDocument();
    expect(screen.getByText("Sin cobros recientes.")).toBeInTheDocument();
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
  });
  it("las cifras usan la letra de marca con números tabulares", () => {
    signIn(["view_totals"]);
    show([{ id: "p1", member_name: "Socia de prueba", amount: 350, payment_method: "cash", payment_date: "2026-11-13", concept: "membership" }]);
    expect(screen.getByText("$350.00")).toHaveClass("font-display", "tabular");
  });
});

describe("Por revisar", () => {
  it("muestra el nombre y el detalle que recibe, con la cifra en letra de marca", () => {
    render(<MemoryRouter><ReviewList items={[{ id: "unrenewed", count: 113, label: "Sin renovar · 60 días", detail: "Vencieron en los últimos 60 días y no han renovado", to: "/members?status=unrenewed" }]} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: /Sin renovar · 60 días/ })).toHaveAttribute("href", "/members?status=unrenewed");
    expect(screen.getByText("113")).toHaveClass("font-display", "tabular");
  });
});
