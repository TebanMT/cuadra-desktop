import { useState } from "react";
import { MissingPurchaseCostsDialog } from "@/components/reports/MissingPurchaseCostsDialog";
import { fmtDate } from "@/lib/dates";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/PagePrimitives";
import { financialResultIsPartial, scheduledBuckets, type PendingGroup } from "@/lib/expensesOverview";

type Metric = number | { value?: number; current?: number };
interface Report {
  income?: { total?: Metric }; outflows?: { total?: Metric }; period_result?: Metric;
  totals: { income?: Metric; outflows?: Metric; period_result?: Metric; net_result?: Metric; net?: Metric };
  integrity?: { status: string; missing_purchase_amount_count?: number; legacy_unlinked_purchases?: number; unclassified_cash_out_count?: number; unclassified_cash_out?: number };
}
const value = (m?: Metric) => typeof m === "number" ? m : m?.value ?? m?.current;
export function ExpenseOverview({ report, pending, purchaseCount, purchaseTotal, cashCount, paidCount, paidTotal, from, to, today, until, showScheduled, loading, error, fmt, onPending, onMovements }: {
  report?: Report; pending: { due_on: string; status: string; expected_amount: number }[];
  purchaseCount: number; purchaseTotal: number; cashCount: number; paidCount: number; paidTotal: number;
  from: string; to: string; today: string; until: string; showScheduled: boolean; loading: boolean; error: unknown;
  fmt(n: number): string; onPending(group: PendingGroup): void; onMovements(): void;
}) {
  const [costsOpen, setCostsOpen] = useState(false);
  if (loading) return <SectionCard><p className="py-10 text-center text-sm text-muted-foreground">Calculando el resumen…</p></SectionCard>;
  if (error || !report) return <SectionCard><p role="alert" className="text-destructive">No pudimos cargar el resumen. Intenta de nuevo.</p></SectionCard>;
  const income = value(report.income?.total ?? report.totals.income);
  const outflows = value(report.outflows?.total ?? report.totals.outflows);
  const result = value(report.period_result ?? report.totals.period_result ?? report.totals.net_result ?? report.totals.net);
  const partial = financialResultIsPartial({ canonical: !!((report.income && report.outflows && report.period_result != null) || (report.totals.outflows != null && report.totals.period_result != null)), integrity: report.integrity, income, outflows, result });
  const groups = scheduledBuckets(showScheduled ? pending : [], today, until);
  const missing = report.integrity?.missing_purchase_amount_count ?? report.integrity?.legacy_unlinked_purchases ?? 0;
  const unclassified = report.integrity?.unclassified_cash_out_count ?? report.integrity?.unclassified_cash_out ?? 0;
  const sum = (rows: typeof pending) => rows.reduce((total, row) => total + Math.round(row.expected_amount * 100), 0) / 100;
  const reportLink = `/reports?range=custom&from=${from}&to=${to}`;
  return <div className="space-y-5">
    {costsOpen && <MissingPurchaseCostsDialog from={from} to={to} onClose={() => setCostsOpen(false)} />}
    <p className="text-sm text-muted-foreground">Período: {fmtDate(from)} al {fmtDate(to)}</p>
    <div className="grid gap-3 sm:grid-cols-3">
      {[["Ingresos", income], ["Salidas", outflows], [partial ? "Resultado parcial" : "Resultado del período", result]].map(([label, amount], i) => <Link key={String(label)} to={reportLink} className={`rounded-lg border p-4 space-y-2 hover:bg-muted/30 focus-visible:ring-2 focus-visible:ring-ring ${i === 2 && partial ? "border-amber-400 bg-amber-50/40 dark:bg-amber-950/20" : ""}`}><p className="text-sm text-muted-foreground">{label}</p><strong className="block text-2xl tabular-nums">{typeof amount === "number" ? fmt(amount) : "Sin datos"}</strong><span className="text-xs text-muted-foreground">{i === 0 ? "Cobros registrados" : i === 1 ? "Gastos, compras pagadas y devoluciones" : "Ingresos menos salidas"} · Ver detalle →</span></Link>)}
    </div>
    {partial && <div role="status" className="rounded-md border border-amber-300 p-4 space-y-2"><p className="text-sm">{missing > 0 ? `Falta completar el importe de ${missing} compra${missing === 1 ? "" : "s"}.` : unclassified > 0 ? `Hay ${unclassified} salida${unclassified === 1 ? "" : "s"} de caja por revisar.` : "Faltan datos para calcular el resultado completo. Consulta el detalle."}</p><>{missing > 0 ? <Button variant="outline" size="sm" onClick={() => setCostsOpen(true)}>Completar costos</Button> : <Button variant="outline" size="sm" asChild><Link to={unclassified > 0 ? `/reports/cash-close/movements?from=${from}&to=${to}` : reportLink}>{unclassified > 0 ? "Revisar salidas" : "Ver detalle"}</Link></Button>}</></div>}
    <p className="text-xs text-muted-foreground">Los pagos pendientes aún no se descuentan del resultado.</p>
    <SectionCard title="Por pagar y revisar">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {(showScheduled ? ([ ["overdue", "Vencidos", groups.overdue], ["today", "Por pagar hoy", groups.today], ["upcoming", "Próximos 30 días", groups.upcoming] ] as const) : []).map(([id, label, rows]) => <button type="button" key={id} onClick={() => onPending(id)} className="rounded-md border p-3 text-left hover:bg-muted/30"><span className="block text-sm">{label}</span><strong className="block mt-1 tabular-nums">{fmt(sum(rows))}</strong><small className="text-muted-foreground">{rows.length} {rows.length === 1 ? "pago" : "pagos"}{id === "upcoming" ? ` · después de hoy y hasta ${fmtDate(until)}` : ""}</small></button>)}
        <button type="button" onClick={() => onPending("purchases")} className="rounded-md border p-3 text-left hover:bg-muted/30"><span className="block text-sm">Compras por pagar</span><strong className="block mt-1 tabular-nums">{fmt(purchaseTotal)}</strong><small className="text-muted-foreground">{purchaseCount} {purchaseCount === 1 ? "compra recibida" : "compras recibidas"}</small></button>
        <button type="button" onClick={() => onPending("cash")} className="rounded-md border p-3 text-left hover:bg-muted/30"><span className="block text-sm">Salidas de caja por revisar</span><strong className="block mt-1">{cashCount}</strong><small className="text-muted-foreground">Ya se descontaron de caja</small></button>
      </div>
      {showScheduled && groups.overdue.length === 0 && <p className="mt-3 text-sm text-muted-foreground">Sin pagos programados vencidos.</p>}
    </SectionCard>
    <button type="button" className="flex w-full items-center justify-between rounded-lg border p-4 text-left hover:bg-muted/30" onClick={onMovements}><span><strong className="text-sm">Gastos pagados</strong><small className="block text-muted-foreground">{paidCount} movimientos del período · Ver gastos →</small></span><strong className="tabular-nums">{fmt(paidTotal)}</strong></button>
  </div>;
}
