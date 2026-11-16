import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { ApiError, api } from "@/lib/api";
import type { Operator } from "@/hooks/useOperators";
import { OperatorCreateModal } from "../OperatorCreateModal";
import { OperatorEditModal } from "../OperatorEditModal";

vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: { get: vi.fn(async () => ({ items: [] })), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

const operator: Operator = {
  id: "op-1", gym_id: "g1", email: "", full_name: "Rosa Pérez", phone: "+525512345678", role: "operator",
  active: true, must_change_password: false, has_pin: true, last_login_at: null, created_at: "2026-11-01T00:00:00Z",
  permissions: ["credit"],
};

beforeEach(() => {
  vi.clearAllMocks();
  vi.mocked(api.get).mockResolvedValue({ items: [] });
  useAuthStore.setState({ readOnly: false, gym: null, user: { user_id: "owner", role: "owner" } as never });
});

const created = { full_name: "Rosa Pérez", phone: "+525512345678", pin: "1234", whatsapp_delivery: false };

async function fillIdentity(user: ReturnType<typeof userEvent.setup>) {
  await user.type(screen.getByLabelText("Nombre completo"), "Rosa Pérez");
  await user.type(screen.getByLabelText("Teléfono"), "5512345678");
}

describe("Permisos al crear un operador", () => {
  it("empieza sin permisos y los manda vacíos", async () => {
    vi.mocked(api.post).mockResolvedValue({ full_name: "Rosa Pérez", phone: "+525512345678", pin: "1234", whatsapp_delivery: false });
    const user = userEvent.setup();
    renderWithProviders(<OperatorCreateModal open onOpenChange={vi.fn()} />);
    expect(screen.getAllByRole("switch")).toHaveLength(8);
    expect(screen.getByRole("switch", { name: "Ver totales de dinero" })).toBeInTheDocument();
    for (const s of screen.getAllByRole("switch")) expect(s).not.toBeChecked();
    await user.type(screen.getByLabelText("Nombre completo"), "Rosa Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");
    await user.click(screen.getByRole("button", { name: "Crear operador" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/users", expect.objectContaining({ permissions: [] })));
  });

  it("manda los permisos que el dueño activó", async () => {
    vi.mocked(api.post).mockResolvedValue({ full_name: "Rosa Pérez", phone: "+525512345678", pin: "1234", whatsapp_delivery: false });
    const user = userEvent.setup();
    renderWithProviders(<OperatorCreateModal open onOpenChange={vi.fn()} />);
    await user.type(screen.getByLabelText("Nombre completo"), "Rosa Pérez");
    await user.type(screen.getByLabelText("Teléfono"), "5512345678");
    await user.click(screen.getByRole("switch", { name: "Dejar pasar vencidos" }));
    await user.click(screen.getByRole("switch", { name: "Ver totales de dinero" }));
    await user.click(screen.getByRole("switch", { name: "Fiar" }));
    await user.click(screen.getByRole("button", { name: "Crear operador" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/users", expect.objectContaining({ permissions: ["credit", "view_totals", "checkin_override"] })));
  });
});

describe("Asignar permisos se escanea rápido", () => {
  it("agrupa los permisos, dice lo que siempre puede hacer y resume lo elegido", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperatorCreateModal open onOpenChange={vi.fn()} />);
    const money = screen.getByRole("group", { name: "Dinero" });
    expect(within(money).getAllByRole("switch").map((s) => s.getAttribute("id")?.split("-").pop()))
      .toEqual(["discounts", "credit", "cash_out", "view_totals"]);
    expect(within(screen.getByRole("group", { name: "Socios" })).getAllByRole("switch")).toHaveLength(2);
    expect(within(screen.getByRole("group", { name: "Productos" })).getAllByRole("switch")).toHaveLength(2);
    expect(screen.getByText(/Siempre puede cobrar membresías completas, registrar entradas/)).toBeInTheDocument();
    expect(screen.getByText("lo básico de recepción")).toBeInTheDocument();
    await user.click(screen.getByRole("switch", { name: "Fiar" }));
    expect(screen.getByText("lo básico de recepción y 1 permiso más")).toBeInTheDocument();
  });

  it("activa y quita todos de una vez, y el alta los manda en el orden del catálogo", async () => {
    vi.mocked(api.post).mockResolvedValue(created);
    const user = userEvent.setup();
    renderWithProviders(<OperatorCreateModal open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Activar todos" }));
    for (const s of screen.getAllByRole("switch")) expect(s).toBeChecked();
    expect(screen.getByText("lo básico y los 8 permisos")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Quitar todos" }));
    for (const s of screen.getAllByRole("switch")) expect(s).not.toBeChecked();
    await user.click(screen.getByRole("button", { name: "Activar todos" }));
    await fillIdentity(user);
    await user.click(screen.getByRole("button", { name: "Crear operador" }));
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/users", expect.objectContaining({
      permissions: ["discounts", "credit", "cash_out", "view_totals", "checkin_override", "products", "inventory", "member_status"],
    })));
  });

  it("marca el campo con error y lo enfoca, sin mandar nada", async () => {
    const user = userEvent.setup();
    renderWithProviders(<OperatorCreateModal open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Activar todos" }));
    await user.click(screen.getByRole("button", { name: "Crear operador" }));
    const name = screen.getByLabelText("Nombre completo");
    expect(name).toHaveFocus();
    expect(name).toHaveAccessibleDescription("Mínimo 3 caracteres.");
    expect(api.post).not.toHaveBeenCalled();
    await user.type(name, "Rosa");
    expect(screen.queryByText("Mínimo 3 caracteres.")).not.toBeInTheDocument();
  });

  it("pone el teléfono repetido junto a su campo", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(422, "business_error", "ese teléfono ya está registrado en este gimnasio"));
    const user = userEvent.setup();
    renderWithProviders(<OperatorCreateModal open onOpenChange={vi.fn()} />);
    await fillIdentity(user);
    await user.click(screen.getByRole("button", { name: "Crear operador" }));
    expect(await screen.findByText("Ese teléfono ya está registrado en este gimnasio.")).toBeInTheDocument();
    expect(screen.getByLabelText("Teléfono")).toHaveFocus();
  });
});

describe("Cupo de operadores al crear", () => {
  // Datos ficticios.
  const active = (id: string) => ({ ...operator, id, full_name: `Persona ${id}`, active: true });

  it("dice qué lugar ocupará antes de pedir datos", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [active("a"), active("b")] });
    useAuthStore.setState({ gym: { subscription_plan: "plus_monthly" } as never });
    renderWithProviders(<OperatorCreateModal open onOpenChange={vi.fn()} />);
    expect(await screen.findByText("Ocupará 1 de los 8 lugares libres para operadores activos.")).toBeInTheDocument();
  });

  it("con el cupo lleno no muestra el formulario y explica cómo liberar un lugar", async () => {
    vi.mocked(api.get).mockResolvedValue({ items: [active("a")] });
    const onOpenChange = vi.fn();
    const user = userEvent.setup();
    renderWithProviders(<OperatorCreateModal open onOpenChange={onOpenChange} />);
    expect(await screen.findByRole("heading", { name: "No hay lugar para otro operador" })).toBeInTheDocument();
    expect(screen.getByText(/Esta instalación tiene habilitado 1 operador activo\. Para dar acceso a otra persona, desactiva/)).toBeInTheDocument();
    expect(screen.queryByLabelText("Nombre completo")).not.toBeInTheDocument();
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Entendido" }));
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("si el servidor rechaza por cupo, lo explica sin ofrecer otro plan", async () => {
    vi.mocked(api.post).mockRejectedValue(new ApiError(
      422, "business_error", "tu plan Standard incluye 1 operador activo. Desactiva al actual o mejora a Plus para agregar más",
    ));
    const user = userEvent.setup();
    renderWithProviders(<OperatorCreateModal open onOpenChange={vi.fn()} />);
    await fillIdentity(user);
    await user.click(screen.getByRole("button", { name: "Crear operador" }));
    expect(await screen.findByRole("heading", { name: "No hay lugar para otro operador" })).toBeInTheDocument();
    expect(screen.queryByText(/mejora a Plus/)).not.toBeInTheDocument();
  });
});

describe("Permisos al editar un operador", () => {
  it("muestra los actuales y manda la lista cambiada", async () => {
    vi.mocked(api.patch).mockResolvedValue({ ...operator, permissions: ["discounts"] });
    const user = userEvent.setup();
    renderWithProviders(<OperatorEditModal operator={operator} open onOpenChange={vi.fn()} />);
    expect(screen.getByRole("switch", { name: "Fiar" })).toBeChecked();
    await user.click(screen.getByRole("switch", { name: "Fiar" }));
    await user.click(screen.getByRole("switch", { name: "Descuentos y montos" }));
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalledWith("/api/v1/users/op-1", expect.objectContaining({ permissions: ["discounts"] })));
  });

  it("no toca los permisos si el servidor no los mandó y el dueño no los cambió", async () => {
    vi.mocked(api.patch).mockResolvedValue(operator);
    const user = userEvent.setup();
    renderWithProviders(<OperatorEditModal operator={{ ...operator, permissions: undefined }} open onOpenChange={vi.fn()} />);
    await user.click(screen.getByRole("button", { name: "Guardar cambios" }));
    await waitFor(() => expect(api.patch).toHaveBeenCalled());
    expect(vi.mocked(api.patch).mock.calls[0][1]).not.toHaveProperty("permissions");
  });

  it("no muestra permisos para el dueño", () => {
    renderWithProviders(<OperatorEditModal operator={{ ...operator, role: "owner" }} open onOpenChange={vi.fn()} />);
    expect(screen.queryByRole("switch")).not.toBeInTheDocument();
  });
});
