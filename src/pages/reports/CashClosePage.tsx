import { PageContainer } from "@/components/shared/PagePrimitives";
import { DateInput } from "@/components/ui/date-input";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useEffect, useRef, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, Banknote, Loader2, Settings2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useCashCloseReport, useCashPendingDays, useCloseCashRegister, useCreateCashMovement, useOpenCashSession, useReconcileCashSession, useReviewCashDay, useVoidCashMovement, useWithdrawCashSession, type CashCloseReport, type CashLedgerEntry, type CashMovementSummary, type CashOpeningReference, type CashPendingDay, type CashSessionSnapshot } from "@/hooks/useCashClose";
import { expenses as expenseStrings, EXPENSE_CATEGORIES, type ExpenseCategory } from "@/strings/expenses";
import { fmtMoney } from "@/hooks/useBilling";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { ApiError } from "@/lib/api";
import { fmtDate, fmtIso, parseDate, todayIso } from "@/lib/dates";
import { cashDifference, cashWithdrawal } from "@/lib/cashSessionMath";
import { moneyInputError } from "@/lib/moneyInput";
import { CashDrawerManager } from "@/components/cash/CashDrawerManager";
import { CashHistory, CashMovementList, cashDayLedgerSearch, cashMovementReviewSearch, differenceLabel, periodEntries, sessionFinished } from "@/components/cash/CashReview";
import { parseDateInput } from "@/lib/date-input";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePermission } from "@/lib/permissions";
import { RestrictedNote } from "@/components/shared/RestrictedNote";
import { keyForPayload } from "@/lib/idempotency";
import { HelpHint } from "@/components/shared/HelpHint";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return error.message || fallback;
  return fallback;
}

function validCash(raw: string) {
  return raw.trim() !== "" && /^\d+(?:\.\d{1,2})?$/.test(raw.trim()) && Number(raw) <= 9_999_999_999.99;
}

export default function CashClosePage() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const linkedDate = params.get("tab") === "history" ? parseDateInput(params.get("date") ?? "") || undefined : undefined;
  const [tab, setTab] = useState(params.get("tab") === "history" ? "history" : "current");
  const [historyDate, setHistoryDate] = useState<string | undefined>(linkedDate);
  const [drawer, setDrawer] = useState<string | undefined>(() => (linkedDate && params.get("cash_drawer_id")) || undefined);
  const [manager, setManager] = useState(false);
  // Without "view_totals" the backend serves only today's caja: the
  // history stays on today, whatever the link or a past choice said.
  const canViewTotals = usePermission("view_totals");
  const historyDay = canViewTotals ? historyDate : undefined;
  const report = useCashCloseReport(tab === "current" ? undefined : historyDay, drawer);
  const date = report.data?.date ?? historyDay ?? "";
  const today = todayIso(report.data?.timezone);
  const isOwner = useAuthStore(s => s.user?.role === "owner");
  return <PageContainer className="space-y-5 pb-20">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold tracking-tight">Caja</h1><p className="text-sm text-muted-foreground">{fmtDate(date)}</p></div>
      <div className="flex flex-wrap items-center gap-2"><HelpHint topic="caja" task="contar y cerrar caja" />{isOwner && <Button asChild variant="outline"><Link to="/reports/cash-close/summary?return_to=cash">Resumen por período</Link></Button>}{(report.data?.drawers?.length ?? 0) > 1 && <Select value={drawer ?? report.data?.cash_drawer_id} onValueChange={setDrawer}><SelectTrigger className="w-44" aria-label="Caja de recepción"><SelectValue /></SelectTrigger><SelectContent>{report.data?.drawers?.map(d => <SelectItem key={d.id} value={d.id}>{d.name || d.code}{d.active === false ? " (desactivada)" : ""}</SelectItem>)}</SelectContent></Select>}
        {isOwner && <Button requiresWrite variant="ghost" size="icon" title="Administrar cajas" aria-label="Administrar cajas" onClick={() => setManager(true)}><Settings2 className="h-4 w-4" /></Button>}</div>
    </div>
    <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="current">Caja actual</TabsTrigger><TabsTrigger value="history">Historial de cortes</TabsTrigger></TabsList>
      {tab === "history" && !canViewTotals && <RestrictedNote permission="view_totals" className="mt-5">Ves solo los cortes de hoy.</RestrictedNote>}
      {tab === "history" && canViewTotals && <div className="flex flex-wrap items-center gap-3 mt-5"><Label htmlFor="cash-history-date">Fecha</Label><DateInput id="cash-history-date" context="recent" value={historyDate ?? date} max={today} today={today} onValueChange={e => setHistoryDate(e || today)} className="w-44" />
        {isOwner && <Button asChild variant="link" className="h-auto p-0 min-h-11"><Link to={`/reports/cash-close/movements?${cashDayLedgerSearch(historyDate ?? date, drawer ?? report.data?.cash_drawer_id)}`}>Ver movimientos del día</Link></Button>}</div>}
      {report.isLoading ? <div role="status" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Cargando caja</span></div> : report.isError ? <Alert variant="destructive"><AlertDescription>No pudimos cargar la caja. <Button variant="link" onClick={() => report.refetch()}>Reintentar</Button></AlertDescription></Alert> : report.data && <>
        <TabsContent value="current" className="space-y-4"><PendingDaysNotice today={today} multipleDrawers={(report.data.drawers?.length ?? 0) > 1} onOpenDay={(day, drawerId) => { setHistoryDate(day); setDrawer(drawerId); setTab("history"); }} /><ReportView key={`${date}:${report.data.cash_drawer_id}`} report={report.data} date={date} onReview={() => navigate(`/reports/cash-close/movements?${cashMovementReviewSearch(date, report.data?.cash_drawer_id)}`)} canClose={report.data.drawers?.find(d => d.id === report.data?.cash_drawer_id)?.active !== false} onHistory={() => { setHistoryDate(date); setTab("history"); }} /></TabsContent>
        <TabsContent value="history" className="space-y-4">{isOwner && report.data.pending_review && date < today && <PendingDayReview key={`${date}:${report.data.cash_drawer_id}`} report={report.data} date={date} />}<CashHistory report={report.data} /></TabsContent>
      </>}
    </Tabs>
    <CashDrawerManager open={manager} onOpenChange={setManager} />
  </PageContainer>;
}

export function ReportView({ report, date, canClose, onHistory, onReview }: { report: CashCloseReport; date: string; canClose: boolean; onHistory?(): void; onReview?(): void }) {
  const isOwner = useAuthStore(s => s.user?.role === "owner");
  // Taking cash out of the drawer (an outflow, a withdrawal) needs the
  // operator's "cash_out" permission. Adding cash and the count stay open.
  const canCashOut = usePermission("cash_out");
  // The day's totals by method and operator need "view_totals"; the
  // backend leaves them out otherwise, so never paint them as $0.
  const canViewTotals = usePermission("view_totals");
  const showDaySummary = canViewTotals && report.by_method != null;
  const userId = useAuthStore(s => s.user?.user_id);
  const [opening, setOpening] = useState(false);
  const [voiding, setVoiding] = useState<CashMovementSummary | null>(null);
  const [closing, setClosing] = useState<CashSessionSnapshot | null>(null);
  const [withdrawing, setWithdrawing] = useState(false);
  const [movementType, setMovementType] = useState<"cash_in" | "cash_out" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const openSession = useOpenCashSession();
  const money = useMoneyVisibility();
  const session = report.session;
  const finished = sessionFinished(session);
  const known = finished ? session?.cash_left != null : session?.opening_cash_known === true;
  const drawerId = report.cash_drawer_id ?? session?.drawer_id;
  const expected = finished ? (session?.cash_left ?? 0) + (report.uncovered_cash_activity ?? 0) : session?.expected_cash ?? 0;
  const needsOpening = !session;
  // Cash that moved today before anyone opened the drawer: it must not be
  // counted again as opening cash.
  const priorCash = needsOpening ? report.uncovered_cash_activity ?? 0 : 0;
  const canCount = !!session && known && (!finished || report.requires_new_session === true);
  // Conteo a ciegas: el personal ve lo que debía haber sólo después de contar.
  // El dueño conserva el número para responder "¿cuánto debería haber?".
  const blind = !isOwner && canCount;
  const canWithdraw = session?.status === "reconciled" && !session.is_stale && !session.adjusted_after_withdrawal && !report.requires_new_session;
  const entries = periodEntries(report, session, finished);
  // Own movements of the session still open: the operator can take back a
  // capture error before the count carries their name.
  const ownOpenMovements = new Map(session?.status === "open" && !finished && userId
    ? (report.cash_movements ?? []).filter(m => m.operator_id === userId && m.version != null && m.classification_status !== "inventory_purchase").map(m => [m.id, m])
    : []);

  async function startCount() {
    if (!session) return;
    setError(null);
    try {
      const target = finished ? await openSession.mutateAsync({ date, cash_drawer_id: drawerId, opening_cash: session.cash_left!, sequence: session.sequence + 1 }) : session;
      // The response carries the recorded opening; include already-registered activity in the preview.
      setClosing(finished ? { ...target, expected_cash: expected } : target);
    } catch (err) { setError(errorMessage(err, "No pudimos preparar el corte. Actualiza la caja e intenta de nuevo.")); }
  }

  return <div className="space-y-5 pt-2">
    <section className="rounded-xl border bg-card p-5 sm:p-6 space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">{blind ? (finished ? "Quedó en caja" : "Efectivo inicial") : "Efectivo esperado"}</p><strong className="mt-1 block font-display tabular text-4xl">{known ? money.fmt(blind ? (finished ? session?.cash_left ?? 0 : session?.opening_cash ?? 0) : expected) : "—"}</strong>
        {!known && <p className="text-sm text-muted-foreground mt-2">{needsOpening && priorCash !== 0 ? "Ya hubo movimientos de efectivo hoy. Abre la caja con lo que había antes de ellos." : "Registra el efectivo con el que empezó la caja."}</p>}
        {blind && <p className="text-xs text-muted-foreground mt-2">Cuánto debería haber lo verás al hacer el corte, después de contar.</p>}
        {known && !blind && <p className="text-xs text-muted-foreground mt-2">{finished ? "Quedó en caja" : "Efectivo inicial"}: {money.fmt(finished ? session?.cash_left ?? 0 : session?.opening_cash ?? 0)}</p>}
        {known && !finished && session?.opening_difference != null && <p className="text-xs text-warning-foreground mt-1">Al abrir: {differenceLabel(session.opening_difference, money.fmt)} respecto al corte anterior.</p>}
      </div>
        {canClose && (needsOpening ? <Button requiresWrite size="lg" onClick={() => setOpening(true)}>Abrir caja</Button> : canCount ? <Button requiresWrite size="lg" onClick={startCount} disabled={openSession.isPending}><Banknote className="h-4 w-4" />Hacer corte</Button> : finished && <Button requiresWrite size="lg" variant="outline" onClick={() => setOpening(true)}>Abrir caja de nuevo</Button>)}
      </div>
      {finished && <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm"><span>Último corte: {session?.is_stale || session?.adjusted_after_withdrawal || session?.status === "stale" ? "movimientos corregidos" : session?.difference == null ? "guardado" : differenceLabel(session.difference, money.fmt)}</span>{onHistory && <Button variant="link" className="h-auto p-0 min-h-11" onClick={onHistory}>Ver corte</Button>}</div>}
      {canClose && (() => {
        const movementButtons = <><Button requiresWrite variant={needsOpening ? "ghost" : "outline"} onClick={() => setMovementType("cash_in")}><ArrowDownToLine className="h-4 w-4" />Agregar efectivo</Button>{canCashOut && <Button requiresWrite variant={needsOpening ? "ghost" : "outline"} onClick={() => setMovementType("cash_out")}><ArrowUpFromLine className="h-4 w-4" />Registrar salida</Button>}{canCashOut && canWithdraw && <Button requiresWrite variant="ghost" onClick={() => setWithdrawing(true)}>Retirar efectivo</Button>}</>;
        // Con la caja sin abrir, «Abrir caja» es el único paso a la vista.
        // Los movimientos previos siguen disponibles (el flujo los acepta y
        // la apertura los descuenta), pero detrás de una pregunta que dice
        // cuándo se usan, para que nadie registre un ingreso en lugar de abrir.
        return needsOpening
          ? <details className="border-t pt-3"><summary className="flex min-h-11 cursor-pointer items-center text-sm text-muted-foreground">¿Entró o salió efectivo antes de abrir la caja?</summary><div className="space-y-2 pb-1"><p className="text-sm text-muted-foreground">Regístralo aquí y después abre la caja con lo que había antes de ese movimiento.</p><div role="group" aria-label="Movimientos antes de abrir" className="-ml-3 flex flex-wrap gap-1">{movementButtons}</div></div></details>
          : <div role="group" aria-label="Movimientos de efectivo" className="flex flex-wrap gap-2">{movementButtons}</div>;
      })()}
      {canClose && !canCashOut && <RestrictedNote permission="cash_out">No puedes registrar salidas ni retiros de efectivo.</RestrictedNote>}
    </section>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <section className="rounded-lg border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Movimientos de caja</h2>{isOwner && onReview && <Button variant="link" className="h-auto p-0 text-xs min-h-11" onClick={onReview}>Revisar movimientos</Button>}</div><CashMovementList entries={entries} timezone={report.timezone} canVoid={(entry: CashLedgerEntry) => ownOpenMovements.has(entry.id)} onVoid={(entry: CashLedgerEntry) => setVoiding(ownOpenMovements.get(entry.id) ?? null)} /></section>
    {showDaySummary && <details className="rounded-lg border"><summary className="cursor-pointer p-4 text-sm font-medium">Resumen del día</summary><div className="p-4 pt-0 space-y-4">
      <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Cobros en efectivo</dt><dd className="text-right tabular-nums">{money.fmt(report.by_method?.cash ?? 0)}</dd><dt>Tarjeta</dt><dd className="text-right tabular-nums">{money.fmt(report.by_method?.card ?? 0)}</dd><dt>Transferencias</dt><dd className="text-right tabular-nums">{money.fmt(report.by_method?.transfer ?? 0)}</dd><dt>Devoluciones en efectivo</dt><dd className="text-right tabular-nums">{money.fmt(report.refund_by_method?.cash ?? 0)}</dd></dl>
      <p className="text-xs text-muted-foreground">Tarjetas y transferencias son del gimnasio; no cambian el efectivo de esta caja.</p>
      {!!report.operators?.length && <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-sm">{report.operators.map(o => <div key={o.operator_id} className="contents"><dt>{o.operator_name}</dt><dd className="text-right tabular-nums">{money.fmt(o.total)}</dd></div>)}</dl>}
    </div></details>}
    {!canViewTotals && <RestrictedNote permission="view_totals" className="px-1">El resumen del día, con los cobros por método de pago y por operador, no está disponible.</RestrictedNote>}
    <OpenCashModal open={opening} onOpenChange={setOpening} date={date} drawerId={drawerId} sequence={finished ? session!.sequence + 1 : 1} suggested={finished ? session?.cash_left : report.suggested_opening_cash} locked={finished} priorCash={priorCash} reference={finished ? null : report.opening_reference} />
    <CloseCashModal session={closing && report.session?.id === closing.id && !sessionFinished(report.session) ? report.session : closing} onClose={() => setClosing(null)} date={date} drawerId={drawerId} />
    <WithdrawCashModal open={withdrawing} onOpenChange={setWithdrawing} session={session ?? null} />
    <CashMovementModal open={movementType != null} onOpenChange={value => { if (!value) setMovementType(null); }} date={date} movementType={movementType ?? "cash_in"} drawerId={drawerId} />
    <VoidMovementDialog movement={voiding} onClose={() => setVoiding(null)} />
  </div>;
}

function VoidMovementDialog({ movement, onClose }: { movement: CashMovementSummary | null; onClose(): void }) {
  const voidMovement = useVoidCashMovement();
  const money = useMoneyVisibility();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    if (!movement) return;
    setReason("");
    setError(null);
  }, [movement]);
  const isOut = movement?.movement_type === "cash_out";
  const isExpense = movement?.classification_status === "expense";
  const trimmed = reason.trim();
  const valid = trimmed.length >= 3 && trimmed.length <= 200;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!movement || movement.version == null || !valid || voidMovement.isPending) return;
    setError(null);
    try {
      await voidMovement.mutateAsync({ id: movement.id, version: movement.version, correction_reason: trimmed });
      toast.success("Movimiento anulado. Si el monto era otro, regístralo de nuevo.");
      onClose();
    } catch (err) {
      setError(errorMessage(err, "No pudimos anular el movimiento. Actualiza la caja e intenta de nuevo."));
    }
  }

  return <Dialog busy={voidMovement.isPending} open={!!movement} onOpenChange={open => { if (!open) onClose(); }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>{isOut ? "¿Anular esta salida?" : "¿Anular esta entrada?"}</DialogTitle>
        <DialogDescription>{movement && `${movement.reason} · ${isOut ? "−" : "+"}${money.fmt(movement.amount)}. `}Deja de contar en la caja{isExpense ? " y se anula el gasto que registró" : ""}. El dueño verá que lo anulaste y el motivo.</DialogDescription>
      </DialogHeader>
      <form className="space-y-4" onSubmit={submit} noValidate>
        {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="space-y-1">
          <Label htmlFor="void-movement-reason">¿Qué pasó?</Label>
          <Textarea id="void-movement-reason" maxLength={200} rows={2} value={reason} disabled={voidMovement.isPending} placeholder="Ej. escribí $500 en vez de $50" onChange={event => setReason(event.target.value)} />
        </div>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" onClick={onClose} disabled={voidMovement.isPending}>Cancelar</Button>
          <Button requiresWrite type="submit" variant="destructive" disabled={!valid || voidMovement.isPending}>
            {voidMovement.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            Anular movimiento
          </Button>
        </div>
      </form>
    </DialogContent>
  </Dialog>;
}

function pendingReasonText(day: CashPendingDay, fmt: (value: number) => string, showExpected: boolean) {
  switch (day.reason) {
    case "open": return showExpected && day.expected_cash != null ? `la caja quedó abierta sin corte (esperado ${fmt(day.expected_cash)})` : "la caja quedó abierta sin corte";
    case "not_counted": return "el corte se guardó sin contar el efectivo";
    case "changed": return "cambiaron movimientos después del corte";
    case "no_opening": return `hubo ${fmt(Math.abs(day.uncovered_cash))} en efectivo sin abrir la caja`;
    case "after_close": return `hubo ${fmt(Math.abs(day.uncovered_cash))} en efectivo después del último corte`;
  }
}

function pendingDayLabel(date: string, today: string) {
  const yesterday = parseDate(today);
  if (yesterday) yesterday.setDate(yesterday.getDate() - 1);
  return yesterday && fmtIso(yesterday) === date ? "Ayer" : fmtDate(date);
}

const PENDING_VISIBLE = 3;

// Morning reminder: recent days left without a valid count. An untouched
// drawer can still be counted now; otherwise only the owner can close it.
export function PendingDaysNotice({ today, multipleDrawers, onOpenDay }: { today: string; multipleDrawers: boolean; onOpenDay(date: string, drawerId: string): void }) {
  const pending = useCashPendingDays();
  const isOwner = useAuthStore(s => s.user?.role === "owner");
  const money = useMoneyVisibility();
  const [counting, setCounting] = useState<CashPendingDay | null>(null);
  const days = (pending.data ?? []).filter(day => !day.is_today);
  if (!days.length) return null;
  const visible = days.slice(0, PENDING_VISIBLE);
  const canCount = visible.some(day => day.count_now && day.session);
  return <section aria-label="Cortes pendientes" className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-warning-foreground space-y-3">
    <div className="space-y-1"><h2 className="font-semibold">{days.length === 1 ? "Quedó un corte pendiente" : `Quedaron ${days.length} cortes pendientes`}</h2>
      {canCount && <p className="text-sm">Si nadie ha tocado la caja desde entonces, cuéntala ahora: el corte se guarda con la fecha de ese día.</p>}</div>
    <ul className="space-y-2">{visible.map(day => <li key={`${day.date}:${day.cash_drawer_id}`} className="flex flex-wrap items-center justify-between gap-2 text-sm">
      <span><strong className="font-medium">{pendingDayLabel(day.date, today)}{multipleDrawers || !day.is_main_drawer ? ` · ${day.drawer_name}` : ""}:</strong> {pendingReasonText(day, money.fmt, isOwner)}</span>
      <span className="flex flex-wrap gap-2">{day.count_now && day.session && <Button requiresWrite size="sm" onClick={() => setCounting(day)}>Contar ahora</Button>}
        {isOwner && <Button size="sm" variant="outline" onClick={() => onOpenDay(day.date, day.cash_drawer_id)}>Revisar</Button>}</span>
    </li>)}</ul>
    {days.length > PENDING_VISIBLE && <p className="text-sm">Y {days.length - PENDING_VISIBLE} más en el historial de cortes.</p>}
    {!isOwner && visible.some(day => !day.count_now) && <p className="text-sm">Avísale al dueño para que revise {visible.length === 1 ? "ese día" : "esos días"}.</p>}
    <CloseCashModal session={counting?.session ?? null} onClose={() => setCounting(null)} date={counting?.date ?? ""} drawerId={counting?.cash_drawer_id} />
  </section>;
}

// A past day whose cash can no longer be counted. The owner closes it with a
// note: Tinta stops asking for it, but never reports that it balanced.
export function PendingDayReview({ report, date }: { report: CashCloseReport; date: string }) {
  const money = useMoneyVisibility();
  const review = useReviewCashDay();
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const session = report.session;
  const uncovered = report.uncovered_cash_activity ?? 0;
  const what = !session
    ? `Se registraron ${money.fmt(Math.abs(uncovered))} en efectivo sin abrir la caja.`
    : sessionFinished(session)
      ? `Entraron ${money.fmt(Math.abs(uncovered))} en efectivo después del último corte.`
      : session.status === "open"
        ? "La caja se quedó abierta y nadie hizo el corte."
        : session.status === "stale" || session.is_stale
          ? "Cambiaron movimientos después del corte y nadie volvió a contar."
          : "El corte se guardó sin contar el efectivo.";
  const valid = note.trim().length > 0 && note.trim().length <= 500;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!valid || review.isPending) return;
    setError(null);
    try {
      await review.mutateAsync({ date, cash_drawer_id: report.cash_drawer_id, note: note.trim() });
      toast.success("Día cerrado sin conteo. La nota quedó en el historial.");
      setOpen(false);
    } catch (err) { setError(errorMessage(err, "No pudimos cerrar el día. Actualiza la caja e intenta de nuevo.")); }
  }
  return <section className="rounded-lg border border-warning/40 bg-warning-soft p-4 text-warning-foreground space-y-3">
    <div className="space-y-1"><h2 className="font-semibold">Este día quedó sin corte</h2><p className="text-sm">{what}</p>
      <p className="text-sm">Ese efectivo ya no se puede contar. Si cierras el día con una nota, Tinta deja de pedírtelo, pero no dirá que la caja cuadró.</p></div>
    <Button requiresWrite variant="outline" onClick={() => { setNote(""); setError(null); setOpen(true); }}>Cerrar día sin conteo</Button>
    <Dialog busy={review.isPending} open={open} onOpenChange={value => { if (!review.isPending) setOpen(value); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Cerrar día sin conteo</DialogTitle><DialogDescription>{fmtDate(date)}. La nota queda en el historial de cortes.</DialogDescription></DialogHeader>
      <form onSubmit={submit} className="space-y-4" noValidate>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
        <div className="space-y-2"><Label htmlFor="cash-review-note">¿Qué pasó?</Label><Textarea id="cash-review-note" rows={3} maxLength={500} autoFocus placeholder="Ej. se olvidó abrir la caja; el efectivo ya se depositó" value={note} onChange={e => setNote(e.target.value)} /></div>
        <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => setOpen(false)} disabled={review.isPending}>Cancelar</Button><Button requiresWrite type="submit" disabled={!valid || review.isPending}>{review.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Cerrar día</Button></div>
      </form></DialogContent></Dialog>
  </section>;
}

function openingReferenceFacts(reference: CashOpeningReference, today: string, fmt: (value: number) => string) {
  const label = pendingDayLabel(reference.last_count_date, today);
  const when = label === "Ayer" ? "Ayer" : `El ${label}`;
  const later = Math.abs(reference.later_cash) >= 0.005
    ? ` y después ${reference.later_cash > 0 ? "entraron" : "salieron"} ${fmt(Math.abs(reference.later_cash))}. Debería haber ${fmt(reference.expected)}`
    : "";
  return `${when} quedaron ${fmt(reference.cash_left)} en el corte${later}.`;
}

function openingReferenceText(reference: CashOpeningReference, today: string, fmt: (value: number) => string) {
  return `${openingReferenceFacts(reference, today, fmt)} Cuenta el efectivo antes de confirmar.`;
}

function OpenCashModal({ open, onOpenChange, date, drawerId, sequence, suggested, locked, priorCash = 0, reference }: { open: boolean; onOpenChange(value: boolean): void; date: string; drawerId?: string; sequence: number; suggested?: number | null; locked: boolean; priorCash?: number; reference?: CashOpeningReference | null }) {
  const mutation = useOpenCashSession();
  const money = useMoneyVisibility();
  const isOwner = useAuthStore(s => s.user?.role === "owner");
  // Conteo a ciegas al abrir: el personal cuenta sin sugerencia y ve la
  // comparación con el último corte hasta después. Dentro del día el importe
  // ya viene fijo (lo que quedó), así que no hay nada que contar a ciegas.
  const blind = !isOwner && !locked;
  const [amount, setAmount] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [step, setStep] = useState<"count" | "result">("count");
  const [firstCount, setFirstCount] = useState<number | null>(null);
  useEffect(() => { if (open) { setAmount(blind || suggested == null ? "" : String(suggested)); setNote(""); setError(null); setStep("count"); setFirstCount(null); } }, [open, suggested, blind]);
  const check = !locked ? reference ?? null : null;
  const compareLater = blind && !!check;
  const counting = compareLater && step === "count";
  // Overnight check: a different opening is accepted, but must be explained.
  const difference = check && !counting && validCash(amount) ? cashDifference(Number(amount), check.expected) : 0;
  const differs = Math.abs(difference) >= 0.005;
  const validNote = !differs || note.trim().length >= 3;
  const recounted = compareLater && firstCount != null && validCash(amount) && Math.abs(Number(amount) - firstCount) >= 0.005;
  function openingNote() {
    const typed = differs ? note.trim() : "";
    if (!recounted) return typed || undefined;
    const first = `Primer conteo: ${fmtMoney(firstCount!)}.`;
    return (typed ? `${first} ${typed}` : first).slice(0, 500);
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (counting) {
      if (!validCash(amount)) return;
      if (firstCount == null) setFirstCount(Number(amount));
      setStep("result");
      return;
    }
    if (!validCash(amount) || !validNote || mutation.isPending) return;
    setError(null);
    const savedNote = openingNote();
    try { await mutation.mutateAsync({ date, cash_drawer_id: drawerId, opening_cash: Number(amount), ...(savedNote ? { opening_note: savedNote } : {}), sequence }); toast.success("Efectivo inicial guardado."); onOpenChange(false); }
    catch (err) { setError(errorMessage(err, "No pudimos abrir la caja.")); }
  }
  const description = blind ? "Cuenta el dinero que tienes para empezar." : check ? openingReferenceText(check, date, money.fmt) : suggested != null ? "Este importe quedó en el corte anterior." : "Cuenta el dinero que tienes para empezar.";
  return <Dialog busy={mutation.isPending} open={open} onOpenChange={value => { if (!mutation.isPending) onOpenChange(value); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{locked ? "Abrir caja de nuevo" : "Abrir caja"}</DialogTitle><DialogDescription>{description}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4" noValidate>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {(!compareLater || counting) ? <>
        {!locked && priorCash !== 0 && <p className="rounded-md bg-warning-soft p-3 text-sm text-warning-foreground">Hoy ya hubo {money.fmt(Math.abs(priorCash))} en efectivo antes de abrir la caja. Escribe sólo lo que había antes de esos movimientos; Tinta los suma aparte.</p>}
        <div className="space-y-2"><Label htmlFor="cash-opening">¿Con cuánto efectivo empiezas?</Label><Input id="cash-opening" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" type="number" min="0" step="0.01" autoFocus readOnly={locked} />{compareLater && <p className="text-sm text-muted-foreground">Cuenta todo el efectivo antes de escribirlo. Después te mostramos si coincide con el último corte.</p>}</div>
      </> : <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">Empiezas con <strong className="tabular-nums">{fmtMoney(Number(amount))}</strong></p><Button type="button" variant="link" className="h-auto min-h-11 p-0 text-sm" disabled={mutation.isPending} onClick={() => setStep("count")}>Volver a contar</Button></div>}
      {compareLater && !counting && check && !differs && <div role="status" className="rounded-md bg-muted p-3 text-sm space-y-1"><p className="font-semibold">Coincide con el último corte</p><p>{openingReferenceFacts(check, date, money.fmt)}</p>{recounted && <p>Antes contaste {fmtMoney(firstCount!)}. El dueño verá los dos conteos.</p>}</div>}
      {check && differs && <>
        <div role="status" className="rounded-md bg-warning-soft p-3 text-sm text-warning-foreground space-y-1"><p className="font-semibold">{differenceLabel(difference, money.fmt)}</p>{compareLater && <p>{openingReferenceFacts(check, date, money.fmt)}</p>}<p>Debería haber {money.fmt(check.expected)} y empiezas con {money.fmt(Number(amount))}. {compareLater && !recounted ? "Vuelve a contar y, si sigue igual, escribe qué pasó" : "Escribe qué pasó"}: el dueño lo verá en el reporte.</p>{recounted && <p>Antes contaste {fmtMoney(firstCount!)}. El dueño verá los dos conteos.</p>}</div>
        <div className="space-y-2"><Label htmlFor="cash-opening-note">¿Qué pasó?</Label><Textarea id="cash-opening-note" rows={2} maxLength={500} placeholder="Ej. se tomó para cambio antes de abrir" value={note} onChange={e => setNote(e.target.value)} /><Button type="button" variant="link" className="h-auto p-0 text-sm min-h-11" onClick={() => setNote("Pendiente de aclarar")}>Aún no sé por qué</Button></div>
      </>}
      <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button>{counting ? <Button type="submit" disabled={!validCash(amount)}>Ver resultado</Button> : <Button requiresWrite type="submit" disabled={!validCash(amount) || !validNote || mutation.isPending}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar efectivo inicial</Button>}</div>
    </form></DialogContent></Dialog>;
}

function CloseCashModal({ session, onClose, date, drawerId }: { session: CashSessionSnapshot | null; onClose(): void; date: string; drawerId?: string }) {
  const close = useCloseCashRegister();
  const reconcile = useReconcileCashSession();
  const withdraw = useWithdrawCashSession();
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [withdrawChoice, setWithdrawNow] = useState(false);
  // Without "cash_out" the corte still saves; the cash stays in the drawer.
  const canCashOut = usePermission("cash_out");
  const withdrawNow = withdrawChoice && canCashOut;
  const [cashLeft, setCashLeft] = useState("");
  const [error, setError] = useState<string | null>(null);
  // Contar primero: el resultado aparece hasta confirmar el conteo. Si después
  // de verlo cambia el número, el primer conteo queda en la nota del corte.
  const [step, setStep] = useState<"count" | "result">("count");
  const [firstCount, setFirstCount] = useState<number | null>(null);
  useEffect(() => { setCounted(""); setReason(""); setWithdrawNow(false); setCashLeft(""); setError(null); setStep("count"); setFirstCount(null); }, [session?.id]);
  const pending = close.isPending || reconcile.isPending || withdraw.isPending;
  const validCount = validCash(counted);
  const diff = validCount ? cashDifference(Number(counted), session?.expected_cash ?? 0) : 0;
  const hasDiff = Math.abs(diff) >= 0.005;
  const correction = session?.status === "reconciled";
  const validLeft = !withdrawNow || (validCash(cashLeft) && Number(cashLeft) < Number(counted));
  const validReason = !(hasDiff || correction) || reason.trim().length >= 3;
  const recounted = !correction && firstCount != null && validCount && Math.abs(Number(counted) - firstCount) >= 0.005;
  function countNote() {
    const note = hasDiff ? reason.trim() : "";
    if (!recounted) return note || undefined;
    const first = `Primer conteo: ${fmtMoney(firstCount!)}.`;
    return note ? `${first} ${note}`.slice(0, 200) : first;
  }
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (step === "count") {
      if (!validCount) return;
      if (firstCount == null) setFirstCount(Number(counted));
      setStep("result");
      return;
    }
    if (!session || pending || !validCount || !validLeft || !validReason) return;
    setError(null);
    try {
      if (session.status !== "open") {
        const saved = await reconcile.mutateAsync({ sessionId: session.id, counted_cash: Number(counted), discrepancy_reason: correction ? (hasDiff ? reason.trim() : undefined) : countNote(), correction_reason: reason.trim() || undefined, finish: !withdrawNow });
        if (withdrawNow) await withdraw.mutateAsync({ sessionId: saved.id, cash_left: Number(cashLeft), destination: "gym_fund" });
      } else {
        await close.mutateAsync({ date, cash_drawer_id: drawerId, session_id: session.id, finish: true, expected_cash: session.expected_cash, counted_cash: Number(counted), discrepancy_reason: countNote(), withdraw: withdrawNow, cash_left: withdrawNow ? Number(cashLeft) : undefined });
      }
      toast.success(withdrawNow ? "Corte y retiro guardados." : "Corte guardado. El efectivo se queda en caja."); onClose();
    } catch (err) { setError(errorMessage(err, "No pudimos guardar el corte.")); }
  }
  return <Dialog busy={pending} open={!!session} onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="flex max-w-md flex-col gap-0 overflow-hidden p-0"><DialogHeader className="shrink-0 px-6 pb-4 pt-6 pr-12"><DialogTitle>Hacer corte</DialogTitle><DialogDescription>Cuenta los billetes y monedas de esta caja.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="flex min-h-0 flex-col" noValidate><div className="min-h-0 space-y-4 overflow-y-auto px-6 pb-4">{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      {step === "count" ? <div className="space-y-2"><Label htmlFor="cash-counted">¿Cuánto efectivo hay en la caja?</Label><Input id="cash-counted" type="number" inputMode="decimal" min="0" step="0.01" value={counted} onChange={e => setCounted(e.target.value)} autoFocus /><p className="text-sm text-muted-foreground">Cuenta todo el efectivo antes de escribirlo. Después te mostramos cuánto debía haber.</p></div> : <>
      <div className="flex flex-wrap items-center justify-between gap-2"><p className="text-sm">Contaste <strong className="tabular-nums">{fmtMoney(Number(counted))}</strong></p><Button type="button" variant="link" className="h-auto min-h-11 p-0 text-sm" disabled={pending} onClick={() => setStep("count")}>Volver a contar</Button></div>
      <div role="status" className={`rounded-md p-3 space-y-1 ${hasDiff ? "bg-warning-soft text-warning-foreground" : "bg-muted"}`}><p className="font-semibold">{differenceLabel(diff, fmtMoney)}</p><p className="text-sm">Debía haber: {fmtMoney(session?.expected_cash ?? 0)}</p>{hasDiff && !correction && !recounted && <p className="text-sm">Si no cuadra, vuelve a contar antes de guardar.</p>}{recounted && <p className="text-sm">Antes contaste {fmtMoney(firstCount!)}. El dueño verá los dos conteos.</p>}</div>
      {(hasDiff || correction) && <div className="space-y-2"><Label htmlFor="cash-reason">{correction ? "Motivo de la corrección" : "Nota sobre la diferencia"}</Label><Textarea id="cash-reason" rows={2} maxLength={200} placeholder="Ej. se entregó cambio de más" value={reason} onChange={e => setReason(e.target.value)} />{!correction && <Button type="button" variant="link" className="h-auto p-0 text-sm min-h-11" onClick={() => setReason("Pendiente de aclarar")}>Aún no sé por qué</Button>}</div>}
      {canCashOut ? <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withdrawNow} onChange={e => setWithdrawNow(e.target.checked)} />Retirar efectivo al terminar</label> : <RestrictedNote permission="cash_out">El efectivo se queda en caja.</RestrictedNote>}
      {withdrawNow && <div className="space-y-2"><Label htmlFor="cash-left">¿Cuánto dejas para cambio?</Label><Input id="cash-left" type="number" inputMode="decimal" min="0" step="0.01" value={cashLeft} onChange={e => setCashLeft(e.target.value)} />{validCount && validLeft && <p className="text-sm">Vas a retirar {fmtMoney(cashWithdrawal(Number(counted), Number(cashLeft)))}.</p>}{validCash(cashLeft) && validCount && !validLeft && <p role="alert" className="text-sm text-destructive">El retiro debe ser mayor a cero y no superar lo que contaste.</p>}</div>}
      </>}
      </div><div className="flex shrink-0 flex-wrap justify-end gap-2 border-t bg-background px-6 py-4"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button>{step === "count" ? <Button type="submit" disabled={!validCount}>Ver resultado</Button> : <Button requiresWrite type="submit" disabled={pending || !validCount || !validLeft || !validReason}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{withdrawNow ? "Guardar corte y retiro" : "Guardar corte"}</Button>}</div>
    </form></DialogContent></Dialog>;
}

function WithdrawCashModal({ open, onOpenChange, session }: { open: boolean; onOpenChange(value: boolean): void; session: CashSessionSnapshot | null }) {
  const withdraw = useWithdrawCashSession();
  const [left, setLeft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const counted = session?.counted_cash ?? 0;
  const valid = validCash(left) && Number(left) < counted;
  useEffect(() => { if (open) { setLeft(""); setError(null); } }, [open]);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!valid || !session || withdraw.isPending) return;
    try { await withdraw.mutateAsync({ sessionId: session.id, cash_left: Number(left), destination: "gym_fund" }); toast.success("Retiro guardado."); onOpenChange(false); }
    catch (err) { setError(errorMessage(err, "No pudimos guardar el retiro.")); }
  }
  return <Dialog busy={withdraw.isPending} open={open} onOpenChange={value => { if (!withdraw.isPending) onOpenChange(value); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Retirar efectivo</DialogTitle><DialogDescription>Hay {fmtMoney(counted)} contados en esta caja.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4" noValidate>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="space-y-2"><Label htmlFor="withdraw-left">¿Cuánto dejas para cambio?</Label><Input id="withdraw-left" type="number" inputMode="decimal" min="0" step="0.01" value={left} onChange={e => setLeft(e.target.value)} autoFocus /></div>
    {valid && <p>Vas a retirar <strong>{fmtMoney(cashWithdrawal(counted, Number(left)))}</strong>.</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={withdraw.isPending} onClick={() => onOpenChange(false)}>Cancelar</Button><Button requiresWrite type="submit" disabled={!valid || withdraw.isPending}>Guardar retiro</Button></div>
  </form></DialogContent></Dialog>;
}
function CashMovementModal({
  open,
  onOpenChange,
  date,
  movementType,
  drawerId,
}: {
  open: boolean;
  onOpenChange(open: boolean): void;
  date: string;
  movementType: "cash_in" | "cash_out";
  drawerId?: string;
}) {
  const create = useCreateCashMovement();
  const [purpose, setPurpose] = useState<"expense" | "non_operating" | "">("");
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [amount, setAmount] = useState("");
  const [reason, setReason] = useState("");
  const movementAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const submitting = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const isOut = movementType === "cash_out";
  const isExpense = isOut && purpose === "expense";

  useEffect(() => {
    if (!open) return;
    setPurpose("");
    setCategory("");
    setAmount("");
    setReason("");
    movementAttempt.current = null;
    setError(null);
  }, [open, movementType]);

  const validAmount = !moneyInputError(amount);
  const validReason = reason.trim().length > 0 && reason.trim().length <= 200;
  const validPurpose = !isOut || (!!purpose && (!isExpense || !!category));

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (submitting.current || create.isPending || !validPurpose) return;
    setError(null);
    if (!validAmount) return setError(moneyInputError(amount));
    if (!validReason) return setError("Escribe el motivo del movimiento.");
    submitting.current = true;
    try {
      const input = {
        movement_on: date,
        amount: Number(amount),
        movement_type: movementType,
        reason: reason.trim(),
        cash_drawer_id: drawerId,
        ...(isOut && purpose ? { purpose } : {}),
        ...(isExpense && category ? { category } : {}),
      };
      movementAttempt.current = keyForPayload(movementAttempt.current, input);
      await create.mutateAsync({ ...input, idempotency_key: movementAttempt.current.key });
      movementAttempt.current = null;
      toast.success(isExpense ? "Gasto pagado con efectivo de caja." : isOut ? "Salida registrada." : "Entrada registrada.");
      onOpenChange(false);
    } catch (err) {
      setError(errorMessage(err, "No pudimos registrar el movimiento de caja."));
    } finally {
      submitting.current = false;
    }
  }

  return (
    <Dialog busy={create.isPending} open={open} onOpenChange={value => { if (!submitting.current) onOpenChange(value); }}>
      <DialogContent className="max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isOut ? "Registrar salida de efectivo" : "Registrar entrada de efectivo"}</DialogTitle>
          <DialogDescription className={isOut ? "sr-only" : undefined}>
            {isOut ? "Registra el monto y el uso del dinero." : "Dinero que agregas después de abrir la caja."}
          </DialogDescription>
        </DialogHeader>
        <form className="space-y-4" onSubmit={submit} noValidate>
          {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
          <fieldset disabled={create.isPending} className="space-y-4">
            {isOut && <fieldset className="space-y-2">
              <legend className="text-sm font-medium mb-2">¿Para qué sale el dinero?</legend>
              {([
                ["expense", "Pagar un gasto"],
                ["non_operating", "Entregar o mover dinero"],
              ] as const).map(([value, label]) => (
                <label key={value} className={`flex items-center gap-3 rounded-md border p-3 text-sm cursor-pointer ${purpose === value ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                  <input type="radio" name="cash-out-purpose" value={value} checked={purpose === value} onChange={() => { setPurpose(value); setError(null); }} className="h-4 w-4 accent-primary" />
                  {label}
                </label>
              ))}
            </fieldset>}
            <div className="space-y-1">
              <Label htmlFor="cash-movement-amount">Monto</Label>
              <Input id="cash-movement-amount" type="number" inputMode="decimal" min={0.01} step="0.01" value={amount} onChange={event => setAmount(event.target.value)} autoFocus={!isOut} />
            </div>
            {isExpense && <div className="space-y-1">
              <Label htmlFor="cash-expense-category">Categoría</Label>
              <Select value={category} onValueChange={value => setCategory(value as ExpenseCategory)} disabled={create.isPending}>
                <SelectTrigger id="cash-expense-category"><SelectValue placeholder="Selecciona una categoría" /></SelectTrigger>
                <SelectContent>{EXPENSE_CATEGORIES.map(c => <SelectItem key={c} value={c}>{expenseStrings.categories[c]}</SelectItem>)}</SelectContent>
              </Select>
            </div>}
            <div className="space-y-1">
              <Label htmlFor="cash-movement-reason">{isExpense ? "¿Qué pagaste?" : "Motivo"}</Label>
              <Textarea id="cash-movement-reason" maxLength={200} rows={2} value={reason} placeholder={isExpense ? "Ej. limpieza de recepción" : isOut ? "Ej. entrega al dueño para depositar" : "Ej. efectivo para cambio"} onChange={event => setReason(event.target.value)} />
            </div>
          </fieldset>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={create.isPending}>Cancelar</Button>
            <Button requiresWrite type="submit" disabled={create.isPending || !validAmount || !validReason || !validPurpose}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isExpense ? "Guardar gasto" : isOut ? "Registrar salida" : "Registrar entrada"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
