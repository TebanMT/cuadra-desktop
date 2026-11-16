import { describe, beforeEach, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { openExternalUrl } from "@/lib/openExternal";
import { isTauri } from "@/lib/utils";
import HelpPage from "../HelpPage";

vi.mock("@/lib/openExternal", () => ({ openExternalUrl: vi.fn() }));
vi.mock("@/lib/utils", async () => ({ ...await vi.importActual<typeof import("@/lib/utils")>("@/lib/utils"), isTauri: vi.fn(() => true) }));
beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(isTauri).mockReturnValue(true);
  useAuthStore.setState({ user: { user_id: "u1", role: "owner" } as never });
});

describe("Ayuda de recepción", () => {
  it("la ayuda en contexto (/help#caja) llega con ese tema abierto y enfocado", async () => {
    renderWithProviders(<MemoryRouter initialEntries={["/help#caja"]}><HelpPage /></MemoryRouter>);
    const topic = document.getElementById("caja");
    expect(topic).toHaveAttribute("open");
    await waitFor(() => expect(within(topic as HTMLElement).getByText("Contar y cerrar caja")).toHaveFocus());
    expect(document.getElementById("cobrar")).not.toHaveAttribute("open");
  });

  it("abre solo el canal de soporte, sin incluir datos ni enviar mensajes", async () => {
    vi.mocked(openExternalUrl).mockResolvedValue(true);
    renderWithProviders(<MemoryRouter><HelpPage /></MemoryRouter>);
    const user = userEvent.setup();
    await user.click(screen.getByRole("button", { name: "Abrir WhatsApp de soporte" }));
    expect(openExternalUrl).toHaveBeenCalledWith("https://wa.me/524461057446");
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("ofrece el teléfono y recuperación si no puede abrirse externamente", async () => {
    vi.mocked(openExternalUrl).mockResolvedValue(false);
    renderWithProviders(<MemoryRouter><HelpPage /></MemoryRouter>);
    await userEvent.setup().click(screen.getByRole("button", { name: "Abrir WhatsApp de soporte" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("agrega el número de soporte en tu teléfono");
    expect(screen.getByText("+52 446 105 7446")).toBeVisible();
  });

  it("en navegador usa un enlace real para evitar falsos fallos por noopener", () => {
    vi.mocked(isTauri).mockReturnValue(false);
    renderWithProviders(<MemoryRouter><HelpPage /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "Abrir WhatsApp de soporte" })).toHaveAttribute("href", "https://wa.me/524461057446");
    expect(openExternalUrl).not.toHaveBeenCalled();
  });

  it("al operador le abre con tareas de recepción, sin las del dueño", () => {
    useAuthStore.setState({ user: { user_id: "u2", role: "operator", permissions: [] } as never });
    renderWithProviders(<MemoryRouter><HelpPage /></MemoryRouter>);
    const tasks = within(screen.getByRole("region", { name: "Tareas habituales" }));
    const titles = tasks.getAllByRole("group").map(d => d.querySelector("summary")?.textContent);
    expect(titles[0]).toBe("Buscar un socio y revisar su vigencia");
    expect(titles).not.toContain("Importar una lista de socios");
    expect(titles).not.toContain("Corregir un cobro");
    expect(titles).toContain("Un cobro quedó mal registrado");
  });

  it("lista los atajos de teclado de la app y de la ficha", () => {
    renderWithProviders(<MemoryRouter><HelpPage /></MemoryRouter>);
    const section = within(screen.getByRole("region", { name: "Atajos de teclado" }));
    for (const action of ["Buscar socios y productos", "Cobrar", "Ir a Entradas", "Abrir kiosco", "Venta rápida", "Nuevo socio", "Ir a Inicio", "Cobrar a este socio", "Preparar su entrada y confirmarla", "Editar sus datos"]) {
      expect(section.getByText(action)).toBeInTheDocument();
    }
    expect(section.getByText("Esc")).toBeInTheDocument();
    expect(section.getAllByText("Enter").length).toBeGreaterThan(0);
  });
});
