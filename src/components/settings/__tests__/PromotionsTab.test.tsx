import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { PromotionsTab } from "../PromotionsTab";

// Mock del api para devolver una promo vigente + capturar mutaciones.
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  const promos = [
    {
      id: "p1",
      name: "Verano 25",
      kind: "percent",
      value: 25,
      buy_n: 1,
      companion_count: null,
      applies_to: "membership",
      code: "VERANO2026",
      valid_from: null,
      valid_until: null,
      max_uses_total: null,
      max_uses_per_member: null,
      active: true,
    },
  ];
  return {
    ...actual,
    api: {
      get: vi.fn(async (path: string) => {
        if (path.includes("/promotions")) return promos;
        return null;
      }),
      post: vi.fn(async () => ({ id: "p-new" })),
      patch: vi.fn(async () => ({})),
      put: vi.fn(),
      delete: vi.fn(async () => ({})),
      blob: vi.fn(),
    },
  };
});

describe("PromotionsTab", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("lista las promociones vigentes", async () => {
    renderWithProviders(<PromotionsTab />);
    await waitFor(() => expect(screen.getByText("Verano 25")).toBeInTheDocument());
    // El badge de estado debe mostrar "Vigente".
    expect(screen.getByText("Vigente")).toBeInTheDocument();
    // El código se muestra en mayúsculas mono.
    expect(screen.getByText("VERANO2026")).toBeInTheDocument();
  });

  it("muestra el botón nueva promoción", async () => {
    renderWithProviders(<PromotionsTab />);
    expect(screen.getByRole("button", { name: /nueva promoción/i })).toBeInTheDocument();
  });

  it("abre el form al hacer click en nueva promoción", async () => {
    const user = userEvent.setup();
    renderWithProviders(<PromotionsTab />);
    await user.click(screen.getByRole("button", { name: /nueva promoción/i }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toBeInTheDocument();
    // El form expone el label "Nombre" — confirma que el form está montado.
    expect(screen.getByLabelText(/^nombre/i)).toBeInTheDocument();
  });
});
