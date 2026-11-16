import { act, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { toast } from "sonner";
import { OwnerOnlyRoute, ProtectedRoute } from "../RouteGuards";
vi.mock("sonner", () => ({ toast: vi.fn() }));
import { useAuthStore, type AuthGym } from "@/stores/useAuthStore";
const gym: AuthGym = { gym_id: "test", name: "Prueba", setup_completed: true, subscription_plan: "standard_monthly", subscription_status: "active", subscription_ends_at: null, trial_ends_at: null };
function show(path: string) {
  render(<MemoryRouter initialEntries={[path]}><Routes><Route element={<ProtectedRoute />}><Route path="/" element={<p>Recepción</p>} /><Route path="/auth/subscription-blocked" element={<p>Bloqueo</p>} /><Route path="/auth/setup-required" element={<p>Configuración pendiente</p>} /><Route path="/auth/change-password" element={<p>Cambiar contraseña</p>} /></Route></Routes></MemoryRouter>);
}
describe("salida de pantallas terminales", () => {
  beforeEach(() => useAuthStore.setState({ hydrated: true, readOnly: false, gym, user: { user_id: "test", full_name: "Persona de prueba", email: "test@example.com", role: "owner", phone: null, has_pin: false } }));
  it("regresa a recepción al reactivar la suscripción", async () => {
    useAuthStore.setState({ gym: { ...gym, subscription_status: "cancelled", subscription_ends_at: "2020-01-01" } });
    show("/auth/subscription-blocked"); expect(screen.getByText("Bloqueo")).toBeVisible();
    act(() => useAuthStore.setState({ gym })); expect(await screen.findByText("Recepción")).toBeVisible();
  });
  it("regresa cuando se completa la configuración", async () => {
    useAuthStore.setState({ gym: { ...gym, setup_completed: false } }); show("/auth/setup-required");
    expect(screen.getByText("Configuración pendiente")).toBeVisible();
    act(() => useAuthStore.setState({ gym })); expect(await screen.findByText("Recepción")).toBeVisible();
  });
  it("exige cambiar una contraseña temporal antes de operar", async () => {
    useAuthStore.setState({ user: { ...useAuthStore.getState().user!, must_change_password: true } });
    show("/"); expect(await screen.findByText("Cambiar contraseña")).toBeVisible();
  });
});
describe("rutas del dueño", () => {
  beforeEach(() => { vi.mocked(toast).mockClear(); useAuthStore.setState({ hydrated: true, readOnly: false, gym, user: { user_id: "test", full_name: "Persona de prueba", email: "test@example.com", role: "operator", phone: null, has_pin: false } }); });
  function showOwnerOnly(path: string) {
    render(<MemoryRouter initialEntries={[path]}><Routes><Route path="/" element={<p>Inicio</p>} /><Route element={<OwnerOnlyRoute />}><Route path="/reports" element={<p>Reportes</p>} /></Route></Routes></MemoryRouter>);
  }
  it("al operador lo regresa a Inicio y le dice por qué, una sola vez", async () => {
    showOwnerOnly("/reports");
    expect(await screen.findByText("Inicio")).toBeVisible();
    expect(screen.queryByText("Reportes")).not.toBeInTheDocument();
    expect(toast).toHaveBeenCalledTimes(1);
    expect(toast).toHaveBeenCalledWith("Esa sección es sólo del dueño.", { id: "owner-only-route" });
  });
  it("al dueño lo deja pasar sin aviso", () => {
    useAuthStore.setState({ user: { ...useAuthStore.getState().user!, role: "owner" } });
    showOwnerOnly("/reports");
    expect(screen.getByText("Reportes")).toBeVisible();
    expect(toast).not.toHaveBeenCalled();
  });
});
