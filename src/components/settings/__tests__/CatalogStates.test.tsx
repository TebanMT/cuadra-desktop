import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import MembershipTypesPage from "@/pages/settings/MembershipTypes";
import { PromotionsTab } from "../PromotionsTab";
const state = vi.hoisted(() => ({ fail: true }));
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: { get: vi.fn(async (path: string) => {
    if (path.endsWith("charge-settings")) return {};
    if (state.fail) throw new Error("Error ficticio");
    return [];
  }), patch: vi.fn() },
}));
beforeEach(() => { state.fail = true; useAuthStore.setState({ readOnly: false }); });
describe("Estados de catálogos", () => {
  it.each(["membresías", "promociones"])("%s distingue error de vacío y permite recuperarse", async kind => {
    renderWithProviders(<MemoryRouter>{kind === "membresías" ? <MembershipTypesPage /> : <PromotionsTab />}</MemoryRouter>);
    const retry = await screen.findByRole("button", { name: "Reintentar" });
    expect(screen.queryByText(/aún no hay|no hay promociones/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("table")).not.toBeInTheDocument();
    state.fail = false;
    await userEvent.click(retry);
    expect(await screen.findByRole("table")).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });
});
