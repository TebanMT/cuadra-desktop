import { DateInput } from "@/components/ui/date-input";
import { Link, useNavigate } from "react-router-dom";
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
import { useCashCloseReport, useCloseCashRegister, useCreateCashMovement, useOpenCashSession, useReconcileCashSession, useWithdrawCashSession, type CashCloseReport, type CashSessionSnapshot } from "@/hooks/useCashClose";
import { expenses as expenseStrings, EXPENSE_CATEGORIES, type ExpenseCategory } from "@/strings/expenses";
import { fmtMoney } from "@/hooks/useBilling";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { ApiError } from "@/lib/api";
import { fmtDate, todayIso } from "@/lib/dates";
import { cashDifference, cashWithdrawal } from "@/lib/cashSessionMath";
import { moneyInputError } from "@/lib/moneyInput";
import { CashDrawerManager } from "@/components/cash/CashDrawerManager";
import { CashHistory, CashMovementList, differenceLabel, periodEntries, sessionFinished } from "@/components/cash/CashReview";
import { useAuthStore } from "@/stores/useAuthStore";
import { keyForPayload } from "@/lib/idempotency";

function errorMessage(error: unknown, fallback: string) {
  if (error instanceof ApiError) return (error.details as { exception?: string } | null)?.exception || fallback;
  return fallback;
}

function validCash(raw: string) {
  return raw.trim() !== "" && /^\d+(?:\.\d{1,2})?$/.test(raw.trim()) && Number(raw) <= 9_999_999_999.99;
}

export default function CashClosePage() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("current");
  const [historyDate, setHistoryDate] = useState(todayIso);
  const [drawer, setDrawer] = useState<string>();
  const [manager, setManager] = useState(false);
  const date = tab === "current" ? todayIso() : historyDate;
  const report = useCashCloseReport(date, drawer);
  const isOwner = useAuthStore(s => s.user?.role === "owner");
  return <div className="p-4 sm:p-6 space-y-5 max-w-5xl mx-auto pb-20">
    <div className="flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-3xl font-bold tracking-tight">Caja</h1><p className="text-sm text-muted-foreground">{fmtDate(date)}</p></div>
      <div className="flex flex-wrap items-center gap-2">{isOwner && <Button asChild variant="outline"><Link to="/reports/cash-close/summary?return_to=cash">Resumen por período</Link></Button>}{(report.data?.drawers?.length ?? 0) > 1 && <Select value={drawer ?? report.data?.cash_drawer_id} onValueChange={setDrawer}><SelectTrigger className="w-44" aria-label="Caja de recepción"><SelectValue /></SelectTrigger><SelectContent>{report.data?.drawers?.map(d => <SelectItem key={d.id} value={d.id}>{d.name || d.code}{d.active === false ? " (desactivada)" : ""}</SelectItem>)}</SelectContent></Select>}
        {isOwner && <Button variant="ghost" size="icon" title="Administrar cajas" aria-label="Administrar cajas" onClick={() => setManager(true)}><Settings2 className="h-4 w-4" /></Button>}</div>
    </div>
    <Tabs value={tab} onValueChange={setTab}><TabsList><TabsTrigger value="current">Caja actual</TabsTrigger><TabsTrigger value="history">Historial de cortes</TabsTrigger></TabsList>
      {tab === "history" && <div className="flex items-center gap-3 mt-5"><Label htmlFor="cash-history-date">Fecha</Label><DateInput id="cash-history-date" context="recent" value={historyDate} max={todayIso()} onValueChange={e => setHistoryDate(e || todayIso())} className="w-44" /></div>}
      {report.isLoading ? <div role="status" className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin" /><span className="sr-only">Cargando caja</span></div> : report.isError ? <Alert variant="destructive"><AlertDescription>No pudimos cargar la caja. <Button variant="link" onClick={() => report.refetch()}>Reintentar</Button></AlertDescription></Alert> : report.data && <>
        <TabsContent value="current"><ReportView key={`${date}:${report.data.cash_drawer_id}`} report={report.data} date={date} onReview={() => navigate(`/reports/cash-close/movements?from=${date}&to=${date}`)} canClose={report.data.drawers?.find(d => d.id === report.data?.cash_drawer_id)?.active !== false} onHistory={() => { setHistoryDate(date); setTab("history"); }} /></TabsContent>
        <TabsContent value="history"><CashHistory report={report.data} /></TabsContent>
      </>}
    </Tabs>
    <CashDrawerManager open={manager} onOpenChange={setManager} />
  </div>;
}

export function ReportView({ report, date, canClose, onHistory, onReview }: { report: CashCloseReport; date: string; canClose: boolean; onHistory?(): void; onReview?(): void }) {
  const isOwner = useAuthStore(s => s.user?.role === "owner");
  const [opening, setOpening] = useState(false);
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
  const canCount = !!session && known && (!finished || report.requires_new_session === true);
  const canWithdraw = session?.status === "reconciled" && !session.is_stale && !session.adjusted_after_withdrawal && !report.requires_new_session;
  const entries = periodEntries(report, session, finished);

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
      <div className="flex flex-wrap items-start justify-between gap-4"><div><p className="text-sm text-muted-foreground">Efectivo esperado</p><strong className="block text-4xl tracking-tight tabular-nums mt-1">{known ? money.fmt(expected) : "—"}</strong>
        {!known && <p className="text-sm text-muted-foreground mt-2">Registra el efectivo con el que empezó la caja.</p>}
        {known && <p className="text-xs text-muted-foreground mt-2">{finished ? "Quedó en caja" : "Efectivo inicial"}: {money.fmt(finished ? session?.cash_left ?? 0 : session?.opening_cash ?? 0)}</p>}
      </div>
        {canClose && (needsOpening ? <Button onClick={() => setOpening(true)}>Abrir caja</Button> : canCount ? <Button onClick={startCount} disabled={openSession.isPending}><Banknote className="h-4 w-4" />Hacer corte</Button> : finished && <Button variant="outline" onClick={() => setOpening(true)}>Abrir caja de nuevo</Button>)}
      </div>
      {finished && <div className="flex flex-wrap items-center justify-between gap-2 border-t pt-3 text-sm"><span>Último corte: {session?.is_stale || session?.adjusted_after_withdrawal || session?.status === "stale" ? "movimientos corregidos" : session?.difference == null ? "guardado" : differenceLabel(session.difference, money.fmt)}</span>{onHistory && <Button variant="link" className="h-auto p-0" onClick={onHistory}>Ver corte</Button>}</div>}
      {canClose && <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => setMovementType("cash_in")}><ArrowDownToLine className="h-4 w-4" />Agregar efectivo</Button><Button variant="outline" onClick={() => setMovementType("cash_out")}><ArrowUpFromLine className="h-4 w-4" />Registrar salida</Button>{canWithdraw && <Button variant="ghost" onClick={() => setWithdrawing(true)}>Retirar efectivo</Button>}</div>}
    </section>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <section className="rounded-lg border bg-card p-5"><div className="flex flex-wrap items-center justify-between gap-2"><h2 className="text-sm font-semibold">Movimientos de caja</h2>{isOwner && onReview && <Button variant="link" className="h-auto p-0 text-xs" onClick={onReview}>Revisar entradas y salidas</Button>}</div><CashMovementList entries={entries} timezone={report.timezone} /></section>
    <details className="rounded-lg border"><summary className="cursor-pointer p-4 text-sm font-medium">Resumen del día</summary><div className="p-4 pt-0 space-y-4">
      <dl className="grid grid-cols-2 gap-2 text-sm"><dt>Cobros en efectivo</dt><dd className="text-right tabular-nums">{money.fmt(report.by_method?.cash ?? 0)}</dd><dt>Tarjeta</dt><dd className="text-right tabular-nums">{money.fmt(report.by_method?.card ?? 0)}</dd><dt>Transferencias</dt><dd className="text-right tabular-nums">{money.fmt(report.by_method?.transfer ?? 0)}</dd><dt>Devoluciones en efectivo</dt><dd className="text-right tabular-nums">{money.fmt(report.refund_by_method?.cash ?? 0)}</dd></dl>
      <p className="text-xs text-muted-foreground">Tarjetas y transferencias son del gimnasio; no cambian el efectivo de esta caja.</p>
      {!!report.operators?.length && <dl className="grid grid-cols-2 gap-2 border-t pt-3 text-sm">{report.operators.map(o => <div key={o.operator_id} className="contents"><dt>{o.operator_name}</dt><dd className="text-right tabular-nums">{money.fmt(o.total)}</dd></div>)}</dl>}
    </div></details>
    <OpenCashModal open={opening} onOpenChange={setOpening} date={date} drawerId={drawerId} sequence={finished ? session!.sequence + 1 : 1} suggested={finished ? session?.cash_left : report.suggested_opening_cash} locked={finished} />
    <CloseCashModal session={closing && report.session?.id === closing.id && !sessionFinished(report.session) ? report.session : closing} onClose={() => setClosing(null)} date={date} drawerId={drawerId} />
    <WithdrawCashModal open={withdrawing} onOpenChange={setWithdrawing} session={session ?? null} />
    <CashMovementModal open={movementType != null} onOpenChange={value => { if (!value) setMovementType(null); }} date={date} movementType={movementType ?? "cash_in"} drawerId={drawerId} />
  </div>;
}

function OpenCashModal({ open, onOpenChange, date, drawerId, sequence, suggested, locked }: { open: boolean; onOpenChange(value: boolean): void; date: string; drawerId?: string; sequence: number; suggested?: number | null; locked: boolean }) {
  const mutation = useOpenCashSession();
  const [amount, setAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { if (open) { setAmount(suggested == null ? "" : String(suggested)); setError(null); } }, [open, suggested]);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!validCash(amount) || mutation.isPending) return;
    setError(null);
    try { await mutation.mutateAsync({ date, cash_drawer_id: drawerId, opening_cash: Number(amount), sequence }); toast.success("Efectivo inicial guardado."); onOpenChange(false); }
    catch (err) { setError(errorMessage(err, "No pudimos abrir la caja.")); }
  }
  return <Dialog open={open} onOpenChange={value => { if (!mutation.isPending) onOpenChange(value); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>{locked ? "Abrir caja de nuevo" : "Abrir caja"}</DialogTitle><DialogDescription>{suggested != null ? "Este importe quedó en el corte anterior." : "Cuenta el dinero que tienes para empezar."}</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4" noValidate>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="cash-opening">¿Con cuánto efectivo empiezas?</Label><Input id="cash-opening" value={amount} onChange={e => setAmount(e.target.value)} inputMode="decimal" type="number" min="0" step="0.01" autoFocus readOnly={locked} /></div>
      <div className="flex justify-end gap-2"><Button variant="outline" type="button" onClick={() => onOpenChange(false)} disabled={mutation.isPending}>Cancelar</Button><Button type="submit" disabled={!validCash(amount) || mutation.isPending}>{mutation.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Confirmar efectivo inicial</Button></div>
    </form></DialogContent></Dialog>;
}

function CloseCashModal({ session, onClose, date, drawerId }: { session: CashSessionSnapshot | null; onClose(): void; date: string; drawerId?: string }) {
  const close = useCloseCashRegister();
  const reconcile = useReconcileCashSession();
  const withdraw = useWithdrawCashSession();
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [withdrawNow, setWithdrawNow] = useState(false);
  const [cashLeft, setCashLeft] = useState("");
  const [error, setError] = useState<string | null>(null);
  useEffect(() => { setCounted(""); setReason(""); setWithdrawNow(false); setCashLeft(""); setError(null); }, [session?.id]);
  const pending = close.isPending || reconcile.isPending || withdraw.isPending;
  const validCount = validCash(counted);
  const diff = validCount ? cashDifference(Number(counted), session?.expected_cash ?? 0) : 0;
  const hasDiff = Math.abs(diff) >= 0.005;
  const correction = session?.status === "reconciled";
  const validLeft = !withdrawNow || (validCash(cashLeft) && Number(cashLeft) < Number(counted));
  const validReason = !(hasDiff || correction) || reason.trim().length >= 3;
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!session || pending || !validCount || !validLeft || !validReason) return;
    setError(null);
    try {
      if (session.status !== "open") {
        const saved = await reconcile.mutateAsync({ sessionId: session.id, counted_cash: Number(counted), discrepancy_reason: hasDiff ? reason.trim() : undefined, correction_reason: reason.trim() || undefined, finish: !withdrawNow });
        if (withdrawNow) await withdraw.mutateAsync({ sessionId: saved.id, cash_left: Number(cashLeft), destination: "gym_fund" });
      } else {
        await close.mutateAsync({ date, cash_drawer_id: drawerId, session_id: session.id, finish: true, expected_cash: session.expected_cash, counted_cash: Number(counted), discrepancy_reason: hasDiff ? reason.trim() : undefined, withdraw: withdrawNow, cash_left: withdrawNow ? Number(cashLeft) : undefined });
      }
      toast.success(withdrawNow ? "Corte y retiro guardados." : "Corte guardado. El efectivo se queda en caja."); onClose();
    } catch (err) { setError(errorMessage(err, "No pudimos guardar el corte.")); }
  }
  return <Dialog open={!!session} onOpenChange={open => { if (!open && !pending) onClose(); }}><DialogContent className="max-w-md max-h-[85vh] overflow-y-auto"><DialogHeader><DialogTitle>Hacer corte</DialogTitle><DialogDescription>Cuenta los billetes y monedas de esta caja.</DialogDescription></DialogHeader>
    <form onSubmit={submit} className="space-y-4" noValidate>{error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
      <div className="space-y-2"><Label htmlFor="cash-counted">¿Cuánto efectivo hay en la caja?</Label><Input id="cash-counted" type="number" inputMode="decimal" min="0" step="0.01" value={counted} onChange={e => setCounted(e.target.value)} autoFocus /></div>
      {validCount && <div className={`rounded-md p-3 space-y-1 ${hasDiff ? "bg-warning-soft text-warning-foreground" : "bg-muted"}`}><p className="font-semibold">{differenceLabel(diff, fmtMoney)}</p><p className="text-sm">Efectivo esperado: {fmtMoney(session?.expected_cash ?? 0)}</p></div>}
      {(hasDiff || correction) && <div className="space-y-2"><Label htmlFor="cash-reason">{correction ? "Motivo de la corrección" : "Nota sobre la diferencia"}</Label><Textarea id="cash-reason" rows={2} maxLength={200} placeholder="Ej. se entregó cambio de más" value={reason} onChange={e => setReason(e.target.value)} />{!correction && <Button type="button" variant="link" className="h-auto p-0 text-sm" onClick={() => setReason("Pendiente de aclarar")}>Aún no sé por qué</Button>}</div>}
      <label className="flex items-center gap-2 text-sm"><input type="checkbox" checked={withdrawNow} onChange={e => setWithdrawNow(e.target.checked)} />Retirar efectivo al terminar</label>
      {withdrawNow && <div className="space-y-2"><Label htmlFor="cash-left">¿Cuánto dejas para cambio?</Label><Input id="cash-left" type="number" inputMode="decimal" min="0" step="0.01" value={cashLeft} onChange={e => setCashLeft(e.target.value)} />{validCount && validLeft && <p className="text-sm">Vas a retirar {fmtMoney(cashWithdrawal(Number(counted), Number(cashLeft)))}.</p>}{validCash(cashLeft) && validCount && !validLeft && <p role="alert" className="text-sm text-destructive">El retiro debe ser mayor a cero y no superar lo que contaste.</p>}</div>}
      <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={pending} onClick={onClose}>Cancelar</Button><Button type="submit" disabled={pending || !validCount || !validLeft || !validReason}>{pending && <Loader2 className="h-4 w-4 animate-spin" />}{withdrawNow ? "Guardar corte y retiro" : "Guardar corte"}</Button></div>
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
  return <Dialog open={open} onOpenChange={value => { if (!withdraw.isPending) onOpenChange(value); }}><DialogContent className="max-w-md"><DialogHeader><DialogTitle>Retirar efectivo</DialogTitle><DialogDescription>Hay {fmtMoney(counted)} contados en esta caja.</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4" noValidate>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    <div className="space-y-2"><Label htmlFor="withdraw-left">¿Cuánto dejas para cambio?</Label><Input id="withdraw-left" type="number" inputMode="decimal" min="0" step="0.01" value={left} onChange={e => setLeft(e.target.value)} autoFocus /></div>
    {valid && <p>Vas a retirar <strong>{fmtMoney(cashWithdrawal(counted, Number(left)))}</strong>.</p>}
    <div className="flex justify-end gap-2"><Button variant="outline" type="button" disabled={withdraw.isPending} onClick={() => onOpenChange(false)}>Cancelar</Button><Button type="submit" disabled={!valid || withdraw.isPending}>Guardar retiro</Button></div>
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
    <Dialog open={open} onOpenChange={value => { if (!submitting.current) onOpenChange(value); }}>
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
            <Button type="submit" disabled={create.isPending || !validAmount || !validReason || !validPurpose}>
              {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {isExpense ? "Guardar gasto" : isOut ? "Registrar salida" : "Registrar entrada"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
