import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { TopBar } from "../TopBar";

vi.mock("@/hooks/useAuth", () => ({ useLogout: () => ({ mutate: vi.fn() }) }));
vi.mock("@/hooks/useBiometric", () => ({ useReaderMissing: () => false }));
vi.mock("../SyncIndicator", () => ({ SyncIndicator: () => <button>Estado de sincronización</button> }));
vi.mock("../GlobalSearch", () => ({ GlobalSearch: ({ autoFocus }: { autoFocus?: boolean }) => <input aria-label="Buscar socio" autoFocus={autoFocus} /> }));
const { kiosk, openMember, quickPay } = vi.hoisted(() => ({
  kiosk: vi.fn(),
  openMember: { data: undefined as unknown },
  quickPay: { open: false, inactive: null as unknown },
}));
vi.mock("@/components/billing/QuickPayModal", () => ({ QuickPayModal: ({ open, inactiveOpenMember }: { open: boolean; inactiveOpenMember?: unknown }) => { quickPay.open = open; quickPay.inactive = inactiveOpenMember ?? null; return null; } }));
vi.mock("@/lib/kioskWindow", () => ({ openKioskWindow: kiosk }));
vi.mock("@/hooks/useMembers", () => ({ useMember: () => openMember }));

function Location() { const l = useLocation(); return <output data-testid="route">{l.pathname}{l.search}</output>; }
function mount(route = "/members") {
  return renderWithProviders(<MemoryRouter initialEntries={[route]}><TopBar /><Location /></MemoryRouter>);
}
beforeEach(() => {
  vi.clearAllMocks();
  openMember.data = undefined; quickPay.open = false; quickPay.inactive = null;
  useAuthStore.setState({ readOnly: false });
  localStorage.removeItem("tinta:theme");
  document.documentElement.classList.remove("dark");
});

describe("Herramientas estables de recepción", () => {
  it.each(["/", "/members", "/members/m1", "/checkin", "/sales", "/settings/operators"])("mantiene las acciones visibles en %s", route => {
    mount(route);
    for (const name of ["Buscar", "Cobrar", "Pantallas de entrada", "Ocultar montos", "Cambiar a tema oscuro", "Ayuda para recepción", "Cuenta"]) {
      expect(screen.getByRole("button", { name })).toBeVisible();
    }
  });
  it("permite buscar, cambiar preferencias y abrir ayuda sin entrar a Cuenta", async () => {
    const user = userEvent.setup(); mount();
    await user.click(screen.getByRole("button", { name: "Ocultar montos" }));
    expect(screen.getByRole("button", { name: "Mostrar montos" })).toHaveAttribute("aria-pressed", "true");
    await user.click(screen.getByRole("button", { name: "Mostrar montos" }));
    await user.click(screen.getByRole("button", { name: "Cambiar a tema oscuro" }));
    expect(document.documentElement).toHaveClass("dark");
    await user.click(screen.getByRole("button", { name: "Buscar" }));
    expect(screen.getByRole("dialog")).toHaveAccessibleName("Buscar en Tinta");
    expect(screen.getByRole("textbox", { name: "Buscar socio" })).toHaveFocus();
    await user.keyboard("{Escape}");
    expect(screen.getByRole("button", { name: "Buscar" })).toHaveFocus();
    await user.click(screen.getByRole("button", { name: "Ayuda para recepción" }));
    expect(screen.getByTestId("route")).toHaveTextContent("/help");
  });
  it("conserva búsqueda y preferencias en solo lectura, bloqueando Cobrar", () => {
    useAuthStore.setState({ readOnly: true }); mount("/checkin");
    expect(screen.getByRole("button", { name: "Cobrar" })).toBeDisabled();
    expect(screen.getByRole("button", { name: "Buscar" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Ocultar montos" })).toBeEnabled();
    expect(screen.getByRole("button", { name: "Solo lectura: ver explicación" })).toBeVisible();
  });
  it("aplica el mapa de atajos: C abre Entradas y K el kiosco", async () => {
    const user = userEvent.setup(); mount("/members");
    await user.keyboard("c");
    expect(screen.getByTestId("route")).toHaveTextContent("/checkin");
    expect(kiosk).not.toHaveBeenCalled();
    await user.keyboard("k");
    expect(kiosk).toHaveBeenCalledOnce();
    await user.click(screen.getByRole("button", { name: "Pantallas de entrada" }));
    expect(screen.getByRole("menuitem", { name: /Abrir kiosco · K/ })).toBeInTheDocument();
  });
  it("en la ficha, C es del socio y no navega a Entradas", async () => {
    const user = userEvent.setup(); mount("/members/m1");
    await user.keyboard("c");
    expect(screen.getByTestId("route")).toHaveTextContent("/members/m1");
  });
  it("en la ficha de un socio activo, Cobrar le cobra a ese socio", async () => {
    openMember.data = { member: { id: "m1", full_name: "Ana Ejemplo", status: "active" } };
    const user = userEvent.setup(); mount("/members/m1");
    const cobrar = screen.getByRole("button", { name: "Cobrar" });
    expect(cobrar).toHaveAttribute("title", "Cobrar a Ana Ejemplo (P)");
    await user.click(cobrar);
    expect(screen.getByTestId("route")).toHaveTextContent("/members/m1?action=pay");
    expect(quickPay.open).toBe(false);
  });
  it("en la ficha de un socio inactivo, Cobrar pide otro socio y explica por qué", async () => {
    openMember.data = { member: { id: "m1", full_name: "Ana Ejemplo", status: "inactive" } };
    const user = userEvent.setup(); mount("/members/m1");
    await user.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/members\/m1$/);
    expect(quickPay.open).toBe(true);
    expect(quickPay.inactive).toEqual(expect.objectContaining({ full_name: "Ana Ejemplo" }));
  });
  it("Cobrar es un primario suave: visible sin competir con el botón relleno de la página", () => {
    mount("/");
    const cobrar = screen.getByRole("button", { name: "Cobrar" });
    expect(cobrar).toHaveClass("bg-primary-soft", "text-primary", "border-primary/20");
    expect(cobrar).not.toHaveClass("bg-primary");
  });
  it("fuera de la ficha, Cobrar abre el selector de socio", async () => {
    const user = userEvent.setup(); mount("/");
    await user.click(screen.getByRole("button", { name: "Cobrar" }));
    expect(quickPay.open).toBe(true);
    expect(quickPay.inactive).toBeNull();
  });
});
