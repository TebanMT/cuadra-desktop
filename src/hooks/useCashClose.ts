import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import type { PaymentConcept, PaymentMethod } from "./useBilling";

export interface CashCloseOperator {
  operator_id: string;
  operator_name: string;
  total: number;
  payments_count: number;
  sales_count: number;
}

// CashCloseExpense — gasto explícitamente pagado desde la Caja del día.
export interface CashCloseExpense {
  id: string;
  category: string;
  description?: string | null;
  amount: number;
  payment_method: string;
}

export type CashSessionStatus =
  | "open"
  | "closed_unverified"
  | "reconciled"
  | "stale"
  | "withdrawn";

export interface CashSessionSnapshot {
  current_expected_cash?: number | null;
  finished_at?: string | null;
  closed_by_name?: string | null;
  discrepancy_reason?: string | null;
  id: string;
  drawer_id?: string;
  drawer_code: string;
  operational_date: string;
  sequence: number;
  status: CashSessionStatus;
  opening_cash: number;
  opening_cash_known: boolean;
  activity_cash: number;
  expected_cash: number;
  counted_cash: number | null;
  difference: number | null;
  cash_left: number | null;
  withdrawn_cash: number | null;
  withdrawal_destination?: "gym_fund" | null;
  opened_at?: string | null;
  closed_at?: string | null;
  reconciled_at?: string | null;
  stale_at?: string | null;
  withdrawn_at?: string | null;
  is_stale?: boolean;
  adjusted_after_withdrawal?: boolean;
  integrity_note?: string | null;
  uncovered_cash_activity?: number;
  requires_new_session?: boolean;
  // El dueño cerró este día pasado sin conteo. Nunca trae diferencia; deja de
  // pedir atención hasta que llegue actividad nueva.
  reviewed_without_count?: boolean;
  reviewed_at?: string | null;
  review_note?: string | null;
  // Primera apertura del día comparada con lo que quedó en el último corte.
  // opening_difference = apertura − esperado (negativo: faltó efectivo).
  opening_expected_cash?: number | null;
  opening_difference?: number | null;
  opening_note?: string | null;
}

/** Lo que debería haber al abrir hoy: lo que quedó en el último corte más el efectivo que se movió después. */
export interface CashOpeningReference {
  last_count_date: string;
  cash_left: number;
  later_cash: number;
  expected: number;
}

export interface CashDrawerSummary {
  id: string;
  code: string;
  name?: string;
  active?: boolean;
  is_main?: boolean;
  activity_cash: number;
  has_activity: boolean;
  session_count: number;
}

export interface CashLedgerEntry {
  id: string;
  recorded_at: string;
  amount: number;
  concept: string;
  reason: string;
  operator_name: string;
}

export interface CashCloseReport {
  timezone?: string;
  entries?: CashLedgerEntry[];
  suggested_opening_cash?: number | null;
  opening_reference?: CashOpeningReference | null;
  date: string;
  cash_drawer_id?: string;
  drawers?: CashDrawerSummary[];
  session?: CashSessionSnapshot | null;
  sessions?: CashSessionSnapshot[];
  // Actividad física ocurrida después del retiro de la última sesión. No se
  // mezcla con su snapshot: debe cerrarse en una nueva secuencia.
  uncovered_cash_activity?: number;
  requires_new_session?: boolean;
  // Día pasado con efectivo sin conteo vigente: el dueño puede cerrarlo con
  // una nota (POST /cash-close/review).
  pending_review?: boolean;
  // by_method, by_concept, refunds_*, total and operators are absent (not
  // zero) for an operator without "view_totals"; the drawer figures stay.
  by_method?: Record<PaymentMethod, number>;
  by_concept?: Record<PaymentConcept, { total: number; count: number }>;
  // refunds_total y refund_by_method vienen en MAGNITUD POSITIVA (el BE los
  // negocia desde el dominio, que los guarda negativos). Los refunds en
  // efectivo (refund_by_method.cash) salen físicamente del cajón, así que se
  // restan del "efectivo calculado" al cerrar.
  refunds_total?: number;
  refund_by_method?: Record<string, number>;
  refunds_count?: number;
  total?: number;
  // Sólo gastos cuyo origen es cash_drawer; Fondo y Externo no pertenecen
  // a la conciliación del cajón.
  expenses: CashCloseExpense[];
  expenses_total: number;
  expenses_by_method: Record<string, number>;
  cash_movements: {
    id: string;
    movement_type: "cash_in" | "cash_out";
    reason: string;
    amount: number;
    operator_id: string;
    classification_status:
      | "unclassified"
      | "expense"
      | "inventory_purchase"
      | "non_operating";
    version?: number;
    recorded_at?: string;
  }[];
  cash_in_total: number;
  cash_out_total: number;
  // net_total = total − refunds_total − gastos pagados desde la caja.
  net_total: number;
  operators?: CashCloseOperator[];
  closed?: {
    closed_at: string;
    calculated_cash?: number;
    current_calculated_cash?: number;
    counted_cash: number | null;
    diff: number | null;
    is_outdated?: boolean;
    reason?: string | null;
    closed_by_name?: string | null;
  } | null;
}

export type CashPendingReason = "no_opening" | "open" | "not_counted" | "changed" | "after_close";

// Día reciente (o de hoy) con efectivo sin un corte vigente.
export interface CashPendingDay {
  date: string;
  is_today: boolean;
  cash_drawer_id: string;
  drawer_name: string;
  is_main_drawer: boolean;
  reason: CashPendingReason;
  expected_cash?: number | null;
  uncovered_cash: number;
  // Nadie tocó la caja desde ese día: contarla ahora es el corte de ese día.
  count_now: boolean;
  session?: CashSessionSnapshot | null;
}

export interface CloseCashRegisterInput {
  expected_cash?: number;
  session_id?: string;
  finish?: boolean;
  date: string;
  cash_drawer_id?: string;
  opening_cash?: number;
  counted_cash?: number | null;
  discrepancy_reason?: string;
  cash_left?: number;
  withdraw?: boolean;
}

export interface CloseCashRegisterResponse {
  cash_close_id: string;
  calculated_cash: number;
  counted_cash?: number | null;
  discrepancy?: number | null;
  session?: CashSessionSnapshot;
}

export interface CreateCashMovementInput {
  movement_on: string;
  amount: number;
  movement_type: "cash_in" | "cash_out";
  reason: string;
  cash_drawer_id?: string;
  idempotency_key: string;
  purpose?: "expense" | "non_operating";
  category?: string;
}

export interface CashMovementResponse {
  id: string;
  version: number;
  movement_on: string;
  amount: number;
  movement_type: "cash_in" | "cash_out";
  reason: string;
  cash_drawer_id?: string | null;
  operator_id: string;
  classification_status:
    | "unclassified"
    | "expense"
    | "inventory_purchase"
    | "non_operating";
}

const KEYS = {
  report: (date: string | undefined, cashDrawerId?: string) =>
    ["cash-close", date ?? "current", cashDrawerId ?? "main"] as const,
};

export const cashPendingDaysKey = (includeToday: boolean) =>
  ["cash-close", "pending-days", includeToday ? "with-today" : "past"] as const;

export async function fetchCashPendingDays(includeToday: boolean) {
  const response = await api.get<{ items: CashPendingDay[] }>("/api/v1/cash-close/pending-days", {
    query: includeToday ? { include_today: true } : undefined,
  });
  return response.items ?? [];
}

// Recordatorio de la mañana: días recientes que quedaron sin corte.
export function useCashPendingDays() {
  return useQuery<CashPendingDay[]>({
    queryKey: cashPendingDaysKey(false),
    queryFn: () => fetchCashPendingDays(false),
    staleTime: 60_000,
  });
}

// Without a date, cloud/sidecar resolves today in the gym's timezone.
export function useCashCloseReport(date?: string, cashDrawerId?: string) {
  return useQuery<CashCloseReport>({
    queryKey: KEYS.report(date, cashDrawerId),
    queryFn: () => api.get<CashCloseReport>("/api/v1/cash-close", {
      query: { date, cash_drawer_id: cashDrawerId },
    }),
    enabled: date !== "",
  });
}

export function useCloseCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseCashRegisterInput) =>
      api.post<CloseCashRegisterResponse>("/api/v1/cash-close", input),
    onError: () => { qc.invalidateQueries({ queryKey: ["cash-close"] }); },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-close"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useReopenCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: string; cash_drawer_id?: string; reason: string }) =>
      api.post<void>("/api/v1/cash-close/reopen", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-close"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useReviewCashDay() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: string; cash_drawer_id?: string; note: string }) =>
      api.post<CashSessionSnapshot>("/api/v1/cash-close/review", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-close"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useReconcileCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      ...input
    }: {
      sessionId: string;
      finish?: boolean;
      counted_cash: number;
      discrepancy_reason?: string;
      correction_reason?: string;
    }) => api.post<CashSessionSnapshot>(`/api/v1/cash-sessions/${sessionId}/reconcile`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-close"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

export function useWithdrawCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({
      sessionId,
      ...input
    }: {
      sessionId: string;
      cash_left: number;
      destination?: "gym_fund";
    }) => api.post<CashSessionSnapshot>(`/api/v1/cash-sessions/${sessionId}/withdraw`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-close"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}

/** Records an outflow and its expense, when selected, in one transaction. */
export function useCreateCashMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateCashMovementInput) =>
      api.post<CashMovementResponse>("/api/v1/cash-movements", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-close"] });
      for (const key of [
        "cash-movements",
        "expenses",
        "reports",
        "dashboard",
        "analytics",
      ]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export type CashMovementSummary = CashCloseReport["cash_movements"][number];

/**
 * Whoever captured a movement can void it while its drawer is still open
 * (POST /cash-movements/:id/void). A movement paid as an expense takes its
 * expense with it.
 */
export function useVoidCashMovement() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, ...body }: { id: string; version: number; correction_reason: string }) =>
      api.post<void>(`/api/v1/cash-movements/${id}/void`, body),
    onSuccess: () => {
      for (const key of ["cash-close", "cash-movements", "expenses", "reports", "dashboard", "analytics"]) {
        qc.invalidateQueries({ queryKey: [key] });
      }
    },
  });
}

export function useOpenCashSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { date: string; cash_drawer_id?: string; opening_cash: number; opening_note?: string; sequence: number }) =>
      api.post<CashSessionSnapshot>("/api/v1/cash-sessions/open", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["cash-close"] });
      qc.invalidateQueries({ queryKey: ["reports"] });
    },
  });
}
