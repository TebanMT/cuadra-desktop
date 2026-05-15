import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, MessageCircle, Lock } from "lucide-react";
import { addDays, subDays } from "date-fns";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import {
  useCashCloseReport,
  useCloseCashRegister,
  type CashCloseReport,
} from "@/hooks/useCashClose";
import { fmtMoney, type PaymentConcept, type PaymentMethod } from "@/hooks/useBilling";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { ApiError } from "@/lib/api";
import { fmtDate, fmtIso, parseDate, todayIso } from "@/lib/dates";
import { cashClose as t } from "@/strings/cashClose";

const METHOD_KEYS: PaymentMethod[] = ["cash", "transfer", "card"];
const CONCEPT_KEYS: PaymentConcept[] = ["membership", "product", "balance_settlement", "other"];

export default function CashClosePage() {
  const [date, setDate] = useState<string>(todayIso());
  const report = useCashCloseReport(date);

  const isToday = date === todayIso();
  const isYesterday = date === fmtIso(subDays(new Date(), 1));

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t.page.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {fmtDate(date)}
            {isToday && ` · ${t.page.today}`}
            {isYesterday && ` · ${t.page.yesterday}`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Label htmlFor="cc-date" className="text-sm text-muted-foreground">
            {t.page.dateLabel}
          </Label>
          <Input
            id="cc-date"
            type="date"
            className="h-10 w-44"
            value={date}
            onChange={(e) => setDate(e.target.value || todayIso())}
            max={todayIso()}
          />
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate((d) => fmtIso(subDays(parseDate(d) ?? new Date(), 1)))}
            className="rounded-md"
          >
            ← Día previo
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setDate((d) => fmtIso(addDays(parseDate(d) ?? new Date(), 1)))}
            disabled={isToday}
            className="rounded-md"
          >
            Día siguiente →
          </Button>
        </div>
      </div>

      <div className="space-y-4">
      {report.isLoading ? (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      ) : report.error ? (
        <Alert variant="destructive">
          <AlertDescription>{t.page.error}</AlertDescription>
        </Alert>
      ) : report.data ? (
        <ReportView
          report={report.data}
          date={date}
          canClose={isToday}
        />
      ) : null}
      </div>
    </div>
  );
}

function ReportView({
  report,
  date,
  canClose,
}: {
  report: CashCloseReport;
  date: string;
  canClose: boolean;
}) {
  const [closeOpen, setCloseOpen] = useState(false);
  const money = useMoneyVisibility();

  const totalGross = report.total ?? 0;
  const refundsTotal = report.refunds_total ?? 0;
  const expensesTotal = report.expenses_total ?? 0;
  const netTotal = report.net_total ?? totalGross - refundsTotal - expensesTotal;
  const empty =
    totalGross === 0 && refundsTotal === 0 && expensesTotal === 0;

  // Efectivo que debería quedar en el cajón al cerrar: cash entrante del
  // día menos gastos pagados en efectivo. Refunds en cash ya están fuera
  // del by_method (el BE las excluye), pero los gastos sí salen físicamente
  // del cajón, así que los restamos acá también para que la "calculated
  // cash" del modal coincida con lo que el BE persistirá.
  const cashIncome = report.by_method?.cash ?? 0;
  const cashExpenses = report.expenses_by_method?.cash ?? 0;
  const calculatedCash = cashIncome - cashExpenses;

  return (
    <div className="space-y-6">
      <section className="rounded-lg border bg-background p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t.page.sections.methods}
        </h2>
        <div className="space-y-2">
          {METHOD_KEYS.map((m) => (
            <div key={m} className="flex items-baseline justify-between text-base">
              <span>{t.page.methods[m]}</span>
              <span className="tabular-nums font-medium">{money.fmt(report.by_method?.[m] ?? 0)}</span>
            </div>
          ))}
          <div className="flex items-baseline justify-between border-t pt-2 text-lg">
            <span className="font-semibold">{t.page.total}</span>
            <span className="tabular-nums font-bold">{money.fmt(totalGross)}</span>
          </div>
        </div>
      </section>

      <section className="rounded-lg border bg-background p-6 space-y-4">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t.page.sections.concepts}
        </h2>
        <div className="space-y-2">
          {CONCEPT_KEYS.map((c) => {
            const entry = report.by_concept?.[c];
            if (!entry || entry.total === 0) return null;
            return (
              <div key={c} className="flex items-baseline justify-between text-base">
                <span>
                  {t.page.concepts[c as keyof typeof t.page.concepts] ?? c}
                  <span className="text-xs text-muted-foreground ml-2">
                    ({c === "product"
                      ? t.page.counts.sales(entry.count)
                      : t.page.counts.payments(entry.count)})
                  </span>
                </span>
                <span className="tabular-nums font-medium">{money.fmt(entry.total)}</span>
              </div>
            );
          })}
          {refundsTotal > 0 && (
            <div className="flex items-baseline justify-between border-t pt-2 text-base text-destructive">
              <span>{t.page.sections.refunds}</span>
              <span className="tabular-nums">−{money.fmt(refundsTotal)}</span>
            </div>
          )}
        </div>
      </section>

      {/* Gastos del día — la fila que faltaba. Ingresos + devoluciones
          no le decían nada al dueño si no veía qué salió. */}
      <section className="rounded-lg border bg-background p-6 space-y-3">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t.page.sections.expenses}
        </h2>
        {(report.expenses ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t.page.sections.expensesEmpty}
          </p>
        ) : (
          <>
            <ul className="space-y-2">
              {report.expenses.map((e) => (
                <li key={e.id} className="flex items-baseline justify-between text-sm">
                  <div className="min-w-0">
                    <span className="font-medium text-foreground">
                      {t.page.expenseCategories[e.category] ?? e.category}
                    </span>
                    {e.description && (
                      <span className="text-muted-foreground ml-2 truncate">
                        — {e.description}
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground ml-2">
                      ({t.page.methods[e.payment_method as PaymentMethod] ??
                        e.payment_method})
                    </span>
                  </div>
                  <span className="tabular-nums font-medium text-destructive">
                    −{money.fmt(e.amount)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="flex items-baseline justify-between border-t pt-2 text-base">
              <span className="font-semibold">{t.page.total}</span>
              <span className="tabular-nums font-bold text-destructive">
                −{money.fmt(expensesTotal)}
              </span>
            </div>
          </>
        )}
      </section>

      {(report.operators ?? []).length > 0 && (
        <section className="rounded-lg border bg-background p-6 space-y-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t.page.sections.operators}
          </h2>
          <ul className="space-y-2">
            {report.operators.map((op) => (
              <li key={op.operator_id} className="flex items-baseline justify-between text-sm">
                <div>
                  <span className="font-medium">{op.operator_name || "—"}</span>
                  <span className="text-muted-foreground ml-2">
                    ({t.page.counts.mix(op.payments_count, op.sales_count)})
                  </span>
                </div>
                <span className="tabular-nums font-medium">{money.fmt(op.total)}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      {/* Resumen del día — la línea que el dueño realmente quiere ver:
          "qué entró − qué salió = lo que se ganó hoy". */}
      <section className="rounded-lg border bg-muted/40 p-6 space-y-2">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          {t.page.sections.summary}
        </h2>
        <div className="space-y-1.5 text-sm">
          <div className="flex items-baseline justify-between">
            <span>{t.page.summary.income}</span>
            <span className="tabular-nums">{money.fmt(totalGross)}</span>
          </div>
          {refundsTotal > 0 && (
            <div className="flex items-baseline justify-between text-destructive">
              <span>− {t.page.summary.refunds}</span>
              <span className="tabular-nums">−{money.fmt(refundsTotal)}</span>
            </div>
          )}
          {expensesTotal > 0 && (
            <div className="flex items-baseline justify-between text-destructive">
              <span>− {t.page.summary.expenses}</span>
              <span className="tabular-nums">−{money.fmt(expensesTotal)}</span>
            </div>
          )}
          <div className="flex items-baseline justify-between border-t pt-2 text-lg">
            <span className="font-semibold">{t.page.summary.net}</span>
            <span
              className={
                "tabular-nums font-bold " +
                (netTotal >= 0 ? "text-foreground" : "text-destructive")
              }
            >
              {money.fmt(netTotal)}
            </span>
          </div>
        </div>
      </section>

      {empty && (
        <p className="text-center text-muted-foreground py-6">{t.page.empty}</p>
      )}

      {report.closed && (
        <Alert>
          <AlertDescription>
            {t.page.closedAt(fmtDate(report.closed.closed_at))}
            {Math.abs(report.closed.diff) > 0 && (
              <span className="ml-2">
                {t.page.diffLabel(
                  money.fmt(Math.abs(report.closed.diff)),
                  report.closed.diff >= 0 ? "+" : "−"
                )}
              </span>
            )}
          </AlertDescription>
        </Alert>
      )}

      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="outline" disabled>
          <Printer className="h-4 w-4" />
          {t.page.print}
        </Button>
        <Button variant="outline" disabled>
          <MessageCircle className="h-4 w-4" />
          {t.page.sendWhatsapp}
        </Button>
        {canClose && !report.closed && (
          <Button onClick={() => setCloseOpen(true)} disabled={empty}>
            <Lock className="h-4 w-4" />
            {t.page.closeCashRegister}
          </Button>
        )}
      </div>

      <CloseCashModal
        open={closeOpen}
        onOpenChange={setCloseOpen}
        date={date}
        calculatedCash={calculatedCash}
      />
    </div>
  );
}

function CloseCashModal({
  open,
  onOpenChange,
  date,
  calculatedCash,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  date: string;
  calculatedCash: number;
}) {
  const close = useCloseCashRegister();
  const [counted, setCounted] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setCounted("");
      setReason("");
      setError(null);
    }
  }, [open]);

  const countedNum = parseFloat(counted);
  const validCounted = Number.isFinite(countedNum) && countedNum >= 0;
  const diff = validCounted ? countedNum - calculatedCash : 0;
  const hasDiff = validCounted && Math.abs(diff) > 0.001;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!validCounted) {
      setError(t.modal.errors.countedInvalid);
      return;
    }
    if (hasDiff && !reason.trim()) {
      setError(t.modal.reasonRequired);
      return;
    }
    try {
      await close.mutateAsync({
        date,
        counted_cash: countedNum,
        reason: hasDiff ? reason.trim() : undefined,
      });
      toast.success(t.modal.success);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.modal.errors.generic);
      } else {
        setError(t.modal.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.modal.title}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="rounded-md border bg-muted/40 px-4 py-3 space-y-1">
            <div className="flex items-baseline justify-between text-sm">
              <span>{t.modal.calculatedLabel}</span>
              <span className="tabular-nums font-semibold">{fmtMoney(calculatedCash)}</span>
            </div>
          </div>
          <div className="space-y-1">
            <Label htmlFor="cc-counted">{t.modal.countedLabel}</Label>
            <Input
              id="cc-counted"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              value={counted}
              onChange={(e) => setCounted(e.target.value)}
              autoFocus
            />
          </div>
          {hasDiff && (
            <>
              <div className="rounded-md border bg-warning/10 px-4 py-2 flex items-baseline justify-between text-sm text-warning-foreground">
                <span>{t.modal.diffLabel}</span>
                <span className="tabular-nums font-semibold">
                  {diff >= 0 ? "+" : "−"}
                  {fmtMoney(Math.abs(diff))}
                </span>
              </div>
              <div className="space-y-1">
                <Label htmlFor="cc-reason">{t.modal.reasonLabel} *</Label>
                <Textarea
                  id="cc-reason"
                  rows={3}
                  value={reason}
                  placeholder={t.modal.reasonPlaceholder}
                  onChange={(e) => setReason(e.target.value)}
                />
              </div>
            </>
          )}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={close.isPending}>
              {t.modal.skip}
            </Button>
            <Button type="submit" disabled={close.isPending || !validCounted}>
              {close.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.modal.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
