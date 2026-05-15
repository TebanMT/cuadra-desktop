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

// CashCloseExpense — un row de la sección "Gastos del día" dentro del corte.
// El operador necesita ver qué salió del cajón ese día (renta, sueldos,
// servicios) para que el neto del día tenga sentido.
export interface CashCloseExpense {
  id: string;
  category: string;
  description?: string | null;
  amount: number;
  payment_method: string;
}

export interface CashCloseReport {
  date: string;
  by_method: Record<PaymentMethod, number>;
  by_concept: Record<PaymentConcept, { total: number; count: number }>;
  refunds_total: number;
  refunds_count: number;
  total: number;
  // Gastos generales (BC expenses) capturados ese día. Cuando hay gastos
  // en efectivo, expenses_by_method.cash se descuenta del "efectivo
  // calculado por Tinta" al cerrar la caja.
  expenses: CashCloseExpense[];
  expenses_total: number;
  expenses_by_method: Record<string, number>;
  // net_total = total − refunds_total − expenses_total. Lo que
  // efectivamente se ganó el día.
  net_total: number;
  operators: CashCloseOperator[];
  closed?: {
    closed_at: string;
    counted_cash: number;
    diff: number;
    reason?: string | null;
    closed_by_name?: string | null;
  } | null;
}

export interface CloseCashRegisterInput {
  date: string;
  counted_cash: number;
  reason?: string;
}

export interface CloseCashRegisterResponse {
  closed_at: string;
  diff: number;
}

const KEYS = {
  report: (date: string) => ["cash-close", date] as const,
};

export function useCashCloseReport(date: string) {
  return useQuery<CashCloseReport>({
    queryKey: KEYS.report(date),
    queryFn: () => api.get<CashCloseReport>("/api/v1/cash-close", { query: { date } }),
    enabled: !!date,
  });
}

export function useCloseCashRegister() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CloseCashRegisterInput) =>
      api.post<CloseCashRegisterResponse>("/api/v1/cash-close", input),
    onSuccess: (_res, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.report(vars.date) });
    },
  });
}
