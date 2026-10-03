import { validateDateFields } from "@/lib/date-input";
import { useState } from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DateInput } from "../date-input";
import { DateRangePicker } from "../date-range-picker";
import { Dialog, DialogContent, DialogTitle } from "../dialog";
import { parseDateInput } from "@/lib/date-input";

function Form({ save = vi.fn(), disabled = false, context = "recent" as "recent" | "birthdate" }) {
  const [date, setDate] = useState("2026-09-15");
  return <form noValidate onSubmitCapture={validateDateFields} onSubmit={event => { event.preventDefault(); save(date); }}>
    <fieldset disabled={disabled}><label htmlFor="date">Fecha</label>
      <DateInput id="date" value={date} onValueChange={setDate} context={context} today="2026-09-28" max="2026-09-28" />
    </fieldset><button type="submit">Guardar</button>
  </form>;
}

describe("captura de fechas", () => {
  it("acepta día/mes/año, años bisiestos y pegado ISO sin cambiar el día", () => {
    expect(parseDateInput("29/02/2024")).toBe("2024-02-29");
    expect(parseDateInput("29/02/2025")).toBeNull();
    expect(parseDateInput("31/04/2026")).toBeNull();
    expect(parseDateInput("3/9/1985")).toBe("1985-09-03");
    expect(parseDateInput("2026-09-28")).toBe("2026-09-28");
    expect(parseDateInput("09/28/2026")).toBeNull();
    expect(parseDateInput("2026-09-28T00:00:00Z")).toBeNull();
  });
  it("guarda ISO al escribir en español", () => {
    const save = vi.fn(); render(<Form save={save} />);
    expect(screen.getByLabelText("Fecha")).toHaveValue("15/09/2026");
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "07/09/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(save).toHaveBeenCalledWith("2026-09-07");
  });
  it("inserta las barras para poder escribir desde un teclado numérico", () => {
    const save = vi.fn(); render(<Form save={save} />);
    const input = screen.getByLabelText("Fecha");
    fireEvent.change(input, { target: { value: "070" } });
    expect(input).toHaveValue("07/0");
    fireEvent.change(input, { target: { value: "07/092" } });
    expect(input).toHaveValue("07/09/2");
    fireEvent.change(input, { target: { value: "07092026" } });
    expect(input).toHaveValue("07/09/2026");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(save).toHaveBeenCalledWith("2026-09-07");
  });
  it.each(["31/02/2026", "3/", "29/09/2026"])("bloquea %s aunque el formulario use noValidate", text => {
    const save = vi.fn(); render(<Form save={save} />);
    const input = screen.getByLabelText("Fecha");
    fireEvent.change(input, { target: { value: text } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(save).not.toHaveBeenCalled();
    expect(input).toHaveFocus();
    expect(screen.getByRole("alert")).toBeInTheDocument();
    fireEvent.change(input, { target: { value: "20/09/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(save).toHaveBeenCalledWith("2026-09-20");
  });
  it("permite vaciar una fecha opcional", () => {
    const save = vi.fn(); render(<Form save={save} />);
    fireEvent.change(screen.getByLabelText("Fecha"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(save).toHaveBeenCalledWith("");
  });
  it("abre el calendario, aplica Ayer y conserva el formato", () => {
    const save = vi.fn(); render(<Form save={save} />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario" }));
    fireEvent.click(screen.getByRole("button", { name: "Ayer" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(screen.getByLabelText("Fecha")).toHaveValue("27/09/2026");
    fireEvent.click(screen.getByRole("button", { name: "Guardar" }));
    expect(save).toHaveBeenCalledWith("2026-09-27");
  });
  it("respeta el fieldset deshabilitado", () => {
    render(<Form disabled />);
    expect(screen.getByRole("button", { name: "Abrir calendario" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario" }));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });
  it("nacimiento permite elegir año y mes sin atajos de movimientos", () => {
    render(<Form context="birthdate" />);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario" }));
    expect(screen.getAllByRole("combobox")).toHaveLength(2);
    expect(screen.getByRole("option", { name: "1985" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Ayer" })).not.toBeInTheDocument();
  });
  it("un calendario dentro de un diálogo no envía el formulario ni cierra el diálogo", () => {
    const save = vi.fn(); render(<Dialog open><DialogContent aria-describedby={undefined}><DialogTitle>Pago</DialogTitle><Form save={save} /></DialogContent></Dialog>);
    fireEvent.click(screen.getByRole("button", { name: "Abrir calendario" }));
    fireEvent.click(screen.getByRole("button", { name: "Hoy" }));
    expect(screen.getByRole("dialog", { name: "Pago" })).toBeInTheDocument();
    expect(save).not.toHaveBeenCalled();
    expect(screen.getByLabelText("Fecha")).toHaveValue("28/09/2026");
  });
});

describe("periodos", () => {
  it("aplica un periodo escrito y bloquea fechas incompletas y rangos invertidos", () => {
    const onChange = vi.fn();
    render(<DateRangePicker max="2026-09-28" from="2026-09-01" to="2026-09-28" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "20/09/2026" } });
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "10/09/2026" } });
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("fecha final");
    fireEvent.change(screen.getByLabelText("Hasta"), { target: { value: "25/09/2026" } });
    expect(document.querySelector('[data-day="2026-09-25"]')).toHaveClass("rdp-range_end");
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "2/" } });
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "20/09/2026" } });
    fireEvent.click(screen.getByRole("button", { name: "Aplicar" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-20", "2026-09-25");
  });
  it("atajos y limpiar filtros publican las dos fechas juntas", () => {
    const onChange = vi.fn(); render(<DateRangePicker clearable max="2026-09-28" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.click(screen.getByRole("button", { name: "7 días" }));
    expect(onChange).toHaveBeenCalledWith("2026-09-22", "2026-09-28");
    fireEvent.click(screen.getByRole("button", { name: "Personalizado" }));
    fireEvent.click(screen.getByRole("button", { name: "Todas las fechas" }));
    expect(onChange).toHaveBeenLastCalledWith("", "");
  });
  it("cancelar descarta el borrador y el límite de reportes sigue vigente", () => {
    const onChange = vi.fn(); render(<DateRangePicker maxDays={366} max="2026-09-28" from="2026-09-01" to="2026-09-28" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    fireEvent.change(screen.getByLabelText("Desde"), { target: { value: "01/01/2024" } });
    expect(screen.getByRole("button", { name: "Aplicar" })).toBeDisabled();
    expect(screen.getByRole("alert")).toHaveTextContent("366 días");
    fireEvent.click(screen.getByRole("button", { name: "Cancelar" }));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button"));
    expect(screen.getByLabelText("Desde")).toHaveValue("01/09/2026");
  });
});
