import { validateDateFields } from "@/lib/date-input";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { DateInput } from "@/components/ui/date-input";
import { PaidExpensesLedger } from "@/components/expenses/PaidExpensesLedger";
import { findPurchaseForCashMovement } from "@/hooks/useExpenses";
import { RecurringPreview } from "@/components/expenses/RecurringPreview";
import { moneyInputError } from "@/lib/moneyInput";
import { ScheduledPaymentForm } from "@/components/expenses/ScheduledPaymentForm";
import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Copy,
  FileDown,
  Loader2,
  Lock,
  Plus,
  PackagePlus,
  Receipt,
  Search,
  Wallet,
	PackageCheck,
	CalendarClock,
	Repeat2,
  Check,
  Eye,
  EyeOff,
  X as XIcon,
} from "lucide-react";
import { Link, Navigate, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableTh,
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/components/shared/PagePrimitives";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDebounce } from "@/hooks/useDebounce";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { useOperators } from "@/hooks/useOperators";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fmtDate, fmtIso, todayIso } from "@/lib/dates";
import {
  cashMovementActions,
  useCreateExpense,
  useDeleteExpense,
  useExpensesList,
  fetchAllExpenses,
  useUpdateExpense,
	useExpenseOccurrences,useExpenseTemplates,useInventoryPurchases,useUnclassifiedCash,useCashMovements,usePayOccurrence,useSkipOccurrence,useReopenOccurrence,usePayInventoryPurchase,useReopenInventoryPurchase,useCorrectInventoryPurchase,useClassifyCashMovement,useUnclassifyCashMovement,useUpdateCashMovement,useDeleteCashMovement,useCreateExpenseTemplate,useUpdateExpenseTemplate,useSetExpenseTemplateActive,
	type ExpenseOccurrence,type ExpenseTemplate,type InventoryPurchase,type CashMovement,type CashMovementListResponse,type CashMovementStatus,type ExpenseFrequency,
  type Expense,
  type ExpenseSortColumn,
  type ListExpensesInput,
  type SortDirection,
	type PaidFrom,
} from "@/hooks/useExpenses";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  expenses as t,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "@/strings/expenses";
import { common } from "@/strings/common";
import { ExpenseForm, type ExpenseFormSubmitPayload } from "@/components/expenses/ExpenseForm";
import { keyForPayload } from "@/lib/idempotency";
import { CashDrawerField } from "@/components/cash/CashDrawerField";

const PAGE_SIZE = 50;
const PAID_FROM: Record<PaidFrom, string> = { cash_drawer: "Caja de recepción", gym_fund: "Dinero del gimnasio fuera de caja", external: "Dinero personal o de otra persona" };
const needsCashSourceConfirmation = (expense: Expense) =>
  expense.payment_method === "cash" && expense.paid_from === "cash_drawer" && !expense.cash_movement_id;

// firstOfMonth — default del filtro de rango. La página arranca enseñando
// el mes en curso porque es el caso 90% del dueño "cuánto llevo gastado
// este mes". El "hoy" viene de todayIso (lib/dates) — un solo helper.
function firstOfMonth(): string {
  return `${todayIso().slice(0, 7)}-01`;
}

export default function ExpensesPage() {
  const [params] = useSearchParams();
  const legacy = params.get("view");
  if (legacy === "cash" || legacy === "purchases") return <Navigate replace to={legacy === "cash" ? `/reports/cash-close?${params}` : `/products?${params}`} />;
  return <ExpensesWorkspace />;
}

export function ExpensesWorkspace({ section = "expenses", embedded = false }: { section?: "expenses" | "cash" | "purchases"; embedded?: boolean }) {
  const plan = useAuthStore(s => s.gym?.subscription_plan);
  const isPlus = canAccessPlusFeatures(plan);
  const isOwner = useAuthStore(s => s.user?.role === "owner");
  const [params, setParams] = useSearchParams();
  const requested = params.get("view");
  const view = section !== "expenses" ? section : requested === "recurring" ? "recurring" : requested === "pending" ? "pending" : "movements";
  const pendingStatus = isPlus && params.get("status") === "skipped" ? "skipped" : "pending";
  const [from, setFrom] = useState(params.get("from") ?? firstOfMonth());
  const [to, setTo] = useState(params.get("to") ?? todayIso());
  const [createOpen, setCreateOpen] = useState(false);
 const purchaseNavigate = useNavigate();
 const purchaseLocation = useLocation();
 const openPurchase = () => purchaseNavigate("/products/purchases/new", { state: { returnTo: purchaseLocation.pathname + purchaseLocation.search } });
  const [duplicateFrom, setDuplicateFrom] = useState<Expense | null>(null);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<ExpenseTemplate | null>(null);
  const [resolvingOccurrence, setResolvingOccurrence] = useState<ExpenseOccurrence | null>(null);
  const [skippingOccurrence, setSkippingOccurrence] = useState<ExpenseOccurrence | null>(null);
  const [reopeningOccurrence, setReopeningOccurrence] = useState<ExpenseOccurrence | null>(null);
  const [payingPurchase, setPayingPurchase] = useState<InventoryPurchase | null>(null);
  const [correctingPurchase, setCorrectingPurchase] = useState<InventoryPurchase | null>(null);
  const [reopeningPurchase, setReopeningPurchase] = useState<InventoryPurchase | null>(null);
  const [purchasePage, setPurchasePage] = useState(1);
  const [classifyingCash, setClassifyingCash] = useState<CashMovement | null>(null);
  const [unclassifyingCash, setUnclassifyingCash] = useState<CashMovement | null>(null);
  const [editingCash, setEditingCash] = useState<CashMovement | null>(null);
  const [cashStatus, setCashStatus] = useState<CashMovementStatus>("all");
  const [cashPage, setCashPage] = useState(1);
  const money = useMoneyVisibility();
  const occurrenceTo = useMemo(() => { const d = new Date(); d.setDate(d.getDate()+30); return fmtIso(d); }, []);
  const needsPending = section === "expenses" || createOpen || !!payingPurchase;
  const occurrences = useExpenseOccurrences(undefined, occurrenceTo, isPlus && needsPending);
  const purchases = useInventoryPurchases("unpaid", isOwner && needsPending);
  const purchaseHistory = useInventoryPurchases("all", isOwner && view === "purchases", {from,to,page:purchasePage,page_size:PAGE_SIZE});
  const templates = useExpenseTemplates(isPlus && view === "recurring");
  const cash = useUnclassifiedCash(createOpen || !!payingPurchase || section === "cash");
  const cashHistory = useCashMovements({from,to,status:cashStatus,page:cashPage,page_size:PAGE_SIZE}, isOwner && view === "cash");
  const operators = useOperators(view === "cash");
  const operatorNames = useMemo(() => Object.fromEntries((operators.data?.items ?? []).map(o=>[o.id,o.full_name])),[operators.data]);
  const pendingItems = (occurrences.data?.items ?? []).filter(item=>item.status === "pending");
  const pendingCount = pendingItems.length + (purchases.data?.total ?? 0);
  const correctScheduledPayment = async (item:{expense_id?:string}) => {
    if(!item.expense_id)return;
    try {setEditing(await api.get<Expense>(`/api/v1/expenses/${item.expense_id}`));}
    catch {toast.error("No pudimos abrir el gasto. Intenta de nuevo.");}
  };
  const correctCashPurchase = async (item:CashMovement) => {
    try {setCorrectingPurchase(await findPurchaseForCashMovement(item.id));}
    catch(error){toast.error(error instanceof Error?error.message:"No pudimos abrir la compra.");}
  };
  function setView(next:string) {setParams(current=>{const result=new URLSearchParams(current);result.set("view",next);return result;});}
  return <div className={embedded ? "space-y-4" : "p-4 sm:p-6 space-y-5 max-w-5xl mx-auto pb-24"}>
    {!embedded && <PageHeader title="Gastos" actions={<div className="flex flex-wrap gap-2"><Button className="bg-foreground text-background hover:bg-foreground/90 font-semibold shadow-sm" onClick={openPurchase}><PackagePlus className="h-4 w-4" />Registrar compra</Button><Button onClick={()=>{setDuplicateFrom(null);setCreateOpen(true);}}><Plus className="h-4 w-4 mr-2"/>Registrar gasto</Button></div>} />}
    {section === "expenses" && <Tabs value={view} onValueChange={setView} className="space-y-4">
      <div className="flex items-center gap-2 border-b">
        <TabsList aria-label="Vistas de Gastos" className="h-auto min-w-0 flex-1 items-stretch gap-3 border-0 sm:gap-4">
          <TabsTrigger value="movements" className="min-h-12 shrink-0 px-1">Pagados</TabsTrigger>
          <TabsTrigger value="pending" className="min-h-12 shrink-0 px-1">
            Por pagar{pendingCount > 0 && <span className="ml-2 text-xs">{pendingCount}</span>}
          </TabsTrigger>
          <TabsTrigger value="recurring" className="min-h-12 min-w-0 flex-col gap-1 whitespace-normal px-1 leading-tight sm:flex-row sm:gap-2">
            <span>Pagos que se repiten</span>{" "}
            {!isPlus && <span className="inline-flex shrink-0 items-center gap-1 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium"><Lock aria-hidden="true" className="h-3 w-3" />Plus</span>}
          </TabsTrigger>
        </TabsList>
        <button type="button" onClick={money.toggle} className="shrink-0 p-3 text-muted-foreground" aria-label={money.hidden ? "Mostrar montos" : "Ocultar montos"}>
          {money.hidden ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>
      <TabsContent value="movements">
        <PaidExpensesLedger from={from} to={to} onFrom={setFrom} onTo={setTo} onExpense={correctScheduledPayment} />
      </TabsContent>
      <TabsContent value="pending" className="space-y-4">
        {isPlus && <div role="group" aria-label="Estado de los pagos" className="inline-flex gap-1 rounded-lg bg-muted p-1">
          {([["pending", "Pendientes"], ["skipped", "Omitidos"]] as const).map(([status, label]) => <button
            key={status}
            type="button"
            aria-pressed={pendingStatus === status}
            className={cn("min-h-10 rounded-md px-4 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring", pendingStatus === status ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground")}
            onClick={() => {
              if (pendingStatus === status) return;
              setParams(current => {
                const result = new URLSearchParams(current);
                if (status === "skipped") result.set("status", status);
                else result.delete("status");
                return result;
              });
            }}
          >{label}</button>)}
        </div>}
        {pendingStatus === "pending" && !purchases.isLoading && !purchases.error && (!isPlus || (!occurrences.isLoading && !occurrences.error)) && pendingCount === 0 && <p className="py-12 text-center text-sm text-muted-foreground">No tienes pagos pendientes.</p>}
        {pendingStatus === "pending" && isOwner && ((purchases.data?.total ?? 0) > 0 || purchases.isLoading || !!purchases.error) && <InventoryPurchasesPanel items={purchases.data?.items ?? []} loading={purchases.isLoading} error={purchases.error} onPay={setPayingPurchase} onCorrect={setCorrectingPurchase} />}
        {isPlus && (pendingStatus === "skipped" || pendingItems.length > 0 || occurrences.isLoading || !!occurrences.error) && <OccurrencesPanel status={pendingStatus} items={occurrences.data?.items ?? []} loading={occurrences.isLoading} error={occurrences.error} isOwner={isOwner} onResolve={setResolvingOccurrence} onSkip={setSkippingOccurrence} onReopen={setReopeningOccurrence} />}
      </TabsContent>
      <TabsContent value="recurring" className="space-y-4">
        {isPlus ? (
          <RecurringPanel items={templates.data?.items ?? []} loading={templates.isLoading} error={templates.error} onEdit={setEditingTemplate} onCreate={()=>setTemplateOpen(true)} />
        ) : <section aria-label="Pagos que se repiten en Plus" className="rounded-xl border bg-card p-5 space-y-3">
          <h2 className="font-semibold">Incluido en Plus</h2>
          <p className="text-sm text-muted-foreground">Programa la renta, los servicios o la nómina para ver cuándo toca pagarlos.</p>
          <Button variant="outline" asChild><Link to="/settings/subscription">Ver planes</Link></Button>
        </section>}
      </TabsContent>
    </Tabs>}
      {view === "purchases" && <InventoryPurchaseHistory response={purchaseHistory.data} loading={purchaseHistory.isLoading} error={purchaseHistory.error} from={from} to={to} onFrom={(value) => { setFrom(value); setPurchasePage(1); }} onTo={(value) => { setTo(value); setPurchasePage(1); }} onPage={setPurchasePage} onPay={setPayingPurchase} onCorrect={setCorrectingPurchase} onReopen={setReopeningPurchase} />}
      {view === "cash" && <><CashMovementHistoryPanel response={cashHistory.data} loading={cashHistory.isLoading} error={cashHistory.error} from={from} to={to} status={cashStatus} onFrom={setFrom} onTo={setTo} onStatus={(next) => { setCashStatus(next); setCashPage(1); }} onPage={setCashPage} operatorNames={operatorNames} onClassify={setClassifyingCash} onUnclassify={setUnclassifyingCash} onEdit={setEditingCash} onCorrectExpense={correctScheduledPayment} onCorrectPurchase={correctCashPurchase} /></>}
      <CreateDialog open={createOpen} onOpenChange={(open) => { setCreateOpen(open); if (!open) setDuplicateFrom(null); }} initialExpense={duplicateFrom} matchesLoading={cash.isLoading || (isPlus && occurrences.isLoading)} matchesError={!!cash.error || (isPlus && !!occurrences.error)} onRetryMatches={() => { cash.refetch(); if (isPlus) occurrences.refetch(); }} cashMovements={cash.data?.items ?? []} occurrences={occurrences.data?.items ?? []} />
	  <TemplateDialog open={templateOpen} onOpenChange={setTemplateOpen}/>
	  <TemplateDialog open={!!editingTemplate} onOpenChange={(open)=>!open&&setEditingTemplate(null)} initial={editingTemplate??undefined}/>
	  <OccurrenceResolutionDialog occurrence={resolvingOccurrence} onClose={()=>setResolvingOccurrence(null)}/>
      <SkipOccurrenceDialog occurrence={skippingOccurrence} onClose={() => setSkippingOccurrence(null)} />
      <ReopenOccurrenceDialog occurrence={reopeningOccurrence} onClose={() => setReopeningOccurrence(null)} />
      <PayInventoryPurchaseDialog purchase={payingPurchase} cashMovements={cash.data?.items ?? []} onClose={() => setPayingPurchase(null)} />
      <CorrectInventoryPurchaseDialog purchase={correctingPurchase} onClose={() => setCorrectingPurchase(null)} />
      <ReopenInventoryPurchaseDialog purchase={reopeningPurchase} onClose={() => setReopeningPurchase(null)} />
	  <CashClassificationDialog movement={classifyingCash} onClose={()=>setClassifyingCash(null)}/>
      <UnclassifyCashDialog movement={unclassifyingCash} onClose={() => setUnclassifyingCash(null)} />
      <EditCashMovementDialog movement={editingCash} onClose={() => setEditingCash(null)} />
      <EditDialog
        expense={editing}
        isOwner={isOwner}
        onClose={() => setEditing(null)}
        onAskDelete={(e) => {
          setEditing(null);
          setConfirmDelete(e);
        }}
        onRepeat={(expense) => { setEditing(null); setDuplicateFrom(expense); setCreateOpen(true); }}
      />
      <DeleteConfirm
        expense={confirmDelete}
        onClose={() => setConfirmDelete(null)}
      />
  </div>;
}

function LabeledInput({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="space-y-2"><span className="block text-sm font-medium">{label}</span>{children}</label>;
}

function moneyPlain(value: number): string {
  return new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(value);
}

function CreateDialog({ open, onOpenChange, initialExpense, cashMovements, occurrences, matchesLoading, matchesError, onRetryMatches }: { open: boolean; onOpenChange(o: boolean): void; initialExpense: Expense | null; cashMovements: CashMovement[]; occurrences: ExpenseOccurrence[]; matchesLoading: boolean; matchesError: boolean; onRetryMatches(): void }) {
  const create = useCreateExpense();
  const pay = usePayOccurrence(); const classify = useClassifyCashMovement();
  const createAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [serverError, setServerError] = useState<string | null>(null);
  const initial = useMemo(() => initialExpense ? {
    expense_date: todayIso(),
    amount: String(initialExpense.amount),
    category: initialExpense.category,
    payment_method: initialExpense.payment_method,
    paid_from: initialExpense.paid_from,
    description: initialExpense.description ?? "",
    payee_name: initialExpense.payee_name ?? "",
    reference: "",
    classification: initialExpense.classification,
    cash_drawer_id: initialExpense.cash_drawer_id ?? undefined,
  } : undefined, [initialExpense]);

  function handleClose(o: boolean) {
    if (!o) setServerError(null);
    onOpenChange(o);
  }

  async function submit(payload: ExpenseFormSubmitPayload) {
    setServerError(null);
    try {
      createAttempt.current = keyForPayload(createAttempt.current, payload);
      if (payload.recurring_occurrence_id) {
        await pay.mutateAsync({ ...payload, id: payload.recurring_occurrence_id, paid_on: payload.expense_date, idempotency_key: createAttempt.current.key });
      } else if (payload.cash_movement_id) {
        await classify.mutateAsync({ ...payload, id: payload.cash_movement_id, paid_on: payload.expense_date });
      } else {
        await create.mutateAsync({ ...payload, idempotency_key: createAttempt.current.key });
      }
      createAttempt.current = null;
      toast.success(payload.paid_from === "cash_drawer" ? "Gasto registrado · afectó el resultado y la caja de recepción." : "Gasto registrado · afectó el resultado sin mover la caja de recepción.");
      handleClose(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.details as Record<string, unknown> | null;
        setServerError((data?.exception as string | undefined) || t.form.errors.generic);
      } else {
        setServerError(t.form.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{initialExpense ? "Registrar otro gasto similar" : t.form.titleNew}</DialogTitle>
        </DialogHeader>
        {matchesLoading && <p className="text-sm text-muted-foreground">Buscando registros existentes…</p>}
        {matchesError && <div role="alert" className="text-sm space-y-2"><p>No pudimos consultar los registros existentes.</p><Button variant="outline" onClick={onRetryMatches}>Reintentar consulta</Button></div>}
        <ExpenseForm
          mode="create"
          key={initialExpense?.id ?? "new"}
          cashMovements={cashMovements} occurrences={occurrences}
          initial={initial}
          submitting={matchesLoading || matchesError || create.isPending || pay.isPending || classify.isPending}
          onSubmit={submit}
          onCancel={() => handleClose(false)}
          serverError={serverError}
        />
      </DialogContent>
    </Dialog>
  );
}

export function InventoryPurchasesPanel({ items, loading, error, onPay, onCorrect }: { items: InventoryPurchase[]; loading: boolean; error: unknown; onPay(item: InventoryPurchase): void; onCorrect(item: InventoryPurchase): void }) {
  const money = useMoneyVisibility();
  if (loading) return <LoadingSection label="Cargando compras pendientes…" />;
  if (error) return <PanelError label="No pudimos cargar las compras pendientes." />;
  return <SectionCard title="Compras por pagar"  flush>
    {items.length === 0 ? <EmptyState icon={<PackageCheck className="h-8 w-8" />} title="No hay compras de productos por pagar"  /> : <div className="divide-y">{items.map((item) => <div key={item.id} className="p-4 flex flex-wrap items-center gap-3">
      <div className="flex-1 min-w-[180px]"><p className="font-semibold">{item.product_name}</p><p className="text-xs text-muted-foreground">{item.receipt_status === "pending" ? "Pendiente de recibir · registrada" : "Recibido"} {fmtDate(item.created_at)} · {item.quantity} uds × {money.fmt(item.unit_cost)}</p></div>
      <strong className="tabular-nums">{money.fmt(item.total_amount)}</strong>
      <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto">{item.remote ? <span className="text-xs text-muted-foreground">Pago administrado en la web</span> : <><Button className="min-h-10" size="sm" variant="outline" onClick={() => onCorrect(item)}>Corregir</Button><Button className="min-h-10" size="sm" onClick={() => onPay(item)}>Registrar pago</Button></>}</div>
    </div>)}</div>}
  </SectionCard>;
}

function InventoryPurchaseHistory({ response, loading, error, from, to, onFrom, onTo, onPage, onPay, onCorrect, onReopen }: { response?: { items: InventoryPurchase[]; total: number; page: number; page_size: number }; loading: boolean; error: unknown; from: string; to: string; onFrom(value: string): void; onTo(value: string): void; onPage(value: number): void; onPay(item: InventoryPurchase): void; onCorrect(item: InventoryPurchase): void; onReopen(item: InventoryPurchase): void }) {
  const visibility = useMoneyVisibility();
  const items=response?.items??[];const page=response?.page??1;const size=response?.page_size??50;const pages=Math.max(1,Math.ceil((response?.total??0)/size));
  return <div className="space-y-4">
  {<div className="flex flex-wrap items-center gap-2"><span className="text-sm">Compras registradas</span><DateRangePicker from={from} to={to} onChange={(start, end) => { onFrom(start); onTo(end); onPage(1); }} /></div>}
  {loading ? <p role="status" className="py-10 text-center text-sm">Cargando compras…</p> : error ? <p role="alert" className="text-sm text-destructive">No se pudieron cargar las compras.</p> : <div className="rounded-lg border overflow-hidden divide-y">
   {items.length===0 ? <p className="py-12 text-center text-sm text-muted-foreground">No hay compras en este período.</p> : items.map(item=><details key={item.id} className="group">
    <summary className="cursor-pointer list-none flex items-center gap-4 p-4 hover:bg-muted/30"><div className="min-w-0 flex-1"><p className="font-medium break-words">{item.product_name}</p><p className="text-xs text-muted-foreground mt-1">{fmtDate(item.recorded_on??item.created_at)} · {item.quantity} piezas · {item.status==="paid"?"Pagada":item.status==="unpaid"?"Por pagar":item.status==="annulled"?"Anulada":"Compra antigua"}{item.receipt_status==="pending"&&item.status!=="annulled"?" · Por recibir":""}</p></div><strong className={cn("shrink-0 text-sm tabular-nums",item.status==="annulled"&&"line-through text-muted-foreground")}>{item.total_amount==null?"Sin costo":visibility.fmt(item.total_amount)}</strong><span aria-hidden="true" className="text-muted-foreground group-open:rotate-90">›</span></summary>
    <div className="border-t px-4 py-3 space-y-3 bg-muted/20"><dl className="grid grid-cols-2 gap-2 text-sm"><dt>Costo por pieza</dt><dd className="text-right">{item.unit_cost==null?"Sin registrar":visibility.fmt(item.unit_cost)}</dd>{item.paid_on&&<><dt>Fecha de pago</dt><dd className="text-right">{fmtDate(item.paid_on)}</dd></>}{(item.separate_receipt||item.remote)&&<><dt>Entrega</dt><dd className="text-right">{item.receipt_status==="received"?"Recibida":"Por recibir"}</dd></>}</dl>
    {item.remote&&<p className="text-xs text-muted-foreground">El pago se corrige desde la web.</p>}
    <div className="flex flex-wrap gap-2 justify-end">
     {!item.remote && item.status==="unpaid"&&<><Button variant="outline" size="sm" onClick={()=>onCorrect(item)}>Corregir compra</Button><Button size="sm" onClick={()=>onPay(item)}>Registrar pago</Button></>}
     {!item.remote && item.status==="paid"&&<><Button variant="outline" size="sm" onClick={()=>onCorrect(item)}>Corregir compra</Button><Button variant="ghost" size="sm" onClick={()=>onReopen(item)}>Volver a pendiente</Button></>}
    </div></div>
   </details>)}
  </div>}
  {pages>1&&<div className="flex justify-end items-center gap-2"><Button variant="outline" size="sm" disabled={page<=1||loading} onClick={()=>onPage(page-1)}>Anterior</Button><span className="text-sm">{page} / {pages}</span><Button variant="outline" size="sm" disabled={page>=pages||loading} onClick={()=>onPage(page+1)}>Siguiente</Button></div>}
 </div>;
}

export function PayInventoryPurchaseDialog({ purchase, cashMovements = [], onClose }: { purchase: InventoryPurchase | null; cashMovements?: CashMovement[]; onClose(): void }) {
  const pay = usePayInventoryPurchase();
  const [paidOn, setPaidOn] = useState(todayIso());
  const [method, setMethod] = useState<ExpensePaymentMethod>("transfer");
  const [paidFrom, setPaidFrom] = useState<"cash_drawer" | "gym_fund" | "external" | "">("");
  const [cashDrawerId, setCashDrawerId] = useState<string>();
  const [cashMovementId, setCashMovementId] = useState("");
  const [checkedCash, setCheckedCash] = useState(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => { if (purchase) { setPaidOn(todayIso()); setMethod("transfer"); setPaidFrom(""); setCashDrawerId(undefined); setCashMovementId(""); setCheckedCash(false); attempt.current = null; } }, [purchase]);
  const compatibleMovements = purchase ? cashMovements.filter((movement) => movement.movement_type === "cash_out" && movement.classification_status === "unclassified" && Math.round(movement.amount * 100) === Math.round(purchase.total_amount * 100)) : [];
  const submit = async () => {
    if (!purchase || !paidOn) return;
    if (!paidFrom) return toast.error("Selecciona de dónde salió el dinero.");
    if (paidFrom === "cash_drawer" && method !== "cash") return toast.error("La caja de recepción sólo se usa para pagos en efectivo.");
    if (paidFrom === "cash_drawer" && compatibleMovements.length > 0 && !checkedCash) return toast.error("Revisa si alguna salida existente corresponde a esta compra.");
    const input = { purchase_id: purchase.id, version: purchase.version, paid_on: paidOn, payment_method: method, paid_from: paidFrom, ...(paidFrom === "cash_drawer" && cashDrawerId ? { cash_drawer_id: cashDrawerId } : {}), ...(cashMovementId ? { cash_movement_id: cashMovementId } : {}) };
    attempt.current = keyForPayload(attempt.current, input);
    try {
      await pay.mutateAsync({ id: purchase.id, version: purchase.version, paid_on: paidOn, payment_method: method, paid_from: paidFrom, ...(paidFrom === "cash_drawer" && cashDrawerId ? { cash_drawer_id: cashDrawerId } : {}), ...(cashMovementId ? { cash_movement_id: cashMovementId } : {}), idempotency_key: attempt.current.key });
      attempt.current = null;
      toast.success(paidFrom === "cash_drawer" ? "Pago de compra registrado." : "Pago de compra registrado.");
      onClose();
    } catch (error) { toast.error(error instanceof ApiError ? error.message : t.form.errors.generic); }
  };
  return <Dialog open={!!purchase} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Registrar pago de compra</DialogTitle><DialogDescription>Registra el pago. Las existencias no cambian.</DialogDescription></DialogHeader>{purchase && <><div className="rounded-md bg-muted p-3 text-sm flex justify-between gap-3"><span>{purchase.product_name} · {purchase.quantity} uds</span><strong>{moneyPlain(purchase.total_amount)}</strong></div><div className="grid sm:grid-cols-2 gap-3"><LabeledInput label="Fecha real de pago"><DateInput context="recent" max={todayIso()} value={paidOn} disabled={!!cashMovementId} onValueChange={(event) => setPaidOn(event)} /></LabeledInput><LabeledInput label="Método"><NativeSelect label="Método" value={method} onChange={(value) => { setMethod(value as ExpensePaymentMethod);  }} options={EXPENSE_PAYMENT_METHODS.map((value) => [value, t.methods[value]])} /></LabeledInput><LabeledInput label="Pagado desde"><NativeSelect label="Pagado desde" value={paidFrom} onChange={(value) => { setPaidFrom(value as typeof paidFrom); setCashMovementId(""); }} options={[["", "Selecciona el origen del dinero"], ["gym_fund", "Dinero del gimnasio fuera de caja"], ["cash_drawer", "Caja de recepción"], ["external", "Dinero personal o de otra persona"]]} /></LabeledInput>{paidFrom === "cash_drawer" && <CashDrawerField value={cashDrawerId} onChange={setCashDrawerId} disabled={!!cashMovementId} id="purchase-cash-drawer" />}{paidFrom === "cash_drawer" && compatibleMovements.length > 0 && <LabeledInput label="Salida de caja ya registrada"><NativeSelect label="Salida de caja ya registrada" value={cashMovementId || (checkedCash ? "_new" : "_choose")} onChange={(value) => { setCheckedCash(value !== "_choose"); const id = value === "_new" || value === "_choose" ? "" : value; setCashMovementId(id); const movement = compatibleMovements.find((candidate) => candidate.id === id); if (movement) { setPaidOn(movement.movement_on); setCashDrawerId(movement.cash_drawer_id); setMethod("cash"); } }} options={[["_choose", "Selecciona si ya registraste la salida"], ["_new", "Es otro pago: registrar una nueva salida"], ...compatibleMovements.map((movement) => [movement.id, `${fmtDate(movement.movement_on)} · ${movement.reason}`] as const)]} /></LabeledInput>}</div><Alert variant="default"><AlertDescription>{paidFrom === "cash_drawer" ? cashMovementId ? "Esta salida ya se descontó de caja." : "Se descontará el pago del efectivo de esta caja." : "Cuenta como compra pagada. El efectivo de recepción no cambia."}</AlertDescription></Alert><Button className="w-full" onClick={event => { if (validateDateFields(event)) submit(); }} disabled={pay.isPending || !paidOn}>{pay.isPending && <Loader2 className="h-4 w-4 animate-spin" />}Registrar pago</Button></>}</DialogContent></Dialog>;
}

function CorrectInventoryPurchaseDialog({ purchase, onClose }: { purchase: InventoryPurchase | null; onClose(): void }) {
  const correct = useCorrectInventoryPurchase();
  const [mode, setMode] = useState<"replace" | "annul">("replace");
  const [quantity, setQuantity] = useState(""); const [unitCost, setUnitCost] = useState(""); const [reason, setReason] = useState("");
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => { if (purchase) { setMode("replace"); setQuantity(String(purchase.quantity)); setUnitCost(String(purchase.unit_cost)); setReason(""); attempt.current = null; } }, [purchase]);
  const submit = async () => {
    if (!purchase || reason.trim().length < 3) return toast.error("Explica brevemente la corrección.");
    const quantityValue = Number(quantity); const costValue = Number(unitCost);
    if (mode === "replace" && (!Number.isInteger(quantityValue) || quantityValue <= 0 || !Number.isFinite(costValue) || costValue <= 0)) return toast.error("Captura cantidad entera y costo válidos.");
    const payload = mode === "annul" ? { version: purchase.version, annul: true as const, correction_reason: reason.trim() } : { version: purchase.version, quantity: quantityValue, unit_cost: costValue, correction_reason: reason.trim() };
    attempt.current = keyForPayload(attempt.current, { purchase_id: purchase.id, ...payload });
    try {
      const result = await correct.mutateAsync({ id: purchase.id, ...payload, idempotency_key: attempt.current.key });
      attempt.current = null;
      toast.success(purchase.separate_receipt ? "Compra corregida. La recepción se conserva." : mode === "annul" ? "Compra anulada; existencias y costo quedaron revertidos." : `Compra corregida · ajuste de existencias ${result.stock_delta && result.stock_delta > 0 ? "+" : ""}${result.stock_delta ?? 0}.`);
      onClose();
    } catch (error) { toast.error(error instanceof ApiError ? error.message : t.form.errors.generic); }
  };
  return <Dialog open={!!purchase} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Corregir compra recibida</DialogTitle><DialogDescription>{purchase?.separate_receipt ? "Se corregirá la compra. La recepción ya registrada se conserva." : "Se actualizarán la compra y las existencias. Si ya se pagó, también se corregirá el pago."}</DialogDescription></DialogHeader>{purchase && <><div className="rounded-md bg-muted p-3 text-sm"><strong>{purchase.product_name}</strong><p>{purchase.quantity} uds × {moneyPlain(purchase.unit_cost)} = {moneyPlain(purchase.total_amount)}</p></div><LabeledInput label="Acción"><NativeSelect label="Acción" value={mode} onChange={(value) => setMode(value as typeof mode)} options={[["replace", "Corregir cantidad o costo"], ["annul", "Anular compra completa"]]} /></LabeledInput>{mode === "replace" && <div className="grid grid-cols-2 gap-3"><LabeledInput label="Cantidad real"><Input type="number" min="1" step="1" value={quantity} onChange={(event) => setQuantity(event.target.value)} /></LabeledInput><LabeledInput label="Costo unitario real"><Input type="number" min="0.01" step="0.01" value={unitCost} onChange={(event) => setUnitCost(event.target.value)} /></LabeledInput></div>}<LabeledInput label="Motivo de corrección *"><Input maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej. se capturaron 40 aguas y eran 4" /></LabeledInput><Alert variant="warning"><AlertDescription>{purchase.separate_receipt ? "Las existencias no cambian. Si el conteo está mal, ajústalo en Productos." : mode === "annul" ? "Se restarán las unidades de esta compra. Deben seguir disponibles en inventario." : "Sólo puedes restar unidades que sigan disponibles."}</AlertDescription></Alert><Button className="w-full" variant={mode === "annul" ? "destructive" : "default"} onClick={submit} disabled={correct.isPending || reason.trim().length < 3}>{mode === "annul" ? "Anular compra" : "Guardar corrección"}</Button></>}</DialogContent></Dialog>;
}

function ReopenInventoryPurchaseDialog({ purchase, onClose }: { purchase: InventoryPurchase | null; onClose(): void }) {
  const reopen = useReopenInventoryPurchase(); const [reason, setReason] = useState("");
  useEffect(() => { if (purchase) setReason(""); }, [purchase]);
  const submit = async () => { if (!purchase || reason.trim().length < 3) return; try { await reopen.mutateAsync({ id: purchase.id, version: purchase.version, correction_reason: reason.trim() }); toast.success("La compra volvió a Por pagar."); onClose(); } catch (error) { toast.error(error instanceof ApiError ? error.message : t.form.errors.generic); } };
  return <Dialog open={!!purchase} onOpenChange={(open) => !open && onClose()}><DialogContent><DialogHeader><DialogTitle>Volver compra a pendiente</DialogTitle><DialogDescription>El pago volverá a pendiente y se anulará su salida de caja, si la hubo. Las existencias se conservan.</DialogDescription></DialogHeader><LabeledInput label="Motivo de corrección *"><Input maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ej. cantidad o costo capturado incorrectamente" autoFocus /></LabeledInput><Alert variant="warning"><AlertDescription>Úsalo sólo si marcaste la compra como pagada por error.</AlertDescription></Alert><Button className="w-full" onClick={submit} disabled={reopen.isPending || reason.trim().length < 3}>Reabrir pago</Button></DialogContent></Dialog>;
}

function OccurrencesPanel({ items, status, loading, error, isOwner, onResolve, onSkip, onReopen }: { items: ExpenseOccurrence[]; status: "pending" | "skipped"; loading: boolean; error: unknown; isOwner: boolean; onResolve(item: ExpenseOccurrence): void; onSkip(item: ExpenseOccurrence): void; onReopen(item: ExpenseOccurrence): void }) {
  const money = useMoneyVisibility();
  if (loading) return <LoadingSection label="Cargando pagos…" />;
  if (error) return <PanelError label="No pudimos cargar los pagos." />;
  if (status === "skipped") {
    const skipped = items.filter(item => item.status === "skipped").sort((a, b) => (b.resolved_at ?? b.due_on).localeCompare(a.resolved_at ?? a.due_on));
    if (skipped.length === 0) return <p className="py-12 text-center text-sm text-muted-foreground">No hay pagos omitidos en este período.</p>;
    return <div className="divide-y rounded-lg border bg-card">
      {skipped.map(item => <div key={item.id} className="flex flex-wrap items-center gap-3 p-4">
        <div className="min-w-0 flex-1">
          <p className="font-medium break-words">{item.name || item.payee_name || t.categories[item.category]}</p>
          <p className="text-xs text-muted-foreground">Previsto para {fmtDate(item.due_on)}</p>
          {item.skip_reason && <p className="mt-1 text-sm text-muted-foreground break-words">{item.skip_reason}</p>}
        </div>
        <div className="shrink-0 text-right">
          <p className="text-xs text-muted-foreground">Monto previsto</p>
          <strong className="tabular-nums text-sm">{money.fmt(item.expected_amount)}</strong>
        </div>
        {isOwner && <Button className="min-h-10 w-full sm:w-auto" variant="outline" onClick={() => onReopen(item)}>Volver a pendiente</Button>}
      </div>)}
    </div>;
  }
  const pending = items.filter((item) => item.status === "pending").sort((a, b) => a.due_on.localeCompare(b.due_on));
  const now = todayIso();
  const week = new Date(); week.setDate(week.getDate() + 7);
  const weekEnd = fmtIso(week);
  const laterStart = new Date(week); laterStart.setDate(laterStart.getDate() + 1);
  const lastDay = new Date(); lastDay.setDate(lastDay.getDate() + 30);
  const groups: [string, ExpenseOccurrence[]][] = [
    ["Vencidos", pending.filter((item) => item.due_on < now)],
    ["Hoy", pending.filter((item) => item.due_on === now)],
    ["Próximos 7 días", pending.filter((item) => item.due_on > now && item.due_on <= weekEnd)],
    [`Más adelante · ${fmtDate(fmtIso(laterStart))} al ${fmtDate(fmtIso(lastDay))}`, pending.filter((item) => item.due_on > weekEnd)],
  ];
  return <SectionCard title="Próximos pagos"  flush>
    {pending.length === 0 ? <EmptyState icon={<CalendarClock className="h-8 w-8" />} title="Sin pagos pendientes en este período" /> : groups.filter(([, rows]) => rows.length > 0).map(([label, rows]) => <section key={label}>
      <h3 className={cn("px-4 py-2 text-xs font-semibold uppercase tracking-wide bg-muted/60", label === "Vencidos" && "text-destructive")}>{label}</h3>
      <div className="divide-y">{rows.map((item) => <div key={item.id} className="p-4 flex flex-wrap items-center gap-3">
        <div className="flex-1 min-w-[180px]"><p className="font-semibold">{item.name || item.payee_name || t.categories[item.category]}</p><p className={cn("text-xs", item.due_on < now ? "text-destructive" : "text-muted-foreground")}>{fmtDate(item.due_on)} · {t.categories[item.category]} · {t.methods[item.payment_method]}</p></div>
        <strong className="tabular-nums">{money.fmt(item.expected_amount)}</strong>
        <div className="grid grid-cols-2 sm:flex gap-2 w-full sm:w-auto"><Button className="min-h-10" size="sm" onClick={() => onResolve(item)}>Registrar pago</Button><Button className="min-h-10" size="sm" variant="ghost" onClick={() => onSkip(item)}>Omitir</Button></div>
      </div>)}</div>
    </section>)}
  </SectionCard>;
}

function RecurringPanel({ items, loading, error, onEdit, onCreate }: { items: ExpenseTemplate[]; loading: boolean; error: unknown; onEdit(item: ExpenseTemplate): void; onCreate(): void }) {
  const money = useMoneyVisibility();
  const active = useSetExpenseTemplateActive();
  if (loading) return <LoadingSection label="Cargando pagos…" />;
  if (error) return <PanelError label="No se pudieron cargar los pagos." />;
  return <SectionCard title="Pagos que se repiten" description="Te recuerda pagar; no hace cargos automáticos." action={<Button size="sm" onClick={onCreate}><Plus className="h-4 w-4 mr-1" />Programar pago</Button>} flush>{items.length === 0 ? <EmptyState icon={<Repeat2 className="h-8 w-8" />} title="Aún no hay pagos programados" hint="Programa la renta, los servicios o la nómina." action={<Button size="sm" onClick={onCreate}>Programar pago</Button>} /> : <div className="divide-y">{items.map((item) => <div key={item.id} className="p-4 grid sm:grid-cols-[1fr_130px_100px_auto] gap-3 items-center"><div><p className="font-semibold">{item.name}</p><p className="text-xs text-muted-foreground">{item.payee_name || "Sin proveedor"} · {t.categories[item.category]}</p><p className="text-xs text-muted-foreground">{frequencyLabel(item.frequency)} · próximo {fmtDate(item.next_due_on)} · {item.classification === "fixed" ? "Fijo" : "Variable"}</p></div><strong className="tabular-nums">{money.fmt(item.expected_amount)}</strong><p className={cn("text-xs", item.active ? "text-emerald-600" : "text-muted-foreground")}>{item.active ? "Activo" : "Pausado"}</p><div className="flex gap-2"><Button className="min-h-10" size="sm" variant="outline" onClick={() => onEdit(item)}>Editar</Button><Button className="min-h-10" size="sm" variant="ghost" title={item.active ? "Pausa futuros pagos; conserva los pendientes." : "Continúa desde hoy, sin agregar pagos del período pausado."} disabled={active.isPending} onClick={() => active.mutate({ id: item.id, active: !item.active, version: item.version }, { onSuccess: () => toast.success(item.active ? "Pago pausado. Los pendientes siguen por pagar." : "Pago reactivado desde hoy, sin agregar atrasos."), onError: (error) => toast.error(error instanceof ApiError ? error.message : t.form.errors.generic) })}>{item.active ? "Pausar" : "Reactivar"}</Button></div></div>)}</div>}</SectionCard>;
}

const CASH_CLASSIFICATION_LABELS: Record<CashMovement["classification_status"], string> = {
  unclassified: "Por clasificar",
  expense: "Gasto",
  inventory_purchase: "Compra de productos",
  non_operating: "Entrega o movimiento de dinero",
};

function CashMovementHistoryPanel({
  response, loading, error, from, to, status, onFrom, onTo, onStatus, onPage,
  operatorNames, onClassify, onUnclassify, onEdit, onCorrectExpense, onCorrectPurchase,
}: {
  response?: CashMovementListResponse;
  loading: boolean;
  error: unknown;
  from: string;
  to: string;
  status: CashMovementStatus;
  onFrom(value: string): void;
  onTo(value: string): void;
  onStatus(value: CashMovementStatus): void;
  onPage(value: number): void;
  operatorNames: Record<string, string>;
  onClassify(item: CashMovement): void;
  onUnclassify(item: CashMovement): void;
  onEdit(item: CashMovement): void;
  onCorrectExpense(item: CashMovement): void;
  onCorrectPurchase(item: CashMovement): void;
}) {
  const money = useMoneyVisibility();
  const items = response?.items ?? [];
  const page = response?.page ?? 1;
  const pageSize = response?.page_size ?? PAGE_SIZE;
  const pages = Math.max(1, Math.ceil((response?.total ?? 0) / Math.max(1, pageSize)));
  return <div className="space-y-4">
    <Alert>
      <AlertDescription>Entradas y salidas de efectivo de recepción.</AlertDescription>
    </Alert>
    <div className="grid gap-3 sm:grid-cols-3">
      <div className="sm:col-span-2 self-end"><DateRangePicker from={from} to={to} onChange={(start, end) => { onFrom(start); onTo(end); onPage(1); }} /></div>
      <LabeledInput label="Estado"><NativeSelect label="Estado" value={status} onChange={(value) => onStatus(value as CashMovementStatus)} options={[["all", "Todos"], ["pending", "Por clasificar"], ["classified", "Clasificados"], ["expense", "Gastos"], ["inventory_purchase", "Compras de productos"], ["non_operating", "Entregas de dinero"]]} /></LabeledInput>
    </div>
    {loading ? <LoadingSection label="Cargando movimientos físicos…" /> : error ? <PanelError label="No pudimos cargar el historial físico de caja." /> : <SectionCard title="Entradas y salidas de todas las cajas" description={`${response?.total ?? 0} movimientos en el filtro`} flush>
      {items.length === 0 ? <EmptyState icon={<Wallet className="h-8 w-8" />} title="No hay movimientos físicos en este filtro" hint="Prueba otro rango o estado." /> : <div className="divide-y">{items.map((item) => {
        const isOut = item.movement_type === "cash_out";
        const actions = cashMovementActions(item);
        return <div key={item.id} className="p-4 flex flex-wrap items-center gap-3">
          <div className="flex-1 min-w-[210px]"><p className="font-semibold">{item.reason}</p><p className="text-xs text-muted-foreground">{fmtDate(item.movement_on)} · {operatorNames[item.operator_id] || "Personal de recepción"} · {CASH_CLASSIFICATION_LABELS[item.classification_status]}</p></div>
          <strong className={cn("tabular-nums", isOut ? "text-destructive" : "text-emerald-700")}>{isOut ? "−" : "+"}{money.fmt(item.amount)}</strong>
          {actions.canEdit && <Button className="w-full sm:w-auto min-h-10" size="sm" variant="outline" onClick={() => onEdit(item)}>Editar movimiento</Button>}
          {actions.canClassify && <Button className="w-full sm:w-auto min-h-10" size="sm" onClick={() => onClassify(item)}>Clasificar</Button>}
          {actions.canUnclassify && <Button className="w-full sm:w-auto min-h-10" size="sm" variant="outline" onClick={() => onUnclassify(item)}>Corregir clasificación</Button>}
          {item.classification_status === "expense" && item.expense_id && <Button className="w-full sm:w-auto min-h-10" variant="outline" onClick={() => onCorrectExpense(item)}>Corregir gasto</Button>}{item.classification_status === "inventory_purchase" && <Button className="w-full sm:w-auto min-h-10" variant="outline" onClick={() => onCorrectPurchase(item)}>Corregir compra</Button>}
        </div>;
      })}</div>}
    </SectionCard>}
    {pages > 1 && <div className="flex items-center justify-end gap-2"><Button variant="outline" size="sm" onClick={() => onPage(Math.max(1, page - 1))} disabled={page <= 1 || loading}>Anterior</Button><span className="text-sm tabular">{page} / {pages}</span><Button variant="outline" size="sm" onClick={() => onPage(Math.min(pages, page + 1))} disabled={page >= pages || loading}>Siguiente</Button></div>}
  </div>;
}

function LoadingSection({ label }: { label: string }) { return <SectionCard><div className="flex items-center justify-center gap-2 py-14 text-sm text-muted-foreground"><Loader2 className="h-5 w-5 animate-spin" />{label}</div></SectionCard>; }
function PanelError({ label }: { label: string }) { return <Alert variant="destructive"><AlertDescription>{label} Intenta de nuevo.</AlertDescription></Alert>; }

const frequencies:ExpenseFrequency[]=["weekly","every_14_days","semimonthly","monthly","bimonthly","quarterly","semiannual","annual"];
function frequencyLabel(value:ExpenseFrequency){return ({weekly:"Semanal",every_14_days:"Cada 14 días",semimonthly:"Quincenal",monthly:"Mensual",bimonthly:"Cada 2 meses",quarterly:"Trimestral",semiannual:"Semestral",annual:"Anual"} as Record<ExpenseFrequency,string>)[value]}
function TemplateDialog({ open, onOpenChange, initial }: { open: boolean; onOpenChange(value: boolean): void; initial?: ExpenseTemplate }) {
  const create = useCreateExpenseTemplate();
  const update = useUpdateExpenseTemplate();
  const [name, setName] = useState("");
  const [payee, setPayee] = useState("");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<ExpenseCategory>("servicios");
  const [method, setMethod] = useState<ExpensePaymentMethod>("transfer");
  const [classification, setClassification] = useState<"fixed" | "variable">("fixed");
  const [frequency, setFrequency] = useState<ExpenseFrequency>("monthly");
  const [startsOn, setStartsOn] = useState(todayIso());
  const [endsOn, setEndsOn] = useState("");
  const createAttempt = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => {
    if (!open) return;
    setName(initial?.name ?? ""); setPayee(initial?.payee_name ?? ""); setAmount(initial ? String(initial.expected_amount) : "");
    setCategory(initial?.category ?? "servicios"); setMethod(initial?.usual_payment_method ?? "transfer"); setClassification(initial?.classification ?? "fixed");
    setFrequency(initial?.frequency ?? "monthly"); setStartsOn(initial?.starts_on ?? todayIso()); setEndsOn(initial?.ends_on ?? ""); createAttempt.current = null;
  }, [open, initial]);
  const submit = async () => {
    const value = Number(amount);
    if (!name.trim()) return toast.error("Escribe el nombre del pago.");
    if (moneyInputError(amount)) return toast.error(moneyInputError(amount));
    if (!startsOn || (endsOn && endsOn < startsOn)) return toast.error("Revisa las fechas de inicio y fin.");
    const body = { name: name.trim(), payee_name: payee || undefined, expected_amount: value, category, usual_payment_method: method, classification, frequency, starts_on: startsOn, ends_on: endsOn || undefined, version: initial?.version };
    try {
      if (initial) await update.mutateAsync({ id: initial.id, ...body }); else { createAttempt.current = keyForPayload(createAttempt.current, body); await create.mutateAsync({ ...body, idempotency_key: createAttempt.current.key }); createAttempt.current = null; }
      toast.success(initial ? "Pago que se repite actualizado" : "Pago programado"); onOpenChange(false);
    } catch (error) { toast.error(error instanceof ApiError ? error.message : t.form.errors.generic); }
  };
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>{initial ? "Editar pago que se repite" : "Programar pago"}</DialogTitle></DialogHeader><p className="text-sm text-muted-foreground">Te recuerda pagar; no hace cargos automáticos.</p><div className="grid sm:grid-cols-2 gap-3"><LabeledInput label="Nombre"><Input value={name} maxLength={120} onChange={(e) => setName(e.target.value)} placeholder="Ej. Renta del local" autoFocus /></LabeledInput><LabeledInput label="Proveedor"><Input value={payee} maxLength={120} onChange={(e) => setPayee(e.target.value)} /></LabeledInput><LabeledInput label="Monto esperado"><Input value={amount} onChange={(e) => setAmount(e.target.value)} type="number" min="0.01" step="0.01" inputMode="decimal" /></LabeledInput><LabeledInput label="Categoría"><NativeSelect label="Categoría" value={category} onChange={(v) => setCategory(v as ExpenseCategory)} options={EXPENSE_CATEGORIES.map((v) => [v, t.categories[v]])} /></LabeledInput><LabeledInput label="Método habitual"><NativeSelect label="Método habitual" value={method} onChange={(v) => setMethod(v as ExpensePaymentMethod)} options={EXPENSE_PAYMENT_METHODS.map((v) => [v, t.methods[v]])} /></LabeledInput><LabeledInput label="Fijo o variable"><NativeSelect label="Fijo o variable" value={classification} onChange={(v) => setClassification(v as "fixed" | "variable")} options={[["fixed", "Fijo"], ["variable", "Variable"]]} /></LabeledInput><LabeledInput label="Frecuencia"><NativeSelect label="Frecuencia" value={frequency} onChange={(v) => setFrequency(v as ExpenseFrequency)} options={frequencies.map((v) => [v, frequencyLabel(v)])} /></LabeledInput><LabeledInput label="Fecha inicial"><DateInput value={startsOn} onValueChange={(e) => setStartsOn(e)} /></LabeledInput><LabeledInput label="Fecha final opcional"><DateInput min={startsOn} value={endsOn} onValueChange={(e) => setEndsOn(e)} /></LabeledInput></div><RecurringPreview start={startsOn} frequency={frequency} end={endsOn} />{frequency === "semimonthly" && <p className="text-xs text-muted-foreground">Se repite el día 15 y el último día del mes.</p>}{frequency === "every_14_days" && <p className="text-xs text-muted-foreground">Se repite cada 14 días a partir de la fecha inicial.</p>}{["monthly", "bimonthly", "quarterly", "semiannual", "annual"].includes(frequency) && Number(startsOn.slice(-2)) >= 29 && <p className="text-xs text-muted-foreground">Si el mes tiene menos días, se usará su último día.</p>}{initial && <Alert><AlertDescription>Los cambios se aplican a pagos pendientes. Para cambiar fechas o frecuencia, primero paga u omite esos pendientes.</AlertDescription></Alert>}<Button className="w-full" disabled={create.isPending || update.isPending} onClick={event => { if (validateDateFields(event)) submit(); }}>Guardar programación</Button></DialogContent></Dialog>;
}

function OccurrenceResolutionDialog({ occurrence, onClose }: { occurrence: ExpenseOccurrence | null; onClose(): void }) {
 return <Dialog open={!!occurrence} onOpenChange={open => !open && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Registrar pago</DialogTitle></DialogHeader>{occurrence && <ScheduledPaymentForm key={occurrence.id} occurrence={occurrence} onClose={onClose} />}</DialogContent></Dialog>;
}

function SkipOccurrenceDialog({ occurrence, onClose }: { occurrence: ExpenseOccurrence | null; onClose(): void }) {
  const skip = useSkipOccurrence();
  const [reason, setReason] = useState("");
  useEffect(() => { if (occurrence) setReason(""); }, [occurrence]);
  const confirm = () => {
    if (!occurrence || reason.trim().length < 2) return toast.error("Explica brevemente por qué no aplica.");
    skip.mutate({ id: occurrence.id, reason: reason.trim() }, { onSuccess: () => { toast.success("Pago omitido."); onClose(); }, onError: (error) => toast.error(error instanceof ApiError ? error.message : t.form.errors.generic) });
  };
  return <AlertDialog open={!!occurrence} onOpenChange={(open) => !open && onClose()}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Omitir este pago</AlertDialogTitle><AlertDialogDescription>Omite un pago si ya no corresponde. Si lo pagarás después, déjalo pendiente.</AlertDialogDescription></AlertDialogHeader><LabeledInput label="Razón"><Input value={reason} maxLength={200} onChange={(e) => setReason(e.target.value)} placeholder="Ej. servicio cancelado" autoFocus /></LabeledInput><AlertDialogFooter><AlertDialogCancel disabled={skip.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); confirm(); }} disabled={skip.isPending}>Omitir pago</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function ReopenOccurrenceDialog({ occurrence, onClose }: { occurrence: ExpenseOccurrence | null; onClose(): void }) {
  const reopen = useReopenOccurrence();
  const [reason, setReason] = useState("");
  useEffect(() => { if (occurrence) setReason(""); }, [occurrence]);
  const confirm = () => {
    if (!occurrence || reason.trim().length < 3) return toast.error("Escribe el motivo de la corrección.");
    reopen.mutate({ id: occurrence.id, version: occurrence.version, correction_reason: reason.trim() }, {
      onSuccess: () => { toast.success("El pago volvió a pendientes."); onClose(); },
      onError: (error) => toast.error(error instanceof ApiError ? error.message : t.form.errors.generic),
    });
  };
  return <AlertDialog open={!!occurrence} onOpenChange={(open) => !open && onClose()}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Volver pago a pendiente</AlertDialogTitle><AlertDialogDescription>{occurrence?.status === "paid" ? "El pago volverá a pendiente. Se anularán el gasto y su salida de caja, si la hubo." : "El pago volverá a aparecer en Pendientes."}</AlertDialogDescription></AlertDialogHeader><LabeledInput label="Motivo de la corrección *"><Input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="Ej. lo omití por error" autoFocus /></LabeledInput><AlertDialogFooter><AlertDialogCancel disabled={reopen.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); confirm(); }} disabled={reopen.isPending || reason.trim().length < 3}>Volver a pendiente</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function CashClassificationDialog({ movement, onClose }: { movement: CashMovement | null; onClose(): void }) {
  const classify = useClassifyCashMovement();
  const [category, setCategory] = useState<ExpenseCategory>("otros");
  const [classification, setClassification] = useState<"fixed" | "variable">("variable");
  const [payee, setPayee] = useState("");
  const [description, setDescription] = useState("");
  const [reference, setReference] = useState("");
  const [purpose, setPurpose] = useState("expense");
  useEffect(() => { if (movement) { setCategory("otros"); setClassification("variable"); setPayee(""); setDescription(movement.reason); setReference(""); setPurpose("expense"); } }, [movement]);
  const submit = async () => {
    if (!movement) return;
    try {
      await classify.mutateAsync(purpose === "non_operating" ? { id: movement.id, non_operating: true } : { id: movement.id, paid_on: movement.movement_on, category, classification, payee_name: payee || undefined, description: description || undefined, reference: reference || undefined });
      toast.success("Salida clasificada."); onClose();
    } catch (error) { toast.error(error instanceof ApiError ? error.message : t.form.errors.generic); }
  };
  return <Dialog open={!!movement} onOpenChange={(open) => !open && !classify.isPending && onClose()}>
    <DialogContent className="max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Clasificar salida de caja</DialogTitle><DialogDescription>Esta salida ya se descontó de caja. No se restará de nuevo.</DialogDescription></DialogHeader>
      {movement && <>
        <div className="flex justify-between gap-3 rounded-md bg-muted p-3 text-sm"><span>{fmtDate(movement.movement_on)} · {movement.reason}</span><strong>{moneyPlain(movement.amount)}</strong></div>
        <fieldset className="space-y-2">
          <legend className="mb-2 text-sm font-medium">¿Para qué se usó el dinero?</legend>
          {[ ["expense", "Pagar un gasto"], ["non_operating", "Entregar o mover dinero"] ].map(([key, label]) => <label key={key} className="flex cursor-pointer items-center gap-3 rounded-md border p-3 text-sm"><input type="radio" name="cash-classification-purpose" value={key} checked={purpose === key} onChange={() => setPurpose(key)} /><span>{label}</span></label>)}
        </fieldset>
        {purpose === "expense" ? <>
          <LabeledInput label="Categoría"><NativeSelect label="Categoría" value={category} onChange={next => setCategory(next as ExpenseCategory)} options={EXPENSE_CATEGORIES.map(next => [next, t.categories[next]])} /></LabeledInput>
          <LabeledInput label="Descripción"><Input maxLength={200} value={description} onChange={event => setDescription(event.target.value)} /></LabeledInput>
          <details className="space-y-3"><summary className="cursor-pointer text-sm">Más datos</summary><div className="grid gap-3 sm:grid-cols-2">
            <LabeledInput label="Fijo o variable"><NativeSelect label="Fijo o variable" value={classification} onChange={next => setClassification(next as "fixed" | "variable")} options={[["fixed", "Fijo"], ["variable", "Variable"]]} /></LabeledInput>
            <LabeledInput label="Proveedor o persona"><Input maxLength={120} value={payee} onChange={event => setPayee(event.target.value)} /></LabeledInput>
            <LabeledInput label="Referencia"><Input maxLength={120} value={reference} onChange={event => setReference(event.target.value)} /></LabeledInput>
          </div></details>
        </> : <p className="text-sm text-muted-foreground">No se contará como gasto.</p>}
        <details className="text-xs text-muted-foreground"><summary className="cursor-pointer">¿Fue una devolución a un cliente?</summary><p className="mt-2">Anula esta salida y registra la devolución desde el cobro original para no descontar el dinero dos veces.</p></details>
        <div className="flex justify-end gap-2"><Button variant="outline" onClick={onClose} disabled={classify.isPending}>Cancelar</Button><Button onClick={submit} disabled={classify.isPending}>Guardar clasificación</Button></div>
      </>}
    </DialogContent>
  </Dialog>;
}

function UnclassifyCashDialog({ movement, onClose }: { movement: CashMovement | null; onClose(): void }) {
  const unclassify = useUnclassifyCashMovement();
  const [reason, setReason] = useState("");
  useEffect(() => { if (movement) setReason(""); }, [movement]);
  const submit = async () => {
    if (!movement || reason.trim().length < 3) return;
    try {
      await unclassify.mutateAsync({ id: movement.id, version: movement.version, correction_reason: reason.trim() });
      toast.success("Clasificación corregida.");
      onClose();
    } catch (error) {
      toast.error(error instanceof ApiError ? error.message : t.form.errors.generic);
    }
  };
  return <AlertDialog open={!!movement} onOpenChange={(open) => !open && onClose()}><AlertDialogContent><AlertDialogHeader><AlertDialogTitle>Corregir clasificación del movimiento</AlertDialogTitle><AlertDialogDescription>{movement?.classification_status === "expense" ? "El gasto se quitará del resultado. Si cubría un pago programado, volverá a pendiente. El efectivo no cambia." : "La salida volverá a “Por clasificar”. El efectivo no cambia."}</AlertDialogDescription></AlertDialogHeader><LabeledInput label="Motivo de la corrección *"><Input value={reason} maxLength={200} onChange={(event) => setReason(event.target.value)} placeholder="Ej. se clasificó como renta por error" autoFocus /></LabeledInput><AlertDialogFooter><AlertDialogCancel disabled={unclassify.isPending}>Cancelar</AlertDialogCancel><AlertDialogAction onClick={(event) => { event.preventDefault(); submit(); }} disabled={unclassify.isPending || reason.trim().length < 3}>Corregir clasificación</AlertDialogAction></AlertDialogFooter></AlertDialogContent></AlertDialog>;
}

function EditCashMovementDialog({ movement, onClose }: { movement: CashMovement | null; onClose(): void }) {
  const update = useUpdateCashMovement();
  const remove = useDeleteCashMovement();
  const [movementOn, setMovementOn] = useState(todayIso());
  const [amount, setAmount] = useState("");
  const [movementType, setMovementType] = useState<"cash_in" | "cash_out">("cash_out");
  const [reason, setReason] = useState("");
  const [cashDrawerId, setCashDrawerId] = useState<string>();
  const [correctionReason, setCorrectionReason] = useState("");
  useEffect(() => {
    if (!movement) return;
    setMovementOn(movement.movement_on);
    setAmount(String(movement.amount));
    setMovementType(movement.movement_type);
    setReason(movement.reason);
    setCashDrawerId(movement.cash_drawer_id);
    setCorrectionReason("");
  }, [movement]);
  const validate = () => {
    const numeric = Number(amount);
    if (!Number.isFinite(numeric) || numeric <= 0) { toast.error("Captura un monto válido."); return null; }
    if (!movementOn || !reason.trim() || correctionReason.trim().length < 3) { toast.error("Completa el movimiento y explica la corrección."); return null; }
    return numeric;
  };
  const save = async () => {
    if (!movement) return;
    const numeric = validate();
    if (numeric === null) return;
    try {
      await update.mutateAsync({ id: movement.id, version: movement.version, movement_on: movementOn, amount: numeric, movement_type: movementType, reason: reason.trim(), cash_drawer_id: cashDrawerId, correction_reason: correctionReason.trim() });
      toast.success("Movimiento corregido.");
      onClose();
    } catch (error) { toast.error(error instanceof ApiError ? error.message : t.form.errors.generic); }
  };
  const destroy = async () => {
    if (!movement || correctionReason.trim().length < 3) return toast.error("Explica por qué debe anularse.");
    try {
      await remove.mutateAsync({ id: movement.id, version: movement.version, correction_reason: correctionReason.trim() });
      toast.success("Movimiento anulado.");
      onClose();
    } catch (error) { toast.error(error instanceof ApiError ? error.message : t.form.errors.generic); }
  };
  return <Dialog open={!!movement} onOpenChange={(open) => !open && onClose()}><DialogContent className="max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Editar movimiento de caja</DialogTitle><DialogDescription>Corrige la fecha, el monto o el concepto del movimiento.</DialogDescription></DialogHeader><div className="grid sm:grid-cols-2 gap-3"><LabeledInput label="Fecha"><DateInput context="recent" max={todayIso()} value={movementOn} onValueChange={(event) => setMovementOn(event)} /></LabeledInput><LabeledInput label="Monto"><Input type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} /></LabeledInput><LabeledInput label="Tipo"><NativeSelect label="Tipo" value={movementType} onChange={(value) => setMovementType(value as typeof movementType)} options={[["cash_in", "Entrada física"], ["cash_out", "Salida física"]]} /></LabeledInput><LabeledInput label="Concepto"><Input maxLength={200} value={reason} onChange={(event) => setReason(event.target.value)} /></LabeledInput><CashDrawerField value={cashDrawerId} onChange={setCashDrawerId} id="edit-cash-movement-drawer" /><LabeledInput label="Motivo de corrección *"><Input maxLength={200} value={correctionReason} onChange={(event) => setCorrectionReason(event.target.value)} placeholder="Ej. monto capturado incorrectamente" /></LabeledInput></div><Alert variant="warning"><AlertDescription>Los cortes afectados por esta corrección deberán revisarse.</AlertDescription></Alert><div className="flex flex-wrap justify-between gap-2"><Button variant="ghost" className="text-destructive" onClick={destroy} disabled={remove.isPending || update.isPending || correctionReason.trim().length < 3}>Anular movimiento</Button><Button onClick={event => { if (validateDateFields(event)) save(); }} disabled={remove.isPending || update.isPending || correctionReason.trim().length < 3}>Guardar corrección</Button></div></DialogContent></Dialog>;
}
function NativeSelect({label,value,onChange,options}:{label:string;value:string;onChange:(value:string)=>void;options:Array<readonly [string,string]>}){return <select aria-label={label} className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={value} onChange={e=>onChange(e.target.value)}>{options.map(([v,optionLabel])=><option key={v} value={v}>{optionLabel}</option>)}</select>}

function EditDialog({
  expense,
  isOwner,
  onClose,
  onAskDelete,
  onRepeat,
}: {
  expense: Expense | null;
  isOwner: boolean;
  onClose(): void;
  onAskDelete(e: Expense): void;
  onRepeat(e: Expense): void;
}) {
  const update = useUpdateExpense(expense?.id ?? "");
  const [serverError, setServerError] = useState<string | null>(null);
  const legacyUnverified = !!expense && needsCashSourceConfirmation(expense);

  async function submit(payload: ExpenseFormSubmitPayload) {
    if (!expense) return;
    setServerError(null);
    try {
      await update.mutateAsync({
        ...payload,
        correction_reason: payload.correction_reason!,
        version: expense.version,
      });
      toast.success(legacyUnverified
        ? payload.paid_from === "cash_drawer"
          ? "Origen confirmado · se creó una sola salida vinculada en Caja."
          : "Origen confirmado · el gasto quedó en el Fondo y no movió Caja."
        : t.form.success.updated);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.details as Record<string, unknown> | null;
        setServerError((data?.exception as string | undefined) || t.form.errors.generic);
      } else {
        setServerError(t.form.errors.generic);
      }
    }
  }

  return (
    <Dialog
      open={!!expense}
      onOpenChange={(o) => {
        if (!o) {
          setServerError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.form.titleEdit}</DialogTitle>
        </DialogHeader>
        {expense && (
          <>
            {legacyUnverified && isOwner && (
              <Alert variant="warning">
                <AlertDescription>
                  <strong className="block">Confirma si el dinero salió de Caja o del Fondo.</strong>
                  <span className="text-xs">Si se pagó desde Caja, se descontará de su efectivo. Confirma el origen del pago.</span>
                </AlertDescription>
              </Alert>
            )}
            <ExpenseForm
              key={expense.id}
              mode="edit"
              initial={{
                expense_date: expense.expense_date,
                amount: String(expense.amount),
                category: expense.category,
                payment_method: expense.payment_method,
				paid_from: expense.paid_from,
				cash_drawer_id: expense.cash_drawer_id ?? undefined,
                description: expense.description ?? "",
				payee_name:expense.payee_name??"",reference:expense.reference??"",classification:expense.classification,
              }}
              submitting={update.isPending || (legacyUnverified && !isOwner)}
              onSubmit={submit}
              onCancel={onClose}
              serverError={serverError}
            />
            <div className="flex justify-between border-t pt-4 mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => onAskDelete(expense)}
              >
                {t.page.rowDelete}
              </Button>
              <Button variant="outline" size="sm" onClick={() => onRepeat(expense)}>
                <Copy className="h-4 w-4 mr-1" />Repetir gasto
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirm({ expense, onClose }: { expense: Expense | null; onClose(): void }) {
  const del = useDeleteExpense();
  const [reason, setReason] = useState("");

  useEffect(() => {
    if (expense) setReason("");
  }, [expense]);

  async function confirm() {
    if (!expense || reason.trim().length < 3) return;
    try {
      await del.mutateAsync({
        id: expense.id,
        version: expense.version,
        correction_reason: reason.trim(),
      });
      toast.success(t.form.success.deleted);
      onClose();
    } catch {
      toast.error(t.form.errors.generic);
    }
  }

  return (
    <AlertDialog open={!!expense} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.page.deleteConfirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{t.page.deleteConfirm.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-2">
          <Label htmlFor="delete-expense-reason">Motivo *</Label>
          <Input
            id="delete-expense-reason"
            value={reason}
            maxLength={200}
            placeholder="Ej. el gasto se registró por duplicado"
            onChange={(event) => setReason(event.target.value)}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">
            Si cambia el efectivo, revisa el corte correspondiente.
          </p>
        </div>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>{common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={del.isPending || reason.trim().length < 3}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {del.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.page.deleteConfirm.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
