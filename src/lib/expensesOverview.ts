export type PendingGroup = "all" | "overdue" | "today" | "upcoming" | "purchases" | "cash";
export const pendingGroupLabels: Record<PendingGroup, string> = { all: "Todos los pendientes", overdue: "Pagos vencidos", today: "Por pagar hoy", upcoming: "Próximos 30 días", purchases: "Compras por pagar", cash: "Salidas por revisar" };
export function scheduledBuckets<T extends { due_on: string; status: string; expected_amount: number }>(items: T[], today: string, until: string) {
  const pending = items.filter(i => i.status === "pending");
  return { overdue: pending.filter(i => i.due_on < today), today: pending.filter(i => i.due_on === today), upcoming: pending.filter(i => i.due_on > today && i.due_on <= until) };
}
export function financialResultIsPartial({ canonical, integrity, income, outflows, result }: { canonical: boolean; integrity?: { status: string }; income?: number; outflows?: number; result?: number }) {
  return !canonical || !integrity || integrity.status !== "complete" || income == null || outflows == null || result == null || !Number.isFinite(income) || !Number.isFinite(outflows) || !Number.isFinite(result) ||
    Math.abs(Math.round(income * 100) - Math.round(outflows * 100) - Math.round(result * 100)) >= 1;
}
