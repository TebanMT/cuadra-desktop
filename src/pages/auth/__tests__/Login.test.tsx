import { describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import Login from "../Login";

vi.mock("@/hooks/useAuth", () => ({
  useOperatorsForLogin: () => ({ data: [{ user_id: "demo", full_name: "Ana Ejemplo", role: "operator", has_pin: true }], isLoading: false, isError: false }),
  useLoginPIN: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), api: { get: vi.fn(async () => ({ paired: true })) } }));

describe("Acceso por PIN", () => {
  it("Escape y Cancelar devuelven el foco al operador que abrió el diálogo", async () => {
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><Login /></MemoryRouter>);
    const operator = await screen.findByRole("button", { name: "Ana Ejemplo" });
    await user.click(operator);
    await user.keyboard("{Escape}");
    await waitFor(() => expect(operator).toHaveFocus());
    await user.keyboard("{Enter}");
    expect(screen.getByRole("dialog")).toBeVisible();
    await user.click(screen.getByRole("button", { name: /Cancelar/ }));
    await waitFor(() => expect(operator).toHaveFocus());
  });
});
