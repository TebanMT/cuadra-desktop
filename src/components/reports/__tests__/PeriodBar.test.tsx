import { useState } from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { format } from "date-fns";
import { PeriodBar, type ReportRange } from "../PeriodBar";

// Harness con estado real: PeriodBar es controlado.
function Harness({ onChange }: { onChange: (r: ReportRange) => void }) {
  const [value, setValue] = useState<ReportRange>({ period: "month" });
  return (
    <PeriodBar
      value={value}
      onChange={(r) => {
        setValue(r);
        onChange(r);
      }}
    />
  );
}

// El día 1 del mes actual siempre es clickeable (nunca es futuro), sin
// importar qué día corra el test. El grid del mes siguiente renderiza sus
// celdas deshabilitadas, así que filtramos por enabled.
function clickDay(day: string) {
  const btn = screen
    .getAllByRole("button", { name: new RegExp(`, ${day} de `) })
    .find((b) => !(b as HTMLButtonElement).disabled);
  expect(btn, `día ${day} clickeable`).toBeTruthy();
  fireEvent.click(btn as HTMLButtonElement);
}

describe("PeriodBar — fechas exactas con calendario de rango", () => {
  it("elige inicio y fin en el calendario y aplica period=custom", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);

    fireEvent.click(screen.getByRole("button", { name: /personalizado/i }));
    expect(screen.getByLabelText("Desde")).toBeTruthy();

    // Rango de un día (1 → 1): robusto aunque el test corra un día 1.
    clickDay("1");
    clickDay("1");

    const firstOfMonth = format(new Date(), "yyyy-MM-01");
    const aplicar = screen.getByRole("button", { name: "Aplicar" }) as HTMLButtonElement;
    expect(aplicar.disabled).toBe(false);
    fireEvent.click(aplicar);

    expect(onChange).toHaveBeenCalledWith({
      period: "custom",
      from: firstOfMonth,
      to: firstOfMonth,
    });
  });

  it("los presets siguen aplicando directo, sin calendario", () => {
    const onChange = vi.fn();
    render(<Harness onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Mes pasado" }));
    expect(onChange).toHaveBeenCalledWith({ period: "last_month" });
  });
});
