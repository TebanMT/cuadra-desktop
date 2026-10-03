import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
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
  useCashDrawers: () => ({ data: state.drawers, isLoading: false }),
}));

import { CashDrawerField } from "../CashDrawerField";

describe("CashDrawerField", () => {
  beforeEach(() => {
    state.drawers = [];
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
