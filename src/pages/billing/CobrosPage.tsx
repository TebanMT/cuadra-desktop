import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
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
  Plus,
  Receipt,
  Wallet,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { StatCard } from "@/components/shared/StatCard";
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
import { useMember } from "@/hooks/useMembers";
import { todayIso } from "@/lib/dates";
import { billing as t } from "@/strings/billing";
import { cn } from "@/lib/utils";

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
  { value: "other", label: "Otros" },
];

function MethodBadge({ method }: { method: PaymentMethod | null }) {
  if (method === "cash") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <Banknote className="h-4 w-4 text-muted-foreground" />
        <span>{t.payment.methods.cash}</span>
      </span>
    );
  }
  if (method === "transfer") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />
        <span>{t.payment.methods.transfer}</span>
      </span>
    );
  }
  if (method === "card") {
    return (
      <span className="inline-flex items-center gap-1.5 text-sm">
        <CreditCard className="h-4 w-4 text-muted-foreground" />
        <span>{t.payment.methods.card}</span>
      </span>
    );
  }
  return <span className="text-sm text-muted-foreground">—</span>;
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
  try {
    const d = parseISO(value);
    return format(d, "d MMM", { locale: es });
  } catch {
    return "—";
  }
}

function conceptLabel(c: PaymentConcept): string {
  return t.history.concepts[c] || c;
}

function rowAccent(p: Payment): string | null {
  if (p.concept === "refund" || p.amount < 0) return "text-destructive";
  if (p.balance_pending > 0) return "text-warning";
  return null;
}

export default function CobrosPage() {
  const navigate = useNavigate();
  const [period, setPeriod] = useState<Period>("today");
  const [customFrom, setCustomFrom] = useState<string>(todayIso());
  const [customTo, setCustomTo] = useState<string>(todayIso());
  const [concept, setConcept] = useState<PaymentConcept | "all">("all");
  const [page, setPage] = useState(1);

  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickedMemberId, setPickedMemberId] = useState<string | null>(null);
  const [paymentOpen, setPaymentOpen] = useState(false);

  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptFolio, setReceiptFolio] = useState<string | undefined>(undefined);

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
    return `${range.from || "—"} → ${range.to || "—"}`;
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
    setPeriod(p);
    setPage(1);
  }

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={t.cobranza.title}
        subtitle={t.cobranza.subtitle}
        actions={
          <Button
            size="lg"
            onClick={() => setPickerOpen(true)}
            className="h-10 rounded-md font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t.cobranza.chargeMember}
          </Button>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-5">
        <StatCard
          title={t.cobranza.stats.total}
          value={fmtMoney(query.data?.total_paid ?? 0)}
          icon={CircleDollarSign}
          tone="neutral"
          hint={t.cobranza.stats.totalHint}
        />
        <StatCard
          title={t.cobranza.stats.count}
          value={query.data?.total ?? 0}
          icon={Receipt}
          tone="neutral"
          hint={t.cobranza.stats.countHint}
        />
        <StatCard
          title={t.cobranza.stats.cash}
          value={fmtMoney(query.data?.cash_total ?? 0)}
          icon={Banknote}
          tone="success"
        />
        <StatCard
          title={t.cobranza.stats.transfer}
          value={fmtMoney(query.data?.transfer_total ?? 0)}
          icon={ArrowLeftRight}
          tone="neutral"
        />
        <StatCard
          title={t.cobranza.stats.card}
          value={fmtMoney(query.data?.card_total ?? 0)}
          icon={Wallet}
          tone="neutral"
        />
      </div>

      {/* Period filters */}
      <div className="flex flex-wrap items-center gap-3">
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
        {period === "custom" && (
          <div className="flex items-end gap-2 ml-2">
            <div className="space-y-1">
              <Label htmlFor="cb-from" className="text-xs text-muted-foreground">
                {t.cobranza.filters.from}
              </Label>
              <Input
                id="cb-from"
                type="date"
                value={customFrom}
                onChange={(e) => {
                  setCustomFrom(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-[160px]"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="cb-to" className="text-xs text-muted-foreground">
                {t.cobranza.filters.to}
              </Label>
              <Input
                id="cb-to"
                type="date"
                value={customTo}
                onChange={(e) => {
                  setCustomTo(e.target.value);
                  setPage(1);
                }}
                className="h-9 w-[160px]"
              />
            </div>
          </div>
        )}
        <div className="ml-auto flex items-center gap-2">
          <Label className="text-xs text-muted-foreground">
            {t.cobranza.filters.conceptLabel}
          </Label>
          <Select
            value={concept}
            onValueChange={(v) => {
              setConcept(v as PaymentConcept | "all");
              setPage(1);
            }}
          >
            <SelectTrigger className="h-9 w-[180px]">
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
          <AlertDescription>{t.cobranza.error}</AlertDescription>
        </Alert>
      )}

      <SectionCard flush>
        {query.isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Receipt className="h-6 w-6" />}
            title={t.cobranza.empty.title}
            hint={t.cobranza.empty.hint}
            action={
              <Button onClick={() => setPickerOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                {t.cobranza.chargeMember}
              </Button>
            }
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh className="w-20 pl-5">{t.cobranza.columns.time}</DataTableTh>
              <DataTableTh className="w-24">{t.cobranza.columns.date}</DataTableTh>
              <DataTableTh>{t.cobranza.columns.member}</DataTableTh>
              <DataTableTh>{t.cobranza.columns.concept}</DataTableTh>
              <DataTableTh className="text-right">{t.cobranza.columns.amount}</DataTableTh>
              <DataTableTh>{t.cobranza.columns.method}</DataTableTh>
              <DataTableTh>{t.cobranza.columns.operator}</DataTableTh>
              <DataTableTh className="w-24 text-right pr-5" />
            </DataTableHead>
            <DataTableBody>
              {items.map((p) => {
                const accent = rowAccent(p);
                return (
                  <DataTableRow
                    key={p.id}
                    onClick={() => {
                      setReceiptId(p.id);
                      setReceiptFolio(p.reference || undefined);
                    }}
                  >
                    <DataTableCell className="pl-5 text-sm tabular text-muted-foreground">
                      {fmtTime(p.created_at)}
                    </DataTableCell>
                    <DataTableCell className="text-sm tabular">
                      {fmtDay(p.payment_date)}
                    </DataTableCell>
                    <DataTableCell>
                      {p.member_id ? (
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            navigate(`/members/${p.member_id}`);
                          }}
                          className="text-sm font-medium text-foreground hover:underline text-left"
                        >
                          {p.member_name || t.cobranza.rowMember}
                        </button>
                      ) : (
                        <span className="text-sm text-muted-foreground">—</span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-sm">
                      <span>{conceptLabel(p.concept)}</span>
                      {p.balance_pending > 0 && (
                        <span className="ml-1.5 text-xs text-warning">
                          • {t.cobranza.pendingTag(fmtMoney(p.balance_pending))}
                        </span>
                      )}
                      {p.concept === "refund" && (
                        <span className="ml-1.5 text-xs text-destructive">
                          • {t.cobranza.refundedTag}
                        </span>
                      )}
                    </DataTableCell>
                    <DataTableCell
                      className={cn(
                        "text-sm text-right font-semibold tabular",
                        accent
                      )}
                    >
                      {fmtMoney(p.amount)}
                    </DataTableCell>
                    <DataTableCell>
                      <MethodBadge method={p.payment_method} />
                    </DataTableCell>
                    <DataTableCell className="text-xs text-muted-foreground">
                      {p.operator_name || "—"}
                    </DataTableCell>
                    <DataTableCell className="text-right pr-5">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={(e) => {
                          e.stopPropagation();
                          setReceiptId(p.id);
                          setReceiptFolio(p.reference || undefined);
                        }}
                        className="h-8"
                      >
                        Ver
                      </Button>
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>

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
    </div>
  );
}
