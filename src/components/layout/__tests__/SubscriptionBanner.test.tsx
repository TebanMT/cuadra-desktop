import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore, type AuthGym } from "@/stores/useAuthStore";
vi.mock("@/hooks/useSyncStatus", () => ({
  useSyncStatus: () => ({ data: { last_synced_at: new Date().toISOString(), sync_in_progress: false } }),
  useTriggerSync: () => ({ mutate: vi.fn(), isPending: false }),
}));
import { SubscriptionBanner } from "../SubscriptionBanner";

const pastDue: AuthGym = { gym_id: "g1", name: "Gimnasio de prueba", setup_completed: true, subscription_plan: "standard_monthly", subscription_status: "past_due", subscription_ends_at: null, trial_ends_at: null };
function signIn(role: "owner" | "operator", gym: AuthGym = pastDue) {
  useAuthStore.setState({ gym, user: { user_id: "u1", role } as never });
}
function show() {
  render(<MemoryRouter><SubscriptionBanner /></MemoryRouter>);
}

describe("Aviso de suscripción según quién lo lee", () => {
  beforeEach(() => useAuthStore.setState({ gym: null, user: null }));
  it("al dueño le pide actualizar su método de pago y ofrece ver el plan", () => {
    signIn("owner");
    show();
    expect(screen.getByRole("status")).toHaveTextContent("Actualiza tu método de pago");
    expect(screen.getByRole("link", { name: "Ver plan" })).toHaveAttribute("href", "/settings/subscription");
  });
  it("al operador le dice que avise al dueño, sin enlace a una ruta del dueño", () => {
    signIn("operator");
    show();
    const banner = screen.getByRole("status");
    expect(banner).toHaveTextContent("Avísale al dueño");
    expect(banner).not.toHaveTextContent("Actualiza tu método de pago");
    expect(screen.queryByRole("link", { name: "Ver plan" })).not.toBeInTheDocument();
  });
  it("en una prueba en solo lectura, el operador sabe qué puede hacer y a quién avisar", () => {
    signIn("operator", { ...pastDue, subscription_plan: "trial", subscription_status: "cancelled", subscription_ends_at: "2020-01-01" });
    show();
    expect(screen.getByRole("status")).toHaveTextContent("puedes consultar y registrar entradas. Avísale al dueño para que active el plan.");
    expect(screen.queryByRole("link")).not.toBeInTheDocument();
  });
});
