import { Link, useSearchParams } from "react-router-dom";
import { ExpensesWorkspace } from "@/pages/expenses/ExpensesPage";
import { useCashCloseReport } from "@/hooks/useCashClose";
import { CashMovementList, periodEntries, sessionFinished } from "./CashReview";
import { Button } from "@/components/ui/button";
import { DateInput } from "@/components/ui/date-input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { parseDateInput } from "@/lib/date-input";
import { todayIso } from "@/lib/dates";

export default function CashMovementsReviewPage() {
  const [params, setParams] = useSearchParams();
  const ledger = params.get("view") === "ledger";
  const returnToLedger = () => setParams(previous => {
    const next = new URLSearchParams(previous);
    next.set("view", "ledger");
    return next;
  });
  return <div className="p-4 sm:p-6 max-w-5xl mx-auto pb-24 space-y-5">
    <Link to="/reports/cash-close" className="text-sm text-muted-foreground hover:text-foreground">← Volver a Caja</Link>
    <h1 className="text-2xl font-bold">{ledger ? "Movimientos de caja" : "Revisar entradas y salidas"}</h1>
    {ledger ? <CashLedgerReview /> : <>
      {params.get("view") === "adjustments" && <Button variant="link" className="p-0 h-auto" onClick={returnToLedger}>← Volver a movimientos</Button>}
      <ExpensesWorkspace section="cash" embedded />
    </>}
  </div>;
}

function CashLedgerReview() {
  const [params, setParams] = useSearchParams();
  const date = parseDateInput(params.get("from") ?? "") || todayIso();
  const drawer = params.get("cash_drawer_id") || undefined;
  const current = params.get("period") === "current";
  const report = useCashCloseReport(date, drawer);
  const data = report.data;
  function update(values: Record<string, string | null>) {
    setParams(previous => {
      const next = new URLSearchParams(previous);
      for (const [key, value] of Object.entries(values)) {
        if (value == null) next.delete(key);
        else next.set(key, value);
      }
      return next;
    });
  }
  return <>
    <div className="flex flex-wrap items-end gap-3">
      <div className="space-y-1"><label htmlFor="cash-movements-date" className="text-sm font-medium">Fecha</label><DateInput id="cash-movements-date" context="recent" value={date} max={todayIso()} onValueChange={value => { if (value) update({ from: value, to: value, period: null }); }} className="w-44" /></div>
      {(data?.drawers?.length ?? 0) > 1 && <Select value={drawer ?? data?.cash_drawer_id} onValueChange={value => update({ cash_drawer_id: value })}><SelectTrigger className="w-48" aria-label="Caja de recepción"><SelectValue /></SelectTrigger><SelectContent>{data?.drawers?.map(d => <SelectItem key={d.id} value={d.id}>{d.name || d.code}{d.active === false ? " (desactivada)" : ""}</SelectItem>)}</SelectContent></Select>}
    </div>
    {report.isLoading ? <p role="status" className="py-12 text-center text-sm">Cargando movimientos…</p> : report.isError ? <p role="alert">No se pudieron cargar los movimientos. <Button variant="link" onClick={() => report.refetch()}>Reintentar</Button></p> : data && <section className="rounded-lg border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">{current ? "Caja actual" : "Todos los movimientos del día"}</h2>{current && <Button variant="link" className="h-auto p-0 text-xs" onClick={() => update({ period: null })}>Ver todo el día</Button>}</div>
      <CashMovementList key={`${date}:${data.cash_drawer_id}:${current}`} entries={current ? periodEntries(data, data.session, sessionFinished(data.session)) : data.entries ?? []} timezone={data.timezone} />
    </section>}
    <Button variant="outline" onClick={() => update({ view: "adjustments" })}>Corregir entradas y salidas</Button>
  </>;
}
