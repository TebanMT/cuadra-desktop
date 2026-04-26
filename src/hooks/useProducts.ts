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
  min_stock: number;
  photo_url?: string | null;
  active: boolean;
  created_at: string;
  updated_at?: string;
}

export type ProductStatusFilter = "active" | "inactive" | "all";

export interface ListProductsInput {
  q?: string;
  category?: string;
  status?: ProductStatusFilter;
  low_stock?: boolean;
  page?: number;
  page_size?: number;
}

export interface ProductListResponse {
  items: Product[];
  total: number;
  page: number;
  page_size: number;
}

export interface UpsertProductInput {
  name: string;
  category: string;
  price: number;
  stock: number;
  min_stock: number;
  photo_url?: string;
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
    status: filters.status === "all" ? undefined : filters.status,
    low_stock: filters.low_stock || undefined,
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
    mutationFn: (input: UpsertProductInput) => api.post<Product>("/api/v1/products", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export function useUpdateProduct(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertProductInput) =>
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

export function useAdjustStock(productId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AdjustStockInput) =>
      api.post<Product>(`/api/v1/products/${productId}/adjust-stock`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["products"] }),
  });
}

export type StockLevel = "ok" | "low" | "out";

export function stockLevel(product: Pick<Product, "stock" | "min_stock">): StockLevel {
  if (product.stock <= 0) return "out";
  if (product.stock <= product.min_stock) return "low";
  return "ok";
}
