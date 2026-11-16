import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import TemplatesPage from "../TemplatesPage";
import AlertsPage from "../AlertsPage";

const channel = vi.hoisted(() => ({ connected: false }));
vi.mock("@/hooks/useNotifications", async (original) => ({
  ...await original<typeof import("@/hooks/useNotifications")>(),
  useWhatsappState: () => ({ data: { status: channel.connected ? "connected" : "not_connected" } }),
  useTemplates: () => ({ data: { items: [{ key: "receipt_membership", body: "Texto personalizado anterior", default_body: "Texto aprobado de Tinta", enabled: true, variables: [] }] } }),
  useAlerts: () => ({ data: { items: [{ key: "low_stock", body: "Texto personalizado anterior", default_body: "Texto aprobado de Tinta", enabled: true, variables: [] }] } }),
  useUpdateTemplate: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useUpdateAlert: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

beforeEach(() => { channel.connected = false; });
describe("Vista previa según el canal de envío", () => {
  it.each([TemplatesPage, AlertsPage])("muestra el texto aprobado al desconectar el número propio (%#)", (Page) => {
    renderWithProviders(<MemoryRouter><Page /></MemoryRouter>);
    expect(screen.getByText("Texto aprobado de Tinta")).toBeInTheDocument();
    expect(screen.queryByText("Texto personalizado anterior")).not.toBeInTheDocument();
    expect(screen.queryByText("Personalizada")).not.toBeInTheDocument();
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  });
  it("conserva la plantilla personalizada y su edición con número propio conectado", () => {
    channel.connected = true;
    renderWithProviders(<MemoryRouter><TemplatesPage /></MemoryRouter>);
    expect(screen.getByText("Texto personalizado anterior")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /editar/i })).toBeInTheDocument();
    expect(screen.getByText("Personalizada")).toBeInTheDocument();
  });
  it("conserva el editor y la indicación de alerta personalizada con número propio", () => {
    channel.connected = true;
    renderWithProviders(<MemoryRouter><AlertsPage /></MemoryRouter>);
    expect(screen.getByRole("textbox")).toHaveValue("Texto personalizado anterior");
    expect(screen.getByText("Personalizada")).toBeInTheDocument();
  });
});
