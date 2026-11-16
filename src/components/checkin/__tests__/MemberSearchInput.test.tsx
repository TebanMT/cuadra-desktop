import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { MemberSearchInput } from "../MemberSearchInput";
const { result } = vi.hoisted(() => ({ result: { data: undefined as unknown, isError: false, isFetching: false, refetch: vi.fn() } }));
vi.mock("@/hooks/useSales", () => ({ useMemberSearch: () => result }));
vi.mock("@/hooks/useDebounce", () => ({ useDebounce: (value: string) => value }));
beforeEach(() => { result.data = undefined; result.isError = false; result.isFetching = false; vi.clearAllMocks(); });
describe("Búsqueda de recepción", () => {
  it("distingue fallo de vacío y permite reintentar", async () => {
    result.isError = true;
    const user = userEvent.setup();
    renderWithProviders(<MemberSearchInput onSelect={vi.fn()} />);
    await user.type(screen.getByRole("combobox"), "Ana");
    expect(screen.getByText(/No pudimos buscar socios/)).toBeVisible();
    expect(screen.queryByText(/No encontramos/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Reintentar búsqueda" }));
    expect(result.refetch).toHaveBeenCalledOnce();
  });
  it("permite seleccionar con flechas y Enter y limpia los resultados", async () => {
    const member = { member_id: "demo", full_name: "Ana Ejemplo", phone: "5500000000" };
    result.data = [member];
    const select = vi.fn(); const user = userEvent.setup();
    renderWithProviders(<MemberSearchInput onSelect={select} />);
    const input = screen.getByRole("combobox");
    await user.type(input, "Ana"); await user.keyboard("{ArrowDown}{Enter}");
    expect(select).toHaveBeenCalledWith(member);
    expect(input).toHaveValue(""); expect(input).toHaveAttribute("aria-expanded", "false");
  });
  it("primer Escape cierra sugerencias y segundo cierra el diálogo", async () => {
    result.data = [{ member_id: "demo", full_name: "Ana", phone: "" }];
    const close = vi.fn(); const user = userEvent.setup();
    renderWithProviders(<Dialog open onOpenChange={close}><DialogContent><DialogTitle>Buscar socio</DialogTitle><MemberSearchInput onSelect={vi.fn()} /></DialogContent></Dialog>);
    await user.type(screen.getByRole("combobox"), "Ana");
    await user.keyboard("{Escape}");
    expect(close).not.toHaveBeenCalled();
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument();
    await user.keyboard("{Escape}"); expect(close).toHaveBeenCalledWith(false);
  });
  it("ArrowUp inicia en el último resultado", async () => {
    const members = [{ member_id: "1", full_name: "Ana Uno", phone: "" }, { member_id: "2", full_name: "Ana Dos", phone: "" }];
    result.data = members; const select = vi.fn(); const user = userEvent.setup();
    renderWithProviders(<MemberSearchInput onSelect={select} />);
    await user.type(screen.getByRole("combobox"), "Ana"); await user.keyboard("{ArrowUp}{Enter}");
    expect(select).toHaveBeenCalledWith(members[1]);
  });
  it("Escape cierra las sugerencias sin seleccionar", async () => {
    result.data = [{ member_id: "demo", full_name: "Ana", phone: "" }];
    const select = vi.fn(); const user = userEvent.setup();
    renderWithProviders(<MemberSearchInput onSelect={select} />);
    await user.type(screen.getByRole("combobox"), "Ana"); await user.keyboard("{Escape}");
    expect(screen.queryByRole("listbox")).not.toBeInTheDocument(); expect(select).not.toHaveBeenCalled();
  });
  it("cada resultado trae número de socio y vigencia para no confundir homónimos", async () => {
    result.data = [
      { member_id: "1", full_name: "Ana Ejemplo", phone: "5500000001", member_number: 3101, access_status: "allowed_expiring_soon", current_membership: { expiry_date: null } },
      { member_id: "2", full_name: "Ana Ejemplo", phone: "", member_number: 3102, access_status: "denied_unpaid_enrollment" },
    ];
    const user = userEvent.setup();
    renderWithProviders(<MemberSearchInput onSelect={vi.fn()} />);
    await user.type(screen.getByRole("combobox"), "Ana");
    const [first, second] = screen.getAllByRole("option");
    expect(first).toHaveTextContent("Nº 3101 · 5500000001");
    expect(first).toHaveTextContent("Por vencer");
    expect(second).toHaveTextContent("Nº 3102 · Sin teléfono");
    expect(second).toHaveTextContent("Sin primer pago");
    await user.keyboard("{ArrowDown}");
    expect(first).toHaveAttribute("aria-selected", "true");
    expect(first).toHaveClass("bg-accent", "ring-1", "ring-ring");
  });
});
