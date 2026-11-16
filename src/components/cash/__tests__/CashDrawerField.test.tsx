import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
  loading: false, error: false, retry: vi.fn(),
  drawers: [] as Array<{
    id: string;
    code: string;
    name: string;
    active: boolean;
    is_main: boolean;
    version: number;
  }>,
}));

vi.mock("@/hooks/useCashDrawers", () => ({
  useCashDrawers: () => ({ data: state.drawers, isLoading: state.loading, isError: state.error, refetch: state.retry }),
}));

import { useAuthStore, type AuthGym } from "@/stores/useAuthStore";
import { CashDrawerField } from "../CashDrawerField";

describe("CashDrawerField", () => {
  beforeEach(() => {
    state.drawers = []; state.loading = false; state.error = false; state.retry.mockClear();
  });

  it("mantiene invisible la complejidad para un gym con una caja", async () => {
    state.drawers = [
      { id: "main", code: "main", name: "Caja principal", active: true, is_main: true, version: 1 },
    ];
    const onChange = vi.fn();
    const { container } = render(<CashDrawerField onChange={onChange} />);

    expect(container).toBeEmptyDOMElement();
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("main"));
  });

  it("muestra nombres humanos cuando existen varias cajas", () => {
    state.drawers = [
      { id: "main", code: "main", name: "Caja principal", active: true, is_main: true, version: 1 },
      { id: "north", code: "north", name: "Recepción norte", active: true, is_main: false, version: 1 },
    ];
    render(<CashDrawerField value="main" onChange={vi.fn()} />);

    fireEvent.click(screen.getByRole("combobox", { name: "Caja física" }));
    expect(screen.getByRole("option", { name: "Caja principal" })).toBeInTheDocument();
    expect(screen.getByRole("option", { name: "Recepción norte" })).toBeInTheDocument();
  });
});

describe("CashDrawerField sin catálogo", () => {
  const gym = { gym_id: "gym-1" } as AuthGym;
  const main = { id: "main", code: "main", name: "Principal", active: true, is_main: true, version: 1 };
  const north = { id: "north", code: "north", name: "Recepción norte", active: true, is_main: false, version: 1 };

  beforeEach(() => {
    state.drawers = []; state.loading = false; state.error = false; state.retry.mockClear();
    localStorage.clear();
    useAuthStore.setState({ gym });
  });

  it("un gym de una caja cobra en la caja principal aunque el catálogo tarde o falle", () => {
    const ready = vi.fn(); const onChange = vi.fn(); state.loading = true;
    const { container, rerender } = render(<CashDrawerField onChange={onChange} onReadyChange={ready} />);
    expect(container).toBeEmptyDOMElement();
    expect(ready).toHaveBeenLastCalledWith(true);

    state.loading = false; state.error = true;
    rerender(<CashDrawerField onChange={onChange} onReadyChange={ready} />);
    expect(container).toBeEmptyDOMElement();
    expect(ready).toHaveBeenLastCalledWith(true);
    // Sin caja elegida el backend usa la principal.
    expect(onChange).not.toHaveBeenCalled();
  });

  it("si ya se sabe que hay varias cajas, espera el catálogo y permite reintentar", () => {
    state.drawers = [main, north];
    const first = render(<CashDrawerField value="main" onChange={vi.fn()} />);
    first.unmount();

    const ready = vi.fn(); state.drawers = []; state.loading = true;
    const { rerender } = render(<CashDrawerField onChange={vi.fn()} onReadyChange={ready} />);
    expect(screen.getByRole("status")).toHaveTextContent("Confirmando cajas");
    expect(ready).toHaveBeenLastCalledWith(false);

    state.loading = false; state.error = true;
    rerender(<CashDrawerField onChange={vi.fn()} onReadyChange={ready} />);
    fireEvent.click(screen.getByRole("button", { name: "Reintentar cajas" }));
    expect(state.retry).toHaveBeenCalledTimes(1);
    expect(ready).toHaveBeenLastCalledWith(false);

    state.error = false; state.drawers = [main, north];
    rerender(<CashDrawerField value="north" onChange={vi.fn()} onReadyChange={ready} />);
    expect(ready).toHaveBeenLastCalledWith(true);
  });

  it("una recarga fallida no borra las cajas que ya se conocían", () => {
    const ready = vi.fn(); state.drawers = [main, north]; state.error = true;
    render(<CashDrawerField value="north" onChange={vi.fn()} onReadyChange={ready} />);
    expect(screen.getByRole("combobox", { name: "Caja física" })).toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
    expect(ready).toHaveBeenLastCalledWith(true);
  });

  it("lo que recuerda es por gym y se corrige cuando el catálogo vuelve a una sola caja", () => {
    state.drawers = [main, north];
    render(<CashDrawerField value="main" onChange={vi.fn()} />).unmount();

    useAuthStore.setState({ gym: { gym_id: "gym-2" } as AuthGym }); state.drawers = []; state.error = true;
    const other = vi.fn();
    render(<CashDrawerField onChange={vi.fn()} onReadyChange={other} />).unmount();
    expect(other).toHaveBeenCalledWith(true);

    useAuthStore.setState({ gym }); state.error = false; state.drawers = [main];
    render(<CashDrawerField onChange={vi.fn()} />).unmount();
    state.drawers = []; state.error = true;
    const again = vi.fn();
    render(<CashDrawerField onChange={vi.fn()} onReadyChange={again} />);
    expect(again).toHaveBeenLastCalledWith(true);
  });
});
