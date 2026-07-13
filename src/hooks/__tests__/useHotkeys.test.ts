import { describe, it, expect, vi } from "vitest";
import { renderHook } from "@testing-library/react";
import { useHotkeys } from "../useHotkeys";

// Pin del leak de los accesos rápidos: el atajo navega/abre superficies
// con un input autofocuseado y, sin preventDefault, el default del
// keydown insertaba la letra del atajo en ese input recién enfocado
// ("v" aparecía escrito en la búsqueda de Venta rápida). Los demás
// contratos del hook (modificadores, editables, enabled) viven en
// useHotkeys.test.tsx.
describe("useHotkeys — preventDefault", () => {
  it("previene el default al ejecutar un handler (la letra no viaja al input destino)", () => {
    const v = vi.fn();
    renderHook(() => useHotkeys({ v }));

    const e = new KeyboardEvent("keydown", { key: "v", bubbles: true, cancelable: true });
    window.dispatchEvent(e);

    expect(v).toHaveBeenCalledOnce();
    expect(e.defaultPrevented).toBe(true);
  });

  it("teclas sin handler pasan de largo sin preventDefault", () => {
    renderHook(() => useHotkeys({ v: vi.fn() }));
    const e = new KeyboardEvent("keydown", { key: "z", bubbles: true, cancelable: true });
    window.dispatchEvent(e);
    expect(e.defaultPrevented).toBe(false);
  });
});
