import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { MemberAssociator } from "../MemberAssociator";

// Combobox inline del modal de cobro (antes Popover flotante). Fija el
// contrato de teclado: escribir → Enter asocia el PRIMER resultado (el
// resaltado), Esc colapsa la búsqueda sin tocar nada más.

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(async () => ({
        items: [
          { member: { id: "m1", full_name: "Rosa Robles", phone: "+525511122233" } },
          { member: { id: "m2", full_name: "Rosario Pérez", phone: "+525599887766" } },
        ],
      })),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      blob: vi.fn(),
    },
  };
});

describe("MemberAssociator (inline)", () => {
  beforeEach(() => vi.clearAllMocks());

  it("expande, busca y Enter asocia el primer resultado", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<MemberAssociator member={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Asociar a socio/i }));
    const input = screen.getByPlaceholderText(/Buscar por nombre o teléfono/i);
    await user.type(input, "Ro");

    // El debounce (300ms) dispara el fetch; espera a que la lista pinte.
    expect(await screen.findByText("Rosa Robles")).toBeInTheDocument();

    await user.keyboard("{Enter}");
    await waitFor(() =>
      expect(onChange).toHaveBeenCalledWith(
        expect.objectContaining({ member_id: "m1", full_name: "Rosa Robles" })
      )
    );
  });

  it("Esc colapsa la búsqueda sin asociar", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(<MemberAssociator member={null} onChange={onChange} />);

    await user.click(screen.getByRole("button", { name: /Asociar a socio/i }));
    await user.type(screen.getByPlaceholderText(/Buscar por nombre o teléfono/i), "Ro");
    await user.keyboard("{Escape}");

    expect(onChange).not.toHaveBeenCalled();
    // Colapsado: el botón de asociar regresa.
    expect(screen.getByRole("button", { name: /Asociar a socio/i })).toBeInTheDocument();
  });

  it("con socio asociado muestra la pastilla y Quitar la limpia", async () => {
    const user = userEvent.setup();
    const onChange = vi.fn();
    renderWithProviders(
      <MemberAssociator
        member={{ member_id: "m1", full_name: "Rosa Robles", phone: "+525511122233" }}
        onChange={onChange}
      />
    );
    expect(screen.getByText("Rosa Robles")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Quitar/i }));
    expect(onChange).toHaveBeenCalledWith(null);
  });
});
