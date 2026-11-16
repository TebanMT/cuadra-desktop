import { useState } from "react";
import { describe, it, expect, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { NumberPad } from "../NumberPad";

function Pad({ masked = false, initial = "", submit = vi.fn(), cancel = vi.fn(), disabled = false }) {
  const [value, setValue] = useState(initial);
  return <><NumberPad value={value} onChange={setValue} onSubmit={submit} masked={masked} ariaLabel={masked ? "PIN" : "Número de socio"} disabled={disabled} /><button onClick={cancel}>Cancelar</button><input aria-label="Otro campo" /></>;
}

describe("NumberPad: teclado y valor accesible", () => {
  it("Enter y Espacio activan el dígito enfocado sin enviar el PIN", async () => {
    const user = userEvent.setup(); const submit = vi.fn();
    render(<Pad masked submit={submit} />);
    screen.getByRole("button", { name: "2" }).focus();
    await user.keyboard("{Enter} ");
    expect(screen.getByRole("status")).toHaveTextContent("PIN: 2 de 4 dígitos introducidos");
    expect(submit).not.toHaveBeenCalled();
  });

  it("Enter en Cancelar o Borrar no envía un PIN completo", async () => {
    const user = userEvent.setup(); const submit = vi.fn(); const cancel = vi.fn();
    render(<Pad masked initial="1234" submit={submit} cancel={cancel} />);
    screen.getByRole("button", { name: "Cancelar" }).focus();
    await user.keyboard("{Enter}");
    expect(cancel).toHaveBeenCalledOnce();
    screen.getByRole("button", { name: /Borrar/ }).focus();
    await user.keyboard("{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("3 de 4");
    expect(submit).not.toHaveBeenCalled();
  });

  it("conserva escritura directa, borrado y envío desde fuera de controles", async () => {
    const user = userEvent.setup(); const submit = vi.fn();
    render(<Pad submit={submit} />);
    await user.keyboard("123{Backspace}45{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("Número de socio: 1 2 4 5");
    expect(submit).toHaveBeenCalledOnce();
  });

  it("muestra cifras del socio pero nunca revela las del PIN", () => {
    const { unmount } = render(<Pad initial="1234" />);
    expect(screen.getAllByText("1")).toHaveLength(2); // casilla y botón
    unmount();
    render(<Pad initial="1234" masked />);
    expect(screen.getAllByText("1")).toHaveLength(1);
    expect(screen.getByRole("status")).not.toHaveTextContent("1234");
    expect(screen.getByRole("status")).toHaveTextContent("4 de 4");
  });

  it("no captura otros campos, combinaciones de teclas ni un diálogo superpuesto", async () => {
    const user = userEvent.setup(); const submit = vi.fn();
    render(<><Pad submit={submit} /><div role="dialog" aria-label="Otra tarea" tabIndex={-1}>Otra tarea</div></>);
    await user.type(screen.getByRole("textbox"), "1234{Enter}");
    screen.getByRole("textbox").blur();
    await user.keyboard("{Control>}2{/Control}");
    fireEvent.keyDown(screen.getByRole("dialog"), { key: "3" });
    expect(screen.getByRole("status")).toHaveTextContent("sin dígitos");
    expect(submit).not.toHaveBeenCalled();
  });

  it("no cambia ni envía mientras está deshabilitado", async () => {
    const user = userEvent.setup(); const submit = vi.fn();
    render(<Pad initial="1234" disabled submit={submit} />);
    await user.keyboard("{Backspace}{Enter}");
    expect(screen.getByRole("status")).toHaveTextContent("4 de 4");
    expect(submit).not.toHaveBeenCalled();
  });
});
