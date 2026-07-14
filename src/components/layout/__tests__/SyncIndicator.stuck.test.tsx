import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import { StuckItemsList, stuckEditRoute } from "../SyncIndicator";
import type { QueueStuckItem } from "@/hooks/useSyncStatus";

// Pin del detalle de rechazos del sync (queue_stuck_items): un duplicado
// sobre un tipo renombrable ofrece "Abrir para renombrar" (la salida que
// destraba la cola); todo lo demás queda visible con su motivo pero sin
// CTA que no lleve a ningún lado.

function item(overrides: Partial<QueueStuckItem>): QueueStuckItem {
  return {
    queue_id: "q1",
    entity_type: "membership_types",
    entity_id: "abc-123",
    operation: "upsert",
    retry_count: 5,
    kind: "duplicate",
    message: 'Ya existe un plan llamado "Mensual" en la nube.',
    entity_label: "Mensual",
    ...overrides,
  };
}

describe("stuckEditRoute", () => {
  it("duplicado en tipos renombrables → ruta con ?edit=<id>", () => {
    expect(stuckEditRoute(item({}))).toBe("/settings/membership-types?edit=abc-123");
    expect(stuckEditRoute(item({ entity_type: "products", entity_id: "p-9" }))).toBe(
      "/products?edit=p-9"
    );
  });

  it("sin CTA para rechazos no-duplicados o tipos sin pantalla de edición", () => {
    expect(stuckEditRoute(item({ kind: "other" }))).toBeNull();
    expect(stuckEditRoute(item({ entity_type: "checkins" }))).toBeNull();
    expect(stuckEditRoute(item({ entity_type: "payments" }))).toBeNull();
  });
});

describe("StuckItemsList", () => {
  it("no rendea nada sin filas atoradas", () => {
    const { container } = render(<StuckItemsList items={[]} onOpenEntity={() => {}} />);
    expect(container).toBeEmptyDOMElement();
    const { container: c2 } = render(
      <StuckItemsList items={undefined} onOpenEntity={() => {}} />
    );
    expect(c2).toBeEmptyDOMElement();
  });

  it("muestra tipo + label + motivo, y el CTA sólo donde aplica", () => {
    const onOpen = vi.fn();
    render(
      <StuckItemsList
        items={[
          item({}),
          item({
            queue_id: "q2",
            entity_type: "checkins",
            entity_id: "chk-1",
            kind: "other",
            message: "rejected_internal_error: fk members",
            entity_label: undefined,
          }),
        ]}
        onOpenEntity={onOpen}
      />
    );

    // Fila duplicada: nombre humano del tipo + label del registro + motivo.
    expect(screen.getByText("Plan: Mensual")).toBeInTheDocument();
    expect(screen.getByText('Ya existe un plan llamado "Mensual" en la nube.')).toBeInTheDocument();

    // Fila no accionable: visible con su motivo, sin botón propio.
    expect(screen.getByText("rejected_internal_error: fk members")).toBeInTheDocument();

    // Un solo CTA (el del duplicado renombrable) y navega a la edición.
    const buttons = screen.getAllByRole("button", { name: /abrir para renombrar/i });
    expect(buttons).toHaveLength(1);
    fireEvent.click(buttons[0]);
    expect(onOpen).toHaveBeenCalledWith("/settings/membership-types?edit=abc-123");
  });
});
