import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen, fireEvent } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useUIStore } from "@/stores/useUIStore";
import { Sidebar } from "../Sidebar";

vi.mock("@/lib/tauri-bridge", () => ({ getAppVersion: async () => "dev" }));
vi.mock("@/hooks/useAuth", () => ({ useLogout: () => ({ mutate: vi.fn() }) }));
beforeEach(() => useUIStore.setState({ sidebarCollapsed: true }));
afterEach(() => vi.unstubAllGlobals());

describe("Navegación contraída", () => {
  it("reserva espacio con zoom y permite abrir el menú sin modificar la preferencia guardada", async () => {
    const originalMatchMedia = window.matchMedia;
    vi.stubGlobal("matchMedia", (query: string) => ({
      ...originalMatchMedia(query), matches: query === "(max-width: 1023px)",
    }));
    useUIStore.setState({ sidebarCollapsed: false });
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><Sidebar /></MemoryRouter>);
    const sidebar = screen.getByRole("complementary");
    expect(sidebar).toHaveClass("w-[70px]");
    await user.click(screen.getByRole("button", { name: "Fijar navegación" }));
    fireEvent.mouseLeave(sidebar);
    expect(sidebar).toHaveClass("w-[220px]");
    await user.click(screen.getByRole("link", { name: "Socios" }));
    fireEvent.mouseLeave(sidebar);
    expect(sidebar).toHaveClass("w-[70px]");
    expect(useUIStore.getState().sidebarCollapsed).toBe(false);
  });
  it("se contrae al retirar el puntero aunque el enlace pulsado conserve foco", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><Sidebar /></MemoryRouter>);
    const sidebar = screen.getByRole("complementary");
    fireEvent.mouseEnter(sidebar);
    await user.click(screen.getByRole("link", { name: "Socios" }));
    fireEvent.mouseLeave(sidebar);
    expect(sidebar).toHaveClass("w-[70px]");
    expect(screen.getByRole("link", { name: "Socios" })).toHaveFocus();
  });

  it("mantiene etiquetas para teclado hasta que el foco sale", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><Sidebar /><button>Fuera</button></MemoryRouter>);
    const sidebar = screen.getByRole("complementary");
    await user.tab();
    fireEvent.mouseLeave(sidebar);
    expect(sidebar).toHaveClass("w-[220px]");
    await user.click(screen.getByRole("button", { name: "Fuera" }));
    expect(sidebar).toHaveClass("w-[70px]");
  });

  it("fijar conserva la expansión y contraer restaura el comportamiento al salir", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><Sidebar /></MemoryRouter>);
    const sidebar = screen.getByRole("complementary");
    await user.click(screen.getByRole("button", { name: "Fijar navegación" }));
    fireEvent.mouseLeave(sidebar);
    expect(sidebar).toHaveClass("w-[220px]");
    await user.click(screen.getByRole("button", { name: "Contraer navegación" }));
    fireEvent.mouseLeave(sidebar);
    expect(sidebar).toHaveClass("w-[70px]");
  });
});
