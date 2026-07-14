import { describe, it, expect, vi, beforeEach } from "vitest";

// Mock de @/lib/api antes de importar el hook (hoisting de vi.mock).
const get = vi.fn();
vi.mock("@/lib/api", () => ({
  api: { get: (...args: unknown[]) => get(...args) },
}));

import { fetchAllActiveProducts } from "../useProducts";

// Fabrica una respuesta de página del endpoint /products. Sólo importan
// items/total para la lógica de paginación.
function page(items: number, total: number, startId = 0) {
  return {
    items: Array.from({ length: items }, (_, i) => ({ id: `p-${startId + i}` })),
    total,
    page: 1,
    page_size: 200,
  };
}

describe("fetchAllActiveProducts", () => {
  beforeEach(() => get.mockReset());

  it("catálogo chico (≤200): UN solo request", async () => {
    get.mockResolvedValueOnce(page(30, 30));
    const all = await fetchAllActiveProducts();
    expect(all).toHaveLength(30);
    expect(get).toHaveBeenCalledTimes(1);
    // Pide el cap real (200), no el viejo 500 que el backend reseteaba a 50.
    expect(get).toHaveBeenCalledWith("/api/v1/products", {
      query: { status: "active", page: 1, page_size: 200 },
    });
  });

  it("página exactamente llena pero total ya cubierto → no pide de más", async () => {
    // total=200, primera página trae 200: la condición all.length>=total
    // corta sin un segundo request innecesario.
    get.mockResolvedValueOnce(page(200, 200));
    const all = await fetchAllActiveProducts();
    expect(all).toHaveLength(200);
    expect(get).toHaveBeenCalledTimes(1);
  });

  it("catálogo grande: pagina hasta juntar todo", async () => {
    // 450 activos → 200 + 200 + 50 en tres páginas.
    get
      .mockResolvedValueOnce(page(200, 450, 0))
      .mockResolvedValueOnce(page(200, 450, 200))
      .mockResolvedValueOnce(page(50, 450, 400));
    const all = await fetchAllActiveProducts();
    expect(all).toHaveLength(450);
    expect(get).toHaveBeenCalledTimes(3);
    // Cada página pedida con su número correcto.
    expect(get).toHaveBeenNthCalledWith(2, "/api/v1/products", {
      query: { status: "active", page: 2, page_size: 200 },
    });
    // Sin duplicados: los ids de las tres páginas son disjuntos.
    expect(new Set(all.map((p) => p.id)).size).toBe(450);
  });

  it("termina por página corta aunque el total venga desactualizado", async () => {
    // total dice 300 (viejo), pero la realidad son 150: la página corta
    // (<200) corta el loop sin colgarse esperando un total inalcanzable.
    get
      .mockResolvedValueOnce(page(200, 300, 0))
      .mockResolvedValueOnce(page(50, 300, 200));
    const all = await fetchAllActiveProducts();
    expect(all).toHaveLength(250);
    expect(get).toHaveBeenCalledTimes(2);
  });

  it("cota dura de páginas: no hace loop infinito si el server siempre miente", async () => {
    // Cada página llena y total inalcanzable → pararía en ACTIVE_MAX_PAGES (25).
    get.mockResolvedValue(page(200, 999999));
    const all = await fetchAllActiveProducts();
    expect(get).toHaveBeenCalledTimes(25);
    expect(all).toHaveLength(25 * 200);
  });
});
