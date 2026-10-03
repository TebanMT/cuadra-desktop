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
	paid_from: PaidFrom;
  created_by: string;
  created_at: string;
  updated_at?: string;
	version:number;
	paid_on:string;
	payee_name?:string|null;
	reference?:string|null;
	classification:"fixed"|"variable";
	source:"manual"|"recurring"|"cash_movement";
	cash_movement_id?:string|null;
	cash_drawer_id?:string|null;
	recurring_occurrence_id?:string|null;
}

// `cash_register` was the old wire name. The API still accepts it for one
// transition release, but clients only send and consume the canonical name.
export type PaidFrom = "cash_drawer" | "gym_fund" | "external";

export type ExpenseSortColumn = "date" | "amount" | "category" | "payment_method";
export type SortDirection = "asc" | "desc";

export interface ListExpensesInput {
  q?: string;
  category?: ExpenseCategory | "";
  payment_method?: ExpensePaymentMethod | "";
	source?: "manual" | "recurring" | "cash_movement" | "";
	classification?: "fixed" | "variable" | "";
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
		fixed_total: number;
		variable_total: number;
    dominant_category: string;
    dominant_category_total: number;
  };
}

export interface CreateExpenseInput {
  idempotency_key: string;
  expense_date: string;
  amount: number;
  category: ExpenseCategory;
  description?: string;
  payment_method: ExpensePaymentMethod;
	paid_from: PaidFrom;
	cash_drawer_id?: string;
	payee_name?:string;reference?:string;classification:"fixed"|"variable";
}

export interface UpdateExpenseInput {
  expense_date: string;
  amount: number;
  category: ExpenseCategory;
  description?: string;
  payment_method: ExpensePaymentMethod;
	paid_from: PaidFrom;
	cash_drawer_id?: string;
  version:number;
	payee_name?:string;reference?:string;classification:"fixed"|"variable";
  correction_reason: string;
}

const KEYS = {
  list: (filters: ListExpensesInput) => ["expenses", "list", filters] as const,
};

function buildQuery(filters: ListExpensesInput): Record<string, string | number | boolean | undefined> {
  return {
    q: filters.q || undefined,
    category: filters.category || undefined,
    payment_method: filters.payment_method || undefined,
		source: filters.source || undefined,
		classification: filters.classification || undefined,
    from: filters.from || undefined,
    to: filters.to || undefined,
    sort: filters.sort,
    dir: filters.dir,
    page: filters.page,
    page_size: filters.page_size,
  };
}

export function useExpensesList(filters: ListExpensesInput, enabled = true) {
  return useQuery<ExpenseListResponse>({
    queryKey: KEYS.list(filters),
    queryFn: () => api.get<ExpenseListResponse>("/api/v1/expenses", { query: buildQuery(filters) }),
    placeholderData: keepPreviousData,
    enabled,
  });
}

export async function fetchAllExpenses(filters: ListExpensesInput): Promise<Expense[]> {
  const rows: Expense[] = [];
  let page = 1;
  let total = 0;
  do {
    const response = await api.get<ExpenseListResponse>("/api/v1/expenses", {
      query: buildQuery({ ...filters, page, page_size: 200 }),
    });
    rows.push(...response.items);
    total = response.total;
    if (response.items.length === 0) break;
    page += 1;
  } while (rows.length < total);
  return rows;
}

export function useCreateExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateExpenseInput) => api.post<{ expense_id: string; amount: number; category: string }>("/api/v1/expenses", { ...input, paid_on: input.expense_date, expense_date: undefined }),
		onSuccess: () => invalidateFinancial(qc),
  });
}

export function useUpdateExpense(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateExpenseInput) => api.patch<{ id: string }>(`/api/v1/expenses/${id}`, { ...input, paid_on: input.expense_date, expense_date: undefined }),
		onSuccess: () => invalidateFinancial(qc),
  });
}

export function useDeleteExpense() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, version, correction_reason }: { id: string; version: number; correction_reason: string }) =>
      api.delete<void>(`/api/v1/expenses/${id}`, {
        query: { version, correction_reason },
      }),
		onSuccess: () => invalidateFinancial(qc),
  });
}

export type ExpenseFrequency="weekly"|"every_14_days"|"semimonthly"|"monthly"|"bimonthly"|"quarterly"|"semiannual"|"annual";
export interface ExpenseOccurrence {name?:string;paid_amount?:number|null;paid_on?:string|null;id:string;version:number;template_id:string;due_on:string;expected_amount:number;category:ExpenseCategory;payee_name?:string;payment_method:ExpensePaymentMethod;classification:"fixed"|"variable";status:"pending"|"paid"|"skipped";expense_id?:string;resolved_by?:string;resolved_at?:string;skip_reason?:string}
export interface ExpenseTemplate {id:string;version:number;name:string;payee_name?:string;category:ExpenseCategory;expected_amount:number;usual_payment_method:ExpensePaymentMethod;classification:"fixed"|"variable";frequency:ExpenseFrequency;starts_on:string;ends_on?:string;next_due_on:string;active:boolean}
export type CashMovementClassification = "unclassified"|"expense"|"inventory_purchase"|"non_operating";
export type CashMovementStatus = "all"|"pending"|"classified"|CashMovementClassification;
export interface CashMovement {id:string;version:number;movement_on:string;amount:number;movement_type:"cash_in"|"cash_out";reason:string;operator_id:string;cash_drawer_id?:string;expense_id?:string;classification_status:CashMovementClassification;created_at?:string;updated_at?:string}
export function cashMovementActions(movement:Pick<CashMovement,"movement_type"|"classification_status">){const isOut=movement.movement_type==="cash_out";return{canEdit:(isOut&&movement.classification_status==="unclassified")||(!isOut&&movement.classification_status==="non_operating"),canClassify:isOut&&movement.classification_status==="unclassified",canUnclassify:movement.classification_status==="expense"||(isOut&&movement.classification_status==="non_operating")}}
export interface CashMovementListResponse {items:CashMovement[];total:number;page:number;page_size:number}
export interface CashMovementListInput {from?:string;to?:string;status?:CashMovementStatus;page?:number;page_size?:number}
export interface UpdateCashMovementInput {id:string;version:number;movement_on:string;amount:number;movement_type:"cash_in"|"cash_out";reason:string;cash_drawer_id?:string;correction_reason:string}
export type InventoryPurchaseStatus="unpaid"|"paid"|"annulled"|"legacy_incomplete";
export interface InventoryPurchase {
  remote?: boolean; separate_receipt?: boolean; receipt_status?: "pending" | "received"; received_at?: string | null; received_quantity?: number | null;
id:string;version:number;stock_movement_id:string | null;product_id:string;product_name:string;quantity:number;unit_cost:number;total_amount:number;status:InventoryPurchaseStatus;paid_on?:string;payment_method?:ExpensePaymentMethod;paid_from?:"cash_drawer"|"gym_fund"|"external";cash_movement_id?:string;cash_drawer_id?:string;recorded_on?:string;created_by:string;created_at:string;updated_at?:string;annulled?:boolean;stock_delta?:number;new_stock?:number;correction_movement_ids?:string[]}
export interface InventoryPurchaseListResponse {items:InventoryPurchase[];total:number;page:number;page_size:number}
export interface ExpenseTemplateInput{name:string;payee_name?:string;expected_amount:number;category:ExpenseCategory;usual_payment_method:ExpensePaymentMethod;classification:"fixed"|"variable";frequency:ExpenseFrequency;starts_on:string;ends_on?:string;version?:number}
const invalidateFinancial=(qc:ReturnType<typeof useQueryClient>)=>{for(const key of ["expenses","expense-occurrences","expense-templates","inventory-purchases","cash-movements","cash-close","reports","dashboard","analytics"])qc.invalidateQueries({queryKey:[key]})};
export function useExpenseOccurrences(from: string | undefined, to: string, enabled = true) {
  return useQuery<{ items: ExpenseOccurrence[]; total: number; page: number; page_size: number }>({
    queryKey: ["expense-occurrences", from, to],
    queryFn: async () => {
      // Template mutations invalidate this query. Generate first so saving or
      // reactivating a schedule immediately refreshes both the list and count.
      await api.post("/api/v1/expense-occurrences/materialize", { to });
      return fetchAllFinancialRows<ExpenseOccurrence>("/api/v1/expense-occurrences", { from, to });
    },
    enabled,
  });
}
export function useExpenseTemplates(enabled=true){return useQuery<{items:ExpenseTemplate[]}>({queryKey:["expense-templates"],queryFn:()=>api.get("/api/v1/expense-templates",{query:{include_inactive:true}}),enabled})}
export function useCashMovements(filters:CashMovementListInput,enabled=true){return useQuery<CashMovementListResponse>({queryKey:["cash-movements","list",filters],queryFn:()=>api.get("/api/v1/cash-movements",{query:{...filters}}),placeholderData:keepPreviousData,enabled})}
export function useUnclassifiedCash(enabled=true){return useQuery<CashMovementListResponse>({queryKey:["cash-movements","unclassified"],queryFn:()=>fetchAllFinancialRows<CashMovement>("/api/v1/cash-movements/unclassified"),enabled})}

export function useInventoryPurchases(status:"unpaid"|"paid"|"all"="unpaid",enabled=true,filters:{from?:string;to?:string;page?:number;page_size?:number}={}){return useQuery<InventoryPurchaseListResponse>({queryKey:["inventory-purchases",status,filters],queryFn:()=>status === "unpaid" && !filters.page ? fetchAllFinancialRows<InventoryPurchase>("/api/v1/inventory-purchases", {status,...filters}) : api.get("/api/v1/inventory-purchases",{query:{status,...filters}}),placeholderData:keepPreviousData,enabled})}
export function useMaterializeOccurrences(){const qc=useQueryClient();return useMutation({mutationFn:(to:string)=>api.post("/api/v1/expense-occurrences/materialize",{to}),onSuccess:()=>invalidateFinancial(qc)})}
export function usePayOccurrence(){const qc=useQueryClient();return useMutation({mutationFn:({id,...body}:{id:string;paid_on:string;amount:number;payment_method:ExpensePaymentMethod;paid_from:PaidFrom;cash_drawer_id?:string;cash_movement_id?:string;expense_id?:string;idempotency_key:string;payee_name?:string;description?:string;reference?:string})=>api.post(`/api/v1/expense-occurrences/${id}/pay`,body),onSuccess:()=>invalidateFinancial(qc)})}
export function useSkipOccurrence(){const qc=useQueryClient();return useMutation({mutationFn:({id,reason}:{id:string;reason:string})=>api.post(`/api/v1/expense-occurrences/${id}/skip`,{reason}),onSuccess:()=>invalidateFinancial(qc)})}
export function useReopenOccurrence(){const qc=useQueryClient();return useMutation({mutationFn:({id,version,correction_reason}:{id:string;version:number;correction_reason:string})=>api.post<ExpenseOccurrence>(`/api/v1/expense-occurrences/${id}/reopen`,{version,correction_reason}),onSuccess:()=>invalidateFinancial(qc)})}
export function usePayInventoryPurchase(){const qc=useQueryClient();return useMutation({mutationFn:({id,...body}:{id:string;version:number;paid_on:string;payment_method:ExpensePaymentMethod;paid_from:"cash_drawer"|"gym_fund"|"external";cash_drawer_id?:string;cash_movement_id?:string;idempotency_key:string})=>api.post<InventoryPurchase>(`/api/v1/inventory-purchases/${id}/pay`,body),onSuccess:()=>invalidateFinancial(qc)})}
export function useReopenInventoryPurchase(){const qc=useQueryClient();return useMutation({mutationFn:({id,version,correction_reason}:{id:string;version:number;correction_reason:string})=>api.post<InventoryPurchase>(`/api/v1/inventory-purchases/${id}/reopen`,{version,correction_reason}),onSuccess:()=>invalidateFinancial(qc)})}
export function useCorrectInventoryPurchase(){const qc=useQueryClient();return useMutation({mutationFn:({id,...body}:{id:string;version:number;quantity?:number;unit_cost?:number;annul?:boolean;correction_reason:string;idempotency_key:string})=>api.post<InventoryPurchase>(`/api/v1/inventory-purchases/${id}/correct`,body),onSuccess:()=>invalidateFinancial(qc)})}
export function useClassifyCashMovement(){const qc=useQueryClient();return useMutation({mutationFn:({id,...body}:{id:string;non_operating?:boolean;paid_on?:string;category?:ExpenseCategory;payee_name?:string;description?:string;reference?:string;classification?:"fixed"|"variable"})=>api.post(`/api/v1/cash-movements/${id}/classify`,body),onSuccess:()=>invalidateFinancial(qc)})}
export function useUnclassifyCashMovement(){const qc=useQueryClient();return useMutation({mutationFn:({id,version,correction_reason}:{id:string;version:number;correction_reason:string})=>api.post<CashMovement>(`/api/v1/cash-movements/${id}/unclassify`,{version,correction_reason}),onSuccess:()=>invalidateFinancial(qc)})}
export function useUpdateCashMovement(){const qc=useQueryClient();return useMutation({mutationFn:({id,...body}:UpdateCashMovementInput)=>api.patch<CashMovement>(`/api/v1/cash-movements/${id}`,body),onSuccess:()=>invalidateFinancial(qc)})}
export function useDeleteCashMovement(){const qc=useQueryClient();return useMutation({mutationFn:({id,version,correction_reason}:{id:string;version:number;correction_reason:string})=>api.delete<void>(`/api/v1/cash-movements/${id}`,{query:{version,correction_reason}}),onSuccess:()=>invalidateFinancial(qc)})}
export function useCreateExpenseTemplate(){const qc=useQueryClient();return useMutation({mutationFn:(body:ExpenseTemplateInput&{idempotency_key:string})=>api.post("/api/v1/expense-templates",body),onSuccess:()=>invalidateFinancial(qc)})}
export function useUpdateExpenseTemplate(){const qc=useQueryClient();return useMutation({mutationFn:({id,...body}:ExpenseTemplateInput&{id:string})=>api.patch(`/api/v1/expense-templates/${id}`,body),onSuccess:()=>invalidateFinancial(qc)})}
export function useSetExpenseTemplateActive(){const qc=useQueryClient();return useMutation({mutationFn:({id,active,version}:{id:string;active:boolean;version:number})=>active?api.post(`/api/v1/expense-templates/${id}/reactivate`,undefined,{query:{version}}):api.delete(`/api/v1/expense-templates/${id}`,{query:{version}}),onSuccess:()=>invalidateFinancial(qc)})}

export function useRecordCashEntry() {
  const q = useQueryClient();
  return useMutation({ mutationFn: (input: { amount: number; movement_on: string; reason: string; cash_drawer_id?: string; idempotency_key: string }) => api.post("/api/v1/cash-movements", { ...input, movement_type: "cash_in" }), onSuccess: () => invalidateFinancial(q) });
}

async function fetchAllFinancialRows<T extends { id: string }>(path: string, filters: Record<string, string | number | undefined> = {}) {
  const items: T[] = []; const seen = new Set<string>(); let total = 0;
  for (let page = 1; ; page++) {
    const response = await api.get<{ items: T[]; total?: number }>(path, { query: { ...filters, page, page_size: 200 } });
    total = response.total ?? items.length + response.items.length;
    for (const item of response.items) {
      if (seen.has(item.id)) throw new Error("La lista cambió mientras se cargaba. Intenta de nuevo.");
      seen.add(item.id); items.push(item);
    }
    if (items.length >= total || (!response.total && response.items.length < 200)) break;
    if (!response.items.length) throw new Error("No pudimos cargar la lista completa. Intenta de nuevo.");
  }
  return { items, total, page: 1, page_size: items.length };
}

export async function findPurchaseForCashMovement(movementID: string): Promise<InventoryPurchase> {
  const response = await fetchAllFinancialRows<InventoryPurchase>("/api/v1/inventory-purchases", { status: "paid" });
  const purchase = response.items.find(item => item.cash_movement_id === movementID);
  if (!purchase) throw new Error("No encontramos la compra de esta salida. Actualiza el historial e intenta de nuevo.");
  return purchase;
}
