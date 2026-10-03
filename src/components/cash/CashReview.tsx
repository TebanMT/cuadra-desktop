import { useState } from "react";
import type { CashCloseReport, CashLedgerEntry, CashSessionSnapshot } from "@/hooks/useCashClose";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { fmtDate } from "@/lib/dates";

export function differenceLabel(value: number, fmt: (value: number) => string) {
  if (Math.abs(value) < 0.005) return "La caja cuadra";
  return `${value < 0 ? "Faltan" : "Sobran"} ${fmt(Math.abs(value))}`;
}

export function cashTime(value?: string | null, timezone?: string) {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("es-MX", { hour: "2-digit", minute: "2-digit", timeZone: timezone }).format(date);
}

export function sessionFinished(session?: CashSessionSnapshot | null) {
  return !!session?.finished_at || session?.status === "withdrawn";
}

export function periodEntries(report: CashCloseReport, session?: CashSessionSnapshot | null, afterLast = false) {
  const start = afterLast ? session?.finished_at ?? session?.withdrawn_at : session?.opened_at;
  const end = afterLast ? null : session?.finished_at ?? session?.withdrawn_at;
  return (report.entries ?? []).filter(entry => {
    const time = new Date(entry.recorded_at).getTime();
    return (!start || (afterLast ? time > new Date(start).getTime() : time >= new Date(start).getTime())) &&
      (!end || time <= new Date(end).getTime());
  });
}

const concepts: Record<string, string> = {
  membership: "Mensualidad", product: "Venta de productos", balance_settlement: "Abono",
  other: "Otro ingreso", refund: "Devolución", cash_in: "Entrada de efectivo", cash_out: "Salida de efectivo",
};

export function CashMovementList({ entries, timezone }: { entries: CashLedgerEntry[]; timezone?: string }) {
  const money = useMoneyVisibility();
  const [visible, setVisible] = useState(20);
  return <div>
    {!entries.length ? <p className="py-8 text-center text-sm text-muted-foreground">Sin movimientos de efectivo.</p> : <>
      <ul className="divide-y">
        {entries.slice(0, visible).map(entry => <li key={entry.id} className="flex items-start justify-between gap-4 py-3 text-sm">
          <div className="min-w-0"><p className="font-medium break-words">{entry.reason || concepts[entry.concept] || "Movimiento de efectivo"}</p>
            <p className="text-xs text-muted-foreground">{cashTime(entry.recorded_at, timezone)}{entry.operator_name && ` · ${entry.operator_name}`}</p></div>
          <span className={`shrink-0 tabular-nums font-medium ${entry.amount < 0 ? "text-destructive" : ""}`}>{entry.amount < 0 ? "−" : "+"}{money.fmt(Math.abs(entry.amount))}</span>
        </li>)}
      </ul>
      {entries.length > visible && <Button variant="ghost" className="w-full" onClick={() => setVisible(n => n + 20)}>Ver más movimientos</Button>}
    </>}
  </div>;
}

export function CashHistory({ report }: { report: CashCloseReport }) {
  const money = useMoneyVisibility();
  const [selected, setSelected] = useState<CashSessionSnapshot | null>(null);
  const sessions = (report.sessions ?? (report.session ? [report.session] : []))
    .filter(s => s.status !== "open" && (!report.cash_drawer_id || !s.drawer_id || s.drawer_id === report.cash_drawer_id));
  function result(s: CashSessionSnapshot) {
    if (s.is_stale || s.adjusted_after_withdrawal || s.status === "stale") return "Movimientos corregidos";
    if (!s.opening_cash_known) return "Sin efectivo inicial";
    return s.difference == null ? "Sin conteo" : differenceLabel(s.difference, money.fmt);
  }
  return <section className="w-full min-w-0 max-w-full overflow-hidden rounded-lg border bg-card">
    {!sessions.length ? <p className="py-12 text-center text-sm text-muted-foreground">No hay cortes en esta fecha.</p> : <><div className="divide-y sm:hidden">{[...sessions].reverse().map(s => <button key={s.id} type="button" aria-label={`Abrir corte ${s.sequence}`} className="block w-full p-4 text-left space-y-3 hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring" onClick={() => setSelected(s)}><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-medium">Corte {s.sequence} · {cashTime(s.finished_at ?? s.closed_at, report.timezone)}</p><p className="text-xs text-muted-foreground">{fmtDate(s.operational_date)} · {s.closed_by_name || "Sin responsable"}</p></div><span className="text-sm text-primary">Ver detalle</span></div><div className="grid grid-cols-2 gap-3 text-sm"><div><p className="text-xs text-muted-foreground">Esperado</p><p className="tabular-nums">{s.opening_cash_known ? money.fmt(s.expected_cash) : "—"}</p></div><div><p className="text-xs text-muted-foreground">Contado</p><p className="tabular-nums">{s.counted_cash == null ? "—" : money.fmt(s.counted_cash)}</p></div></div><p className="text-sm font-medium">{result(s)}</p></button>)}</div><div className="hidden overflow-x-auto sm:block">
      <table className="w-full text-sm"><thead className="text-left text-muted-foreground"><tr className="border-b"><th className="p-4 font-medium">Corte</th><th className="p-4 font-medium">Responsable</th><th className="p-4 text-right font-medium">Esperado</th><th className="p-4 text-right font-medium">Contado</th><th className="p-4 font-medium">Resultado</th><th><span className="sr-only">Detalle</span></th></tr></thead>
        <tbody>{[...sessions].reverse().map(s => <tr key={s.id} className="border-b last:border-0">
          <td className="p-4 whitespace-nowrap">{fmtDate(s.operational_date)}<span className="block text-xs text-muted-foreground">{cashTime(s.finished_at ?? s.closed_at, report.timezone)} · #{s.sequence}</span></td>
          <td className="p-4">{s.closed_by_name || "—"}</td><td className="p-4 text-right tabular-nums">{s.opening_cash_known ? money.fmt(s.expected_cash) : "—"}</td>
          <td className="p-4 text-right tabular-nums">{s.counted_cash == null ? "—" : money.fmt(s.counted_cash)}</td><td className="p-4 whitespace-nowrap">{result(s)}</td>
          <td className="p-3"><Button variant="ghost" size="sm" aria-label={`Ver corte ${s.sequence}`} onClick={() => setSelected(s)}>Ver detalle</Button></td>
        </tr>)}</tbody></table></div></>}
    <Dialog open={!!selected} onOpenChange={open => { if (!open) setSelected(null); }}><DialogContent className="w-[calc(100%_-_2rem)] max-w-xl max-h-[85vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Corte {selected?.sequence}</DialogTitle><DialogDescription>{selected && `${fmtDate(selected.operational_date)} · ${cashTime(selected.finished_at ?? selected.closed_at, report.timezone)}${selected.closed_by_name ? ` · ${selected.closed_by_name}` : ""}`}</DialogDescription></DialogHeader>
      {selected && <div className="space-y-5"><p className="font-medium">{result(selected)}</p>
        <dl className="grid grid-cols-2 gap-3 text-sm"><dt>Efectivo inicial</dt><dd className="text-right tabular-nums">{selected.opening_cash_known ? money.fmt(selected.opening_cash) : "Sin registrar"}</dd>
          <dt>Efectivo esperado</dt><dd className="text-right tabular-nums">{selected.opening_cash_known ? money.fmt(selected.expected_cash) : "—"}</dd>
          {selected.current_expected_cash != null && <><dt>Esperado tras la corrección</dt><dd className="text-right tabular-nums">{money.fmt(selected.current_expected_cash)}</dd></>}<dt>Efectivo contado</dt><dd className="text-right tabular-nums">{selected.counted_cash == null ? "Sin conteo" : money.fmt(selected.counted_cash)}</dd>
          <dt>Retirado</dt><dd className="text-right tabular-nums">{money.fmt(selected.withdrawn_cash ?? 0)}</dd>
          <dt>Se quedó en caja</dt><dd className="text-right tabular-nums">{selected.cash_left == null ? "Sin registrar" : money.fmt(selected.cash_left)}</dd></dl>
        {selected.discrepancy_reason && <p className="text-sm">Nota: {selected.discrepancy_reason}</p>}
        {(selected.is_stale || selected.adjusted_after_withdrawal || selected.status === "stale") && <p className="text-sm text-muted-foreground">Se corrigieron movimientos después del conteo. Revisa el detalle antes de dar por aclarada la diferencia.</p>}
        <div><h3 className="font-medium text-sm">Movimientos de este corte</h3><CashMovementList entries={periodEntries(report, selected)} timezone={report.timezone} /></div>
      </div>}
    </DialogContent></Dialog>
  </section>;
}
