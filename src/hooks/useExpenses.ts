import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { ExpenseCategory, ExpensePaymentMethod } from "@/strings/expenses";

export interface Expense {
  id: string;
  expense_date: string; // YYYY-MM-DD
  amount: number;
  category: ExpenseCategory;
  description?: string | null;
  payment_method: ExpensePaymentMethod;
  created_by: string;
  created_at: string;
  updated_at?: string;
}

export type ExpenseSortColumn = "date" | "amount" | "category" | "payment_method";
export type SortDirection = "asc" | "desc";

export interface ListExpensesInput {
  q?: string;
  category?: ExpenseCategory | "";
  payment_method?: ExpensePaymentMethod | "";
  from?: string; // YYYY-MM-DD
  to?: string;
  sort?: ExpenseSortColumn;
  dir?: SortDirection;
  page?: number;
  page_size?: number;
}

export interface ExpenseListResponse {
  items: Expense[];
  total: number;
  page: number;
  page_size: number;
  totals: {
    total: number;
    cash_total: number;
    non_cash_total: number;
    dominant_category: string;
    dominant_category_total: number;
  };
}

export interface CreateExpenseInput {
  expense_date: string;
  amount: number;
  category: ExpenseCategory;
  description?: string;
  payment_method: ExpensePaymentMethod;
}

export interface UpdateExpenseInput {
  expense_date: string;
  amount: number;
  category: ExpenseCategory;
  description?: string;
  payment_method: ExpensePaymentMethod;
}

const KEYS = {
  list: (filters: ListExpensesInput) => ["expenses", "list", filters] as const,
};

function buildQuery(filters: ListExpensesInput): Record<string, string | number | boolean | undefined> {
  return {
    q: filters.q || undefined,
    category: filters.category || undefined,
    payment_method: filters.payment_method || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: filters.sort,
    dir: filters.dir,
    page: filters.page,
    page_size: filters.page_size,
  };
}

export function useExpensesList(filters: ListExpensesInput) {
  return useQuery<ExpenseListResponse>({
    queryKey: KEYS.list(filters),
    queryFn: () => api.get<ExpenseListResponse>("/api/v1/expenses", { query: buildQuery(filters) }),
    placeholderData: keepPreviousData,
  });
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => api.post<Expense>("/api/v1/expenses", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useUpdateExpense(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateExpenseInput) => api.patch<Expense>(`/api/v1/expenses/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/api/v1/expenses/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["expenses"] }),
  });
}
