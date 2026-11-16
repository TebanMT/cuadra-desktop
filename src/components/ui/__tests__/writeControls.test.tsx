import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen } from "@testing-library/react";
import { Button } from "../button";
import { Switch } from "../switch";
import { useAuthStore } from "@/stores/useAuthStore";
beforeEach(() => useAuthStore.setState({ readOnly: false }));
describe("Controles de escritura", () => {
  it("bloquea acciones al cambiar la sesión, y conserva cancelar y consultar", () => {
    const save = vi.fn(); const cancel = vi.fn(); const toggle = vi.fn();
    render(<><Button requiresWrite onClick={save}>Guardar</Button><Button onClick={cancel}>Cancelar</Button><Switch requiresWrite aria-label="Avisos" onCheckedChange={toggle} /></>);
    expect(screen.getByRole("button", { name: "Guardar" })).toBeEnabled();
    act(() => useAuthStore.setState({ readOnly: true }));
    expect(screen.getByRole("button", { name: "Guardar" })).toBeDisabled();
    expect(screen.getByRole("switch", { name: "Avisos" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    fireEvent.click(screen.getByRole("switch", { name: "Avisos" }));
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(save).not.toHaveBeenCalled(); expect(toggle).not.toHaveBeenCalled(); expect(cancel).toHaveBeenCalledOnce();
  });
  it("bloquea también el enlace hijo sin ejecutar su manejador", () => {
    useAuthStore.setState({ readOnly: true });
    const navigate = vi.fn();
    render(<Button requiresWrite asChild><a href="#nuevo" onClick={navigate}>Nuevo registro</a></Button>);
    const link = screen.getByRole("link", { name: "Nuevo registro" });
    expect(link).toHaveAttribute("aria-disabled", "true");
    expect(link).toHaveAttribute("tabindex", "-1");
    fireEvent.click(link);
    expect(navigate).not.toHaveBeenCalled();
  });
});
