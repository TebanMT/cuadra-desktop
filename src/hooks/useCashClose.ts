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

export interface CashCloseReport {
  date: string;
  by_method: Record<PaymentMethod, number>;
  by_concept: Record<PaymentConcept, { total: number; count: number }>;
  refunds_total: number;
  total: number;
  operators: CashCloseOperator[];
  closed?: {
    closed_at: string;
    counted_cash: number;
    diff: number;
    reason?: string;
    closed_by_name?: string;
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
