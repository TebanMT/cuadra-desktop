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

export function useActiveProducts() {
  return useQuery<Product[]>({
    queryKey: KEYS.active(),
    queryFn: async () => {
      const res = await api.get<ProductListResponse>("/api/v1/products", {
        query: { status: "active", page: 1, page_size: 500 },
      });
      return res.items;
    },
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
    reason: input.notes,
  };
}

export function useAdjustStock(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustStockInput) =>
      api.post<Product>(`/api/v1/products/${productId}/adjust-stock`, toAdjustStockWire(input)),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export type StockLevel = "ok" | "low" | "out";

export function stockLevel(product: Pick<Product, "stock" | "stock_minimum">): StockLevel {
  if (product.stock <= 0) return "out";
  if (product.stock <= product.stock_minimum) return "low";
  return "ok";
}
