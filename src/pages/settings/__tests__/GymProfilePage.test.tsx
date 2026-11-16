import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { ApiError } from "@/lib/api";
import { timezoneName } from "@/strings/settings";
import GymProfilePage from "../GymProfilePage";

const { mockGet, mockPatch } = vi.hoisted(() => ({ mockGet: vi.fn(), mockPatch: vi.fn() }));
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: { get: mockGet, post: vi.fn(), patch: mockPatch, put: vi.fn(), delete: vi.fn() },
}));

// Datos ficticios.
const profile = {
  id: "g1",
  name: "Gimnasio Ejemplo",
  city: "Querétaro",
  whatsapp_number: "+525512345678",
  timezone: "America/Merida",
  rfc: null,
  legal_name: null,
  postal_code: null,
  tax_regime: null,
  logo_url: null,
  primary_color: null,
  secondary_color: null,
  open_time: "06:00",
  close_time: "22:00",
  kiosk_volume: 80,
  kiosk_feedback_ttl_ms: 4000,
  access_webhook_url: null,
  access_webhook_secret_set: false,
  setup_completed: true,
};
const setupStatus = {
  current_step: 5,
  setup_completed: true,
  gym_name: "Gimnasio Ejemplo",
  city: null,
  whatsapp: null,
  membership_types_count: 1,
  payment_methods: { cash: true, transfer: false, card: false },
};

function renderPage() {
  return renderWithProviders(<MemoryRouter><GymProfilePage /></MemoryRouter>);
}

beforeEach(() => {
  mockGet.mockReset();
  mockPatch.mockReset();
  mockGet.mockImplementation(async (path: string) =>
    path === "/api/v1/gyms/me/setup-status" ? setupStatus : profile,
  );
  mockPatch.mockImplementation(async (path: string) => (path === "/api/v1/gyms/me" ? profile : {}));
  useAuthStore.setState({ readOnly: false, gym: null, user: { user_id: "u1", role: "owner" } as never });
});

describe("Datos del gym", () => {
  it("nombra las zonas horarias por ciudad, con acentos, sin cambiar el identificador", () => {
    expect(timezoneName("America/Mexico_City")).toBe("Ciudad de México");
    expect(timezoneName("America/Merida")).toBe("Mérida");
    expect(timezoneName("America/Bahia_Banderas")).toBe("Bahía de Banderas");
    expect(timezoneName("America/Bogota")).toBe("Bogota");
  });

  it("muestra la duración del aviso sin decimales de sobra y un solo botón de guardar", async () => {
    renderPage();
    expect(await screen.findByText("4 segundos")).toBeInTheDocument();
    expect(screen.getAllByRole("button", { name: /guardar/i })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Volver a Configuración" })).toHaveAttribute("href", "/settings");
  });

  it("guarda datos y métodos de pago con el mismo botón", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Efectivo" })).toBeChecked());
    await user.click(screen.getByRole("checkbox", { name: "Tarjeta" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    await waitFor(() =>
      expect(mockPatch).toHaveBeenCalledWith("/api/v1/gyms/me/payment-methods", { methods: ["cash", "card"] }),
    );
    expect(mockPatch).toHaveBeenCalledWith(
      "/api/v1/gyms/me",
      expect.objectContaining({ name: "Gimnasio Ejemplo", timezone: "America/Merida" }),
    );
  });

  it("no envía nada si se quitan todos los métodos de pago", async () => {
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Efectivo" })).toBeChecked());
    await user.click(screen.getByRole("checkbox", { name: "Efectivo" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(screen.getByText("Elige al menos un método de pago.")).toBeInTheDocument();
    expect(mockPatch).not.toHaveBeenCalled();
  });

  it("dice qué faltó si los datos se guardaron pero los métodos no", async () => {
    mockPatch.mockImplementation(async (path: string) => {
      if (path === "/api/v1/gyms/me") return profile;
      throw new ApiError(422, "business_error", "Tu prueba terminó.");
    });
    const user = userEvent.setup();
    renderPage();
    await waitFor(() => expect(screen.getByRole("checkbox", { name: "Efectivo" })).toBeChecked());
    await user.click(screen.getByRole("checkbox", { name: "Transferencia" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));

    expect(
      await screen.findByText("Se guardaron los datos del gym, pero no los métodos de pago: Tu prueba terminó. Vuelve a guardar."),
    ).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "Transferencia" })).toBeChecked();
  });

  it("al operador le muestra los valores como texto y quién puede cambiarlos", async () => {
    useAuthStore.setState({ user: { user_id: "u2", role: "operator", permissions: [] } as never });
    renderPage();

    expect(await screen.findByText("Gimnasio Ejemplo")).toBeInTheDocument();
    expect(screen.getByText("Mérida")).toBeInTheDocument();
    expect(screen.getByText("06:00 a 22:00")).toBeInTheDocument();
    expect(await screen.findByText("Efectivo")).toBeInTheDocument();
    expect(screen.getByRole("note")).toHaveTextContent("Solo el dueño puede cambiar estos datos.");
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();
  });
});
