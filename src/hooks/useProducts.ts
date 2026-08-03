import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";

export const DEFAULT_CATEGORIES = [
  "Bebidas",
  "Suplementos",
  "Snacks",
  "Accesorios",
  "Otros",
] as const;

export type DefaultCategory = (typeof DEFAULT_CATEGORIES)[number];

export interface Product {
  id: string;
  gym_id: string;
  name: string;
  category: string;
  price: number;
  stock: number;
  // Backend returns `stock_minimum` (productResp en
  // product_controller.go). Mantener este nombre, no `min_stock` —
  // sino el campo queda undefined y la UI pinta 0.
  stock_minimum: number;
  image_url?: string | null;
  active: boolean;
  created_at: string;
  updated_at?: string;
  // Costo unitario promedio ponderado (pesos), o ausente cuando el
  // producto no tiene costo capturado. Lo usa la ficha para "Costo prom ·
  // Precio · Margen". Opcional a propósito: el costo es opcional al
  // crear/resurtir.
  avg_unit_cost?: number | null;
}

export type ProductStatusFilter = "active" | "inactive" | "all";

// Columnas ordenables — coincide con product/domain/repository.go
// (whitelist en backend). Default: name asc.
export type ProductSortColumn = "name" | "price" | "stock" | "category";
export type SortDirection = "asc" | "desc";

export interface ListProductsInput {
  q?: string;
  category?: string;
  status?: ProductStatusFilter;
  low_stock?: boolean;
  sort?: ProductSortColumn;
  dir?: SortDirection;
  page?: number;
  page_size?: number;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
  // totals — stats globales sobre el filtro completo (no la página
  // visible). Reemplaza el cálculo client-side de items.filter(...)
  // que mentía cuando había paginación.
  totals: {
    total_value: number;
    low_count: number;
    out_count: number;
    // Ganancia potencial sobre el stock (Standard). Montos en pesos, solo
    // activos con costo capturado. margin_pct es null cuando ninguno tiene
    // costo (el FE oculta el chip). products_with_cost/products_total es la
    // cobertura para el hint "X de Y con costo".
    potential_profit: number;
    cost_value: number;
    margin_pct?: number | null;
    products_total: number;
    products_with_cost: number;
  };
}

// CreateProductInput — shape JSON que el backend espera en POST
// /api/v1/products (createProductReq en product_controller.go). Ojo:
// el stock inicial viaja como `initial_stock`, NO `stock`; y el mínimo
// como `stock_minimum`, NO `min_stock`. Mandar nombres viejos hacía
// que el backend los ignorara y todo quedara en 0.
// `initial_cost` es opcional — se persiste en el stock_movement
// inicial (type='restock') para que el dueño pueda ver cuánto gastó
// llenando el inventario de arranque en el reporte de egresos.
export interface CreateProductInput {
  name: string;
  category?: string;
  price: number;
  initial_stock: number;
  stock_minimum: number;
  initial_cost?: number;
  // false = inventario que ya existía (captura de catálogo): conserva el
  // costo para el margen pero NO cuenta como egreso. Ausente = compra.
  initial_is_purchase?: boolean;
  image_url?: string;
}

// UpdateProductInput — PATCH /api/v1/products/:id no acepta stock
// (solo se cambia via /adjust-stock). Mismo rename de stock_minimum
// que en create.
export interface UpdateProductInput {
  name: string;
  category?: string;
  price: number;
  stock_minimum: number;
  image_url?: string;
}

export type StockMovementType = "restock" | "damage" | "count";

export interface AdjustStockInput {
  movement_type: StockMovementType;
  quantity?: number;
  new_stock?: number;
  cost?: number;
  // Sólo restock: false = inventario preexistente, no es egreso.
  is_purchase?: boolean;
  notes?: string;
}

const KEYS = {
  list: (filters: ListProductsInput) => ["products", "list", filters] as const,
  active: () => ["products", "active"] as const,
  detail: (id: string) => ["products", "detail", id] as const,
};

function buildQuery(filters: ListProductsInput): Record<string, string | number | boolean | undefined> {
  return {
    q: filters.q || undefined,
    category: filters.category || undefined,
    // BE ya acepta "all" explícitamente desde que migramos a ActiveFilter
    // (3 estados). Pero "all" sigue mapeando al default si el FE lo
    // omite, así que lo pasamos solo cuando importa (inactive/all).
    status: filters.status,
    low_stock: filters.low_stock || undefined,
    sort: filters.sort,
    dir: filters.dir,
    page: filters.page,
    page_size: filters.page_size,
  };
}

export function useProductsList(filters: ListProductsInput) {
  return useQuery<ProductListResponse>({
    queryKey: KEYS.list(filters),
    queryFn: () => api.get<ProductListResponse>("/api/v1/products", { query: buildQuery(filters) }),
    placeholderData: keepPreviousData,
  });
}

// useProductForDeepLink — resuelve un producto por id para el deep-link
// ?edit=<id> (llega desde "Abrir para renombrar" del indicador de sync).
// No existe GET /products/:id; traemos hasta el cap del backend (200,
// list_products.go) con status=all y buscamos client-side — el catálogo de
// un gym de barrio cabe sobrado. `null` = no encontrado (borrado o fuera
// del cap): el caller avisa con toast y no abre nada.
export function useProductForDeepLink(id: string | null) {
  return useQuery<Product | null>({
    queryKey: ["products", "deeplink", id],
    queryFn: async () => {
      const res = await api.get<ProductListResponse>("/api/v1/products", {
        query: { status: "all", page: 1, page_size: 200 },
      });
      return res.items.find((p) => p.id === id) ?? null;
    },
    enabled: !!id,
  });
}

// El backend limita page_size a 200 (prodRepo.MaxPageSize) — y desde el
// clamp-al-cap ya no resetea a 50 al pedir de más, pero 200 sigue siendo el
// techo por request. Para traer TODO el catálogo activo (lo que la venta
// rápida y el buscador global necesitan: un producto ausente es uno que no
// puedes vender) paginamos hasta agotar. Caso normal (≤200 activos) = UN
// request; sólo un catálogo grande dispara páginas extra.
const ACTIVE_PAGE_SIZE = 200;

// Cota dura de páginas (25 × 200 = 5000 productos) — muy por encima de
// cualquier gym real; existe sólo para que un `total` inconsistente del
// server nunca cuelgue el fetch en un loop infinito.
const ACTIVE_MAX_PAGES = 25;

export async function fetchAllActiveProducts(): Promise<Product[]> {
  const all: Product[] = [];
  for (let page = 1; page <= ACTIVE_MAX_PAGES; page++) {
    const res = await api.get<ProductListResponse>("/api/v1/products", {
      query: { status: "active", page, page_size: ACTIVE_PAGE_SIZE },
    });
    all.push(...res.items);
    // Fin cuando ya juntamos el total reportado, o cuando la página vino
    // incompleta (última página). La segunda condición es la terminación
    // real y robusta ante un `total` desactualizado; la primera sólo ahorra
    // un request de más cuando el total es múltiplo exacto del page size.
    if (all.length >= res.total || res.items.length < ACTIVE_PAGE_SIZE) {
      break;
    }
  }
  return all;
}

export function useActiveProducts() {
  return useQuery<Product[]>({
    queryKey: KEYS.active(),
    queryFn: fetchAllActiveProducts,
    staleTime: 15_000,
  });
}

export function useCreateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateProductInput) => api.post<Product>("/api/v1/products", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateProductInput) =>
      api.patch<Product>(`/api/v1/products/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useDeactivateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<Product>(`/api/v1/products/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useReactivateProduct() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<Product>(`/api/v1/products/${id}/reactivate`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

// El backend (adjustStockReq en product_controller.go) espera el enum
// canónico de stock_movement {restock, shrinkage, count_correction} con los
// campos `quantity` + `reason`. La UI usa su propio vocabulario (restock/
// damage/count con `new_stock`/`notes`); traducimos aquí, en la frontera del
// wire, para no romper la pantalla. Antes el FE mandaba `damage`/`count` +
// `new_stock`/`notes` directo → el backend rechazaba con 400 (merma y conteo
// quedaban rotos de extremo a extremo). Para count_correction, `quantity` es
// el stock absoluto resultante (el backend hace SetStock, no suma).
interface AdjustStockWire {
  movement_type: "restock" | "shrinkage" | "count_correction";
  quantity: number;
  cost?: number;
  is_purchase?: boolean;
  reason?: string;
}

function toAdjustStockWire(input: AdjustStockInput): AdjustStockWire {
  if (input.movement_type === "count") {
    return {
      movement_type: "count_correction",
      quantity: input.new_stock ?? 0,
      reason: input.notes,
    };
  }
  return {
    movement_type: input.movement_type === "damage" ? "shrinkage" : "restock",
    quantity: input.quantity ?? 0,
    cost: input.cost,
    is_purchase: input.is_purchase,
    reason: input.notes,
  };
}

export function useAdjustStock(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustStockInput) =>
      api.post<Product>(`/api/v1/products/${productId}/adjust-stock`, toAdjustStockWire(input)),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["products"] });
      // Un restock con costo mueve "egresos por mercancía" y el stock
      // crítico del dashboard/Reportes.
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export type StockLevel = "ok" | "low" | "out";

export function stockLevel(product: Pick<Product, "stock" | "stock_minimum">): StockLevel {
  if (product.stock <= 0) return "out";
  if (product.stock <= product.stock_minimum) return "low";
  return "ok";
}
