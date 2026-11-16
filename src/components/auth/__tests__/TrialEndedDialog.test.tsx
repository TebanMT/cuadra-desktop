import { afterEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useAuthStore, type AuthGym, type AuthUser } from "@/stores/useAuthStore";
import { openExternalUrl } from "@/lib/openExternal";
import { BILLING_URL } from "@/lib/billing";
import { trialEndedBody } from "@/lib/trialEnded";
import { TrialEndedDialog } from "../TrialEndedDialog";

vi.mock("@/lib/openExternal", () => ({ openExternalUrl: vi.fn(async () => true) }));

const past = () => new Date(Date.now() - 24 * 3600 * 1000).toISOString();

function gym(overrides: Partial<AuthGym>): AuthGym {
  return {
    gym_id: "00000000-0000-0000-0000-000000000000",
    name: "Gym Ejemplo",
    setup_completed: true,
    trial_ends_at: past(),
    subscription_plan: "trial",
    subscription_status: "active",
    subscription_ends_at: null,
    ...overrides,
  };
}

function user(role: AuthUser["role"]): AuthUser {
  return { user_id: "u1", full_name: "Ana Ejemplo", email: "ana@example.com", phone: null, role, has_pin: true };
}

afterEach(() => {
  useAuthStore.setState({ user: null, gym: null, readOnly: false });
  vi.clearAllMocks();
});

describe("trialEndedBody", () => {
  it("cuenta la fecha de corte durante la gracia", () => {
    const body = trialEndedBody(gym({ subscription_status: "cancelled", subscription_ends_at: "2099-11-16T12:00:00Z" }));
    expect(body).toMatch(/hasta el 16 nov 2099/);
    expect(body).toMatch(/solo lectura/);
  });
  it("explica la solo lectura cuando la gracia ya pasó", () => {
    expect(trialEndedBody(gym({ subscription_status: "cancelled", subscription_ends_at: past() }))).toMatch(/^La recepción quedó en solo lectura/);
  });
  it("avisa sin fecha cuando el cloud todavía no la cierra", () => {
    expect(trialEndedBody(gym({}))).toMatch(/^En unos días/);
  });
});

describe("TrialEndedDialog", () => {
  it("el dueño puede abrir el pago y sigue al inicio", async () => {
    useAuthStore.getState().setSession(user("owner"), gym({}));
    const onContinue = vi.fn();
    render(<TrialEndedDialog open onContinue={onContinue} />);
    await userEvent.click(screen.getByRole("button", { name: "Activar mi plan" }));
    expect(openExternalUrl).toHaveBeenCalledWith(BILLING_URL);
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
  it("cerrar el aviso nunca pone la recepción en solo lectura", async () => {
    useAuthStore.getState().setSession(user("owner"), gym({}));
    const onContinue = vi.fn();
    render(<TrialEndedDialog open onContinue={onContinue} />);
    await userEvent.click(screen.getByRole("button", { name: "Ahora no" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
    expect(useAuthStore.getState().readOnly).toBe(false);
  });
  it("al operador le pide avisar al dueño en vez de pagar", async () => {
    useAuthStore.getState().setSession(user("operator"), gym({}));
    const onContinue = vi.fn();
    render(<TrialEndedDialog open onContinue={onContinue} />);
    expect(screen.queryByRole("button", { name: "Activar mi plan" })).not.toBeInTheDocument();
    expect(screen.getByText(/Avísale al dueño/)).toBeVisible();
    await userEvent.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onContinue).toHaveBeenCalledTimes(1);
  });
});
