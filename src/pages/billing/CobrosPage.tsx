import { PageContainer } from "@/components/shared/PagePrimitives";
import { DateRangePicker } from "@/components/ui/date-range-picker";
import { OtherIncomeDialog } from "@/components/billing/OtherIncomeDialog";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useLocation, useNavigate, useSearchParams } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeftRight,
  Banknote,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  CreditCard,
  Loader2,
  Pencil,
  Plus,
  Receipt,
  ShoppingCart,
  Undo2,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableTh,
  EmptyState,
  FilterPill,
  PageHeader,
  SectionCard,
} from "@/components/shared/PagePrimitives";
import { MemberSearchInput } from "@/components/checkin/MemberSearchInput";
import { PaymentModal } from "@/components/billing/PaymentModal";
import { ReceiptViewer } from "@/components/billing/ReceiptViewer";
import {
  fmtMoney,
  useGymPayments,
  type GymPaymentsFilters,
  type Payment,
  type PaymentConcept,
  type PaymentMethod,
} from "@/hooks/useBilling";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { useMember } from "@/hooks/useMembers";
import { fmtDate, parseDate, todayIso } from "@/lib/dates";
import { billing as t } from "@/strings/billing";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePermission } from "@/lib/permissions";
import { RestrictedNote } from "@/components/shared/RestrictedNote";
import { useRegisterOtherIncome } from "@/hooks/useBilling";
import { SaleCorrectionModal } from "@/components/sales/SaleCorrectionModal";
import { ProductRefundModal } from "@/components/sales/ProductRefundModal";
import { CashDrawerField } from "@/components/cash/CashDrawerField";
import { RefundModal } from "@/components/billing/RefundModal";
import { PaymentCorrectionModal } from "@/components/billing/PaymentCorrectionModal";
import { keyForPayload } from "@/lib/idempotency";
import { HelpHint } from "@/components/shared/HelpHint";

type Period = "today" | "week" | "month" | "custom";

const PAGE_SIZE = 50;

function shiftDay(iso: string, days: number): string {
  const d = parseISO(`${iso}T00:00:00`);
  d.setDate(d.getDate() + days);
  return format(d, "yyyy-MM-dd");
}

function rangeFor(period: Period, customFrom: string, customTo: string): { from?: string; to?: string } {
  const today = todayIso();
  if (period === "today") return { from: today, to: today };
  if (period === "week") return { from: shiftDay(today, -6), to: today };
  if (period === "month") return { from: shiftDay(today, -29), to: today };
  return {
    from: customFrom || undefined,
    to: customTo || undefined,
  };
}

const CONCEPT_OPTIONS: Array<{ value: PaymentConcept | "all"; label: string }> = [
  { value: "all", label: t.cobranza.filters.conceptAll },
  { value: "membership", label: "Membresías" },
  { value: "product", label: "Productos" },
  { value: "balance_settlement", label: "Abonos" },
  { value: "refund", label: "Devoluciones" },
  { value: "other", label: "Otros ingresos" },
];

const METHOD_ICONS = { cash: Banknote, transfer: ArrowLeftRight, card: CreditCard } as const;

function MethodBadge({ method }: { method: PaymentMethod | null }) {
  if (!method || !(method in METHOD_ICONS)) return <span className="text-sm text-muted-foreground">—</span>;
  const Icon = METHOD_ICONS[method];
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap text-sm">
      <Icon aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      <span>{t.payment.methods[method]}</span>
    </span>
  );
}

function fmtTime(value: string): string {
  try {
    const d = parseISO(value);
    return format(d, "HH:mm", { locale: es });
  } catch {
    return "—";
  }
}

function fmtDay(value: string): string {
  // parseDate del lib: date-only → medianoche LOCAL. parseISO a pelo era
  // frágil — si payment_date algún día trae hora, el instante se pintaría
  // un día antes.
  const d = parseDate(value);
  if (!d) return "—";
  return format(d, "d MMM", { locale: es });
}

function conceptLabel(c: PaymentConcept): string {
  return t.history.concepts[c] || c;
}

// What the row is about, in words: names the row's actions for screen readers
// («Corregir cobro de Ana López», «Devolver cobro de Agua 1L ×2»).
function paymentSubject(p: Payment): string {
  return p.member_name || p.sale_summary || (p.concept === "other" ? p.notes : null) || conceptLabel(p.concept);
}

function rowAccent(p: Payment): string | null {
  if (p.concept === "refund" || p.amount < 0) return "text-destructive";
  if (p.balance_pending > 0) return "text-warning";
  return null;
}

export default function CobrosPage() {
  const navigate = useNavigate();
  // Venta rápida opens the day's sales here: offer the way back to the sale.
  const fromSales = (useLocation().state as { from?: string } | null)?.from === "sales";
  const money = useMoneyVisibility();
  const [params, setParams] = useSearchParams();
  // Without "view_totals" the backend only lists today and omits the
  // totals: stay on today whatever the URL says, so no other range is asked.
  const canViewTotals = usePermission("view_totals");
  const period: Period = !canViewTotals ? "today" : params.get("from") && params.get("to") ? "custom" : ["week", "month", "custom"].includes(params.get("period") ?? "") ? params.get("period") as Period : "today";
  const customFrom = params.get("from") ?? todayIso();
  const customTo = params.get("to") ?? todayIso();
  const concept = (Object.keys(t.history.concepts).includes(params.get("concept") ?? "") ? params.get("concept") : "all") as PaymentConcept | "all";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const setPage = (next: number | ((previous: number) => number)) => setParams(previous => { const p = new URLSearchParams(previous); p.set("page", String(typeof next === "function" ? next(page) : next)); return p; }, { replace: true });
  const setConcept = (value: PaymentConcept | "all") => setParams(previous => { const p = new URLSearchParams(previous); p.set("concept", value); p.delete("page"); return p; });

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedMemberId, setPickedMemberId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);
  const [otherIncomeOpen, setOtherIncomeOpen] = useState(false);
  const isOwner = useAuthStore((s) => s.user?.role === "owner");
  const currentUserId = useAuthStore((s) => s.user?.user_id);

  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptFolio, setReceiptFolio] = useState<string | undefined>(undefined);
  const [saleCorrectionTarget, setSaleCorrectionTarget] = useState<Payment | null>(null);
  const [paymentCorrectionTarget, setPaymentCorrectionTarget] = useState<Payment | null>(null);
  const [refundSaleId, setRefundSaleId] = useState<string | null>(null);
  const [refundPayment, setRefundPayment] = useState<Payment | null>(null);

  const range = useMemo(
    () => rangeFor(period, customFrom, customTo),
    [period, customFrom, customTo]
  );

  const filters: GymPaymentsFilters = useMemo(
    () => ({
      from: range.from,
      to: range.to,
      concept: concept === "all" ? undefined : concept,
      page,
      page_size: PAGE_SIZE,
    }),
    [range.from, range.to, concept, page]
  );

  const query = useGymPayments(filters);
  const items = query.data?.items ?? [];
  const totalPages = query.data
    ? Math.max(1, Math.ceil(query.data.total / Math.max(1, query.data.page_size)))
    : 1;

  const periodLabel = useMemo(() => {
    if (period === "today") return t.cobranza.period.today;
    if (period === "week") return t.cobranza.period.week;
    if (period === "month") return t.cobranza.period.month;
    return `${fmtDate(range.from)} – ${fmtDate(range.to)}`;
  }, [period, range]);

  // Member picked from search → fetch detail to feed PaymentModal.
  const pickedMember = useMember(pickedMemberId);

  function openPaymentForMember(id: string) {
    setPickedMemberId(id);
    setPickerOpen(false);
    setPaymentOpen(true);
  }

  function closePayment(open: boolean) {
    setPaymentOpen(open);
    if (!open) setPickedMemberId(null);
  }

  function setPeriodAndReset(p: Period) {
    setParams(previous => { const next = new URLSearchParams(previous); next.set("period", p); next.delete("page");
      if (p !== "custom") { next.delete("from"); next.delete("to"); }
      return next;
    });
  }

  return (
    <PageContainer className="space-y-6">
      {fromSales && (
        <Button asChild variant="ghost" size="sm" className="-ml-3 -mb-3">
          <Link to="/sales">
            <ChevronLeft aria-hidden="true" className="h-4 w-4" />
            {t.cobranza.backToSales}
          </Link>
        </Button>
      )}
      <PageHeader
        title={t.cobranza.title}
        subtitle={
          canViewTotals ? (
            t.cobranza.subtitle
          ) : (
            <div className="space-y-1">
              <p>{t.cobranza.todayOnly.subtitle}</p>
              <RestrictedNote permission="view_totals">{t.cobranza.todayOnly.note}</RestrictedNote>
            </div>
          )
        }
        actions={
          <div className="flex flex-wrap items-center gap-2">
          <HelpHint topic="cobrar" task="cobrar una membresía" />
          {isOwner && <Button requiresWrite variant="outline" onClick={() => setOtherIncomeOpen(true)}>
            <CircleDollarSign className="h-4 w-4 mr-2" />
            Otro ingreso
          </Button>}
          <Button requiresWrite
            size="lg"
            onClick={() => setPickerOpen(true)}
            variant="outline"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t.cobranza.chargeMember}
          </Button>
          </div>
        }
      />

      {/* Period filters. Without "view_totals" there is only today, already
          named in the subtitle: no lone «Hoy» pill to explain. */}
      <div className="flex flex-wrap items-center gap-3 [&_button]:min-h-11">
        {canViewTotals && <div role="group" aria-label={t.cobranza.period.label} className="flex flex-wrap items-center gap-3">
        <FilterPill
          label={t.cobranza.period.today}
          active={period === "today"}
          onClick={() => setPeriodAndReset("today")}
        />
        <FilterPill
          label={t.cobranza.period.week}
          active={period === "week"}
          onClick={() => setPeriodAndReset("week")}
        />
        <FilterPill
          label={t.cobranza.period.month}
          active={period === "month"}
          onClick={() => setPeriodAndReset("month")}
        />
        <FilterPill
          label={t.cobranza.period.custom}
          active={period === "custom"}
          onClick={() => setPeriodAndReset("custom")}
        />
        </div>}
        {period === "custom" && <DateRangePicker from={customFrom} to={customTo} onChange={(start, end) => { setParams(previous => { const p = new URLSearchParams(previous); p.set("from", start); p.set("to", end); p.set("period", "custom"); p.delete("page"); return p; }); }} />}
        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">
            {t.cobranza.filters.conceptLabel}
          </Label>
          <Select
            value={concept}
            onValueChange={(v) => {
              setConcept(v as PaymentConcept | "all");
            }}
          >
            <SelectTrigger aria-label="Concepto" className="h-11 w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONCEPT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {query.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.cobranza.error} {query.data && "Se muestran datos anteriores; pueden haber cambiado."} <Button variant="link" onClick={() => void query.refetch()}>Reintentar</Button></AlertDescription>
        </Alert>
      )}

      {/* Totals come only with "view_totals"; an older session may not know
          the permission yet, so also check the response carries them. */}
      {canViewTotals && query.data && query.data.total_paid != null && <dl aria-label="Resumen del período" className="flex flex-wrap items-baseline gap-x-8 gap-y-3 border-y py-4">
        <div><dt className="text-sm text-muted-foreground">Total cobrado</dt><dd className="font-display tabular text-2xl">{money.fmt(query.data.total_paid)}</dd></div>
        <div><dt className="text-sm text-muted-foreground">Cobros</dt><dd className="font-display tabular">{query.data.total}</dd></div>
        {[["Efectivo", query.data.cash_total], ["Transferencia", query.data.transfer_total], ["Tarjeta", query.data.card_total]].map(([label, amount]) => <div key={String(label)}><dt className="text-sm text-muted-foreground">{label}</dt><dd className="font-display tabular">{money.fmt(Number(amount))}</dd></div>)}
      </dl>}

      {(!query.error || query.data) && <SectionCard flush>
        {query.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <span role="status" className="flex items-center gap-2"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-muted-foreground" />Cargando cobros…</span>
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title={period === "today" ? t.cobranza.empty.todayTitle : t.cobranza.empty.title}
            hint={concept === "product" ? t.cobranza.empty.salesHint : t.cobranza.empty.hint}
            action={
              // Offer the action that fills THIS list: product sales come from
              // Venta rápida; refunds and other income have no shortcut here.
              concept === "product" ? (
                <Button asChild>
                  <Link to="/sales">
                    <ShoppingCart aria-hidden="true" className="h-4 w-4" />
                    {t.cobranza.empty.goToSales}
                  </Link>
                </Button>
              ) : concept === "refund" || concept === "other" ? undefined : (
                <Button requiresWrite onClick={() => setPickerOpen(true)}>
                  <Plus className="h-4 w-4 mr-2" />
                  {t.cobranza.chargeMember}
                </Button>
              )
            }
          />
        ) : (
          // Fits the content area, not the viewport: the navigation (220px
          // open, 70px collapsed) decides the real width. Date and time share
          // one line, concept and operator go under the name, and row actions
          // are 44px icons with a name, so nothing hides behind a scroll at
          // 1024 × 640 or 1280 × 800.
          <DataTable>
            <DataTableHead>
              <DataTableTh className="pl-4 pr-3">{t.cobranza.columns.date}</DataTableTh>
              <DataTableTh className="px-3">{t.cobranza.columns.subject}</DataTableTh>
              <DataTableTh className="px-3 text-right">{t.cobranza.columns.amount}</DataTableTh>
              <DataTableTh className="px-3">{t.cobranza.columns.method}</DataTableTh>
              <DataTableTh className="px-3 text-right"><span className="sr-only">{t.cobranza.columns.actions}</span></DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {items.map((p) => {
                const accent = rowAccent(p);
                const subject = paymentSubject(p);
                const recognitionDiffers =
                  p.recognized_amount != null &&
                  Math.abs(p.amount - p.recognized_amount) >= 0.005;
                const canCorrectSale = p.concept === "product" && !!p.sale_id && (isOwner || p.operator_id === currentUserId);
                const canCorrectPayment = isOwner && (p.concept === "membership" || p.concept === "other") && p.amount > 0;
                const canRefundSale = isOwner && p.concept === "product" && !!p.sale_id;
                const canRefundPayment = isOwner && (p.concept === "membership" || p.concept === "balance_settlement" || p.concept === "other") && p.amount > 0;
                const details = [
                  p.member_id || !p.sale_summary ? conceptLabel(p.concept) : null,
                  p.member_id && p.sale_summary ? p.sale_summary : null,
                  p.operator_name ? t.cobranza.recordedBy(p.operator_name) : null,
                ].filter(Boolean).join(" · ");
                return (
                  <DataTableRow
                    key={p.id}
                    onClick={() => {
                      setReceiptId(p.id);
                      setReceiptFolio(p.reference || undefined);
                    }}
                  >
                    <DataTableCell className="whitespace-nowrap pl-4 pr-3 tabular">
                      {fmtDay(p.payment_date)} · {fmtTime(p.created_at)}
                    </DataTableCell>
                    <DataTableCell className="px-3">
                      {p.member_id ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/members/${p.member_id}`);
                          }}
                          className="text-left font-medium text-foreground hover:underline"
                        >
                          {p.member_name || t.cobranza.rowMember}
                        </button>
                      ) : (
                        <span className="font-medium text-foreground">
                          {p.sale_summary || (p.concept === "other" ? p.notes : null) || conceptLabel(p.concept)}
                        </span>
                      )}
                      <span className="block text-xs text-muted-foreground">
                        {details}
                        {p.balance_pending > 0 && (
                          <span className="text-warning"> · {t.cobranza.pendingTag(money.fmt(p.balance_pending))}</span>
                        )}
                        {p.concept === "refund" && (
                          <span className="text-destructive"> · {t.cobranza.refundedTag}</span>
                        )}
                      </span>
                    </DataTableCell>
                    <DataTableCell className={cn("px-3 text-right font-display tabular", accent)}>
                      <span className="block whitespace-nowrap">{money.fmt(p.amount)}</span>
                      {recognitionDiffers && (
                        <span className="block font-sans text-xs font-normal text-muted-foreground">
                          {t.cobranza.recognizedAs(money.fmt(p.recognized_amount!))}
                        </span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="px-3">
                      {p.concept === "product" && p.amount === 0 ? <span className="whitespace-nowrap">{p.balance_pending > 0 ? "Fiado" : "Sin cobro"}</span> : <MethodBadge method={p.payment_method} />}
                    </DataTableCell>
                    <DataTableCell className="px-3 text-right">
                      <div className="flex items-center justify-end gap-1">
                        {(canCorrectSale || canCorrectPayment) && (
                          <Button requiresWrite
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (canCorrectSale) setSaleCorrectionTarget(p);
                              else setPaymentCorrectionTarget(p);
                            }}
                            aria-label={t.cobranza.rowActions.correctLabel(subject)}
                            title={t.cobranza.rowActions.correct}
                          >
                            <Pencil aria-hidden="true" />
                          </Button>
                        )}
                        {(canRefundSale || canRefundPayment) && (
                          <Button requiresWrite
                            variant="ghost"
                            size="icon"
                            onClick={(event) => {
                              event.stopPropagation();
                              if (canRefundSale) setRefundSaleId(p.sale_id ?? null);
                              else setRefundPayment(p);
                            }}
                            aria-label={t.cobranza.rowActions.refundLabel(subject)}
                            title={t.cobranza.rowActions.refund}
                            className="text-destructive hover:text-destructive"
                          >
                            <Undo2 aria-hidden="true" />
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={(e) => {
                            e.stopPropagation();
                            setReceiptId(p.id);
                            setReceiptFolio(p.reference || undefined);
                          }}
                          aria-label={t.cobranza.rowActions.receiptLabel(subject)}
                          title={t.cobranza.rowActions.receipt}
                        >
                          <Receipt aria-hidden="true" />
                        </Button>
                      </div>
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>}

      {/* Pagination */}
      {query.data && query.data.total > query.data.page_size && (
        <div className="flex items-center justify-between gap-3">
          <p className="text-sm text-muted-foreground">
            {periodLabel}
            <span className="mx-1.5">·</span>
            <span className="tabular">
              {t.cobranza.pagination.page(query.data.page, totalPages)}
            </span>
          </p>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || query.isFetching}
            >
              <ChevronLeft className="h-4 w-4 mr-1" />
              {t.cobranza.pagination.prev}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || query.isFetching}
            >
              {t.cobranza.pagination.next}
              <ChevronRight className="h-4 w-4 ml-1" />
            </Button>
          </div>
        </div>
      )}

      {/* Member picker */}
      <Dialog open={pickerOpen} onOpenChange={setPickerOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.cobranza.pickMember}</DialogTitle>
            <DialogDescription>{t.cobranza.pickMemberHint}</DialogDescription>
          </DialogHeader>
          <div className="pt-1">
            <MemberSearchInput
              autoFocus
              size="lg"
              onSelect={(m) => openPaymentForMember(m.member_id)}
            />
          </div>
        </DialogContent>
      </Dialog>

      {/* Payment modal — only mounts once a member is selected & detail loaded */}
      {pickedMemberId && pickedMember.data?.member && (
        <PaymentModal
          member={pickedMember.data.member}
          currentMembership={pickedMember.data.current_membership}
          open={paymentOpen}
          onOpenChange={closePayment}
          onPaid={receipt => navigate(`/members/${pickedMemberId}`, { state: { paymentReceipt: receipt } })}
        />
      )}

      <OtherIncomeDialog open={otherIncomeOpen} onOpenChange={setOtherIncomeOpen} />

      <SaleCorrectionModal
        saleId={saleCorrectionTarget?.sale_id ?? null}
        open={!!saleCorrectionTarget}
        onOpenChange={(next) => !next && setSaleCorrectionTarget(null)}
      />

      <PaymentCorrectionModal
        payment={paymentCorrectionTarget}
        open={paymentCorrectionTarget !== null}
        onOpenChange={(next) => !next && setPaymentCorrectionTarget(null)}
      />

      <ProductRefundModal
        saleId={refundSaleId}
        open={refundSaleId !== null}
        onOpenChange={(next) => !next && setRefundSaleId(null)}
      />

      {refundPayment && (
        <RefundModal
          payment={refundPayment}
          open
          onOpenChange={(next) => !next && setRefundPayment(null)}
        />
      )}

      <ReceiptViewer
        paymentId={receiptId}
        folio={receiptFolio}
        open={receiptId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setReceiptId(null);
            setReceiptFolio(undefined);
          }
        }}
      />
    </PageContainer>
  );
}
