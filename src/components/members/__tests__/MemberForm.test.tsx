import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { MemberForm } from "../MemberForm";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      // Path-aware: la búsqueda de duplicados por nombre (MemberMatches,
      // debounce 300ms) también pega api.get — si le devolvemos el array
      // de planes renderiza Links sin Router y el test truena según el
      // timing. Miembros → lista vacía; todo lo demás → los planes.
      get: vi.fn(async (path: string) => {
        // OJO: "/membership-types" también contiene "/members" — el match
        // debe ser del endpoint exacto (con ? o fin de string).
        if (typeof path === "string" && /\/members(\?|$)/.test(path)) {
          return { items: [], total: 0, page: 1, page_size: 20 };
        }
        return [
          {
            id: "p1",
            name: "Mensual",
            price: 500,
            duration_days: 30,
            enrollment_fee: 0,
            maintenance_fee: 0,
            active: true,
          },
        ];
      }),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("MemberForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flags missing name on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <MemberForm
        mode="create"
        submitting={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /inscribir socio/i }));

    expect(await screen.findByText(/el nombre debe tener entre 3 y 100/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("flags invalid phone (less than 10 digits)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <MemberForm
        mode="create"
        submitting={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    );

    await user.type(screen.getByLabelText(/nombre completo/i), "Juan Pérez");
    // /^teléfono/ y no /teléfono/: el label del check "Sin teléfono"
    // también contiene la palabra y el matcher laxo daría ambigüedad.
    await user.type(screen.getByLabelText(/^teléfono/i), "12345");
    await user.click(screen.getByRole("button", { name: /inscribir socio/i }));

    expect(await screen.findByText(/necesito 10 dígitos/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("permite alta sin teléfono SOLO con el check explícito", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <MemberForm
        mode="create"
        submitting={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    );

    await user.type(screen.getByLabelText(/nombre completo/i), "Juan Pérez");

    // Sin el check, teléfono vacío rebota.
    await user.click(screen.getByRole("button", { name: /inscribir socio/i }));
    expect(await screen.findByText(/necesito 10 dígitos/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();

    // Con el check: el input se deshabilita y el submit sale con
    // no_phone=true + phone="".
    await user.click(screen.getByLabelText(/sin teléfono/i));
    expect(screen.getByLabelText(/^teléfono/i)).toBeDisabled();
    expect(screen.getByText(/no recibirá avisos por whatsapp/i)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /inscribir socio/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const payload = onSubmit.mock.calls[0][0];
    expect(payload.values.no_phone).toBe(true);
    expect(payload.values.phone).toBe("");
  });

  it("el check limpia un número ya tecleado", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <MemberForm
        mode="create"
        submitting={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    );

    await user.type(screen.getByLabelText(/nombre completo/i), "Juan Pérez");
    await user.type(screen.getByLabelText(/^teléfono/i), "4421234567");
    await user.click(screen.getByLabelText(/sin teléfono/i));

    await user.click(screen.getByRole("button", { name: /inscribir socio/i }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    expect(onSubmit.mock.calls[0][0].values.phone).toBe("");
  });
});
