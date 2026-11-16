import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, useLocation } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { QuickPayModal } from "../QuickPayModal";

const { search, toastInfo } = vi.hoisted(() => ({ search: { data: [] as unknown[], isError: false, isFetching: false, refetch: vi.fn() }, toastInfo: vi.fn() }));
vi.mock("@/hooks/useSales", () => ({ useMemberSearch: () => search }));
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: (value: string) => value }));
vi.mock("sonner", () => ({ toast: { info: toastInfo } }));

function Route() { const l = useLocation(); return <output data-testid="route">{l.pathname}{l.search}</output>; }
function mount(props: Partial<Parameters<typeof QuickPayModal>[0]> = {}) {
  const close = vi.fn();
  renderWithProviders(<MemoryRouter><QuickPayModal open onOpenChange={close} {...props} /><Route /></MemoryRouter>);
  return close;
}

beforeEach(() => { vi.clearAllMocks(); search.data = []; });

describe("¿A quién le vas a cobrar?", () => {
  it("distingue homónimos y abre el cobro del elegido", async () => {
    search.data = [
      { member_id: "a", full_name: "Ana Ejemplo", phone: "5500000001", member_number: 4101, status: "active", access_status: "denied_expired", current_membership: { expiry_date: "2026-10-01" } },
      { member_id: "b", full_name: "Ana Ejemplo", phone: "5500000002", member_number: 4102, status: "active", access_status: "allowed_active", current_membership: { expiry_date: "2099-01-01" } },
    ];
    const user = userEvent.setup(); const close = mount();
    await user.type(screen.getByRole("combobox"), "Ana");
    const options = screen.getAllByRole("option");
    expect(options[0]).toHaveTextContent("Nº 4101");
    expect(options[0]).toHaveTextContent("Vencido");
    expect(options[1]).toHaveTextContent("Nº 4102");
    await user.click(options[0]);
    expect(close).toHaveBeenCalledWith(false);
    expect(screen.getByTestId("route")).toHaveTextContent("/members/a?action=pay");
  });

  it("un socio inactivo lleva a su ficha con la explicación, no a un cobro que no abre", async () => {
    search.data = [{ member_id: "c", full_name: "Ana Ejemplo", phone: "", status: "inactive", access_status: "denied_inactive" }];
    const user = userEvent.setup(); mount();
    await user.type(screen.getByRole("combobox"), "Ana");
    await user.click(screen.getByRole("option"));
    expect(screen.getByTestId("route")).toHaveTextContent(/^\/members\/c$/);
    expect(toastInfo).toHaveBeenCalledWith(expect.stringMatching(/inactivo/));
  });

  it("explica por qué no cobra al socio abierto si está inactivo", () => {
    mount({ inactiveOpenMember: { full_name: "Ana Ejemplo" } });
    expect(screen.getByRole("note")).toHaveTextContent("Ana Ejemplo (socio abierto) está inactivo. Reactívalo en su ficha para cobrarle.");
  });
});
