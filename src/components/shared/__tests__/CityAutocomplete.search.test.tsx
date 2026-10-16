import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/data/mexican-cities.json", () => ({ default: [{ name: "Mérida", state: "Yucatán" }, { name: "Monterrey", state: "Nuevo León" }] }));
import { CityAutocomplete } from "../CityAutocomplete";
describe("Selector de ciudad", () => {
  it.each(["MÉRIDA", "mérida", "merida", "yucatan"])("encuentra la ciudad con %s y guarda su nombre original", term => {
    const select = vi.fn();
    render(<CityAutocomplete value="" onChange={select} placeholder="Buscar ciudad" />);
    fireEvent.click(screen.getByRole("combobox"));
    const input = screen.getByPlaceholderText("Buscar o escribir ciudad…");
    fireEvent.change(input, { target: { value: term } });
    const option = screen.getByRole("option", { name: "Mérida, Yucatán" });
    expect(screen.queryByRole("option", { name: "Monterrey, Nuevo León" })).not.toBeInTheDocument();
    fireEvent.click(option);
    expect(select).toHaveBeenCalledWith("Mérida, Yucatán");
  });
});
