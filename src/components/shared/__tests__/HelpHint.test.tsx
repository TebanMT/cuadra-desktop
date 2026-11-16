import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { HelpHint } from "../HelpHint";

describe("HelpHint", () => {
  it("lleva al tema exacto de Ayuda y nombra la tarea para lectores de pantalla", () => {
    render(<MemoryRouter><HelpHint topic="caja" task="contar y cerrar caja" /></MemoryRouter>);
    const link = screen.getByRole("link", { name: "Cómo funciona: contar y cerrar caja" });
    expect(link).toHaveAttribute("href", "/help#caja");
    expect(link).toHaveTextContent("Cómo funciona");
  });
});
