import { validateDateFields } from "@/lib/date-input";
import { DateInput } from "@/components/ui/date-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { fmtMoney, type PaymentMethod } from "@/hooks/useBilling";
import {
  useRefundSale,
  useSaleDetail,
  type ProductRefundDisposition,
  type SaleDetailLine,
} from "@/hooks/useSales";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { sales as t } from "@/strings/sales";
import { useAuthStore } from "@/stores/useAuthStore";
import { PendingRefundsPanel } from "./PendingRefundsPanel";
import { CashDrawerField } from "@/components/cash/CashDrawerField";

interface ProductRefundModalProps {
  saleId: string | null;
  open: boolean;
  onOpenChange(open: boolean): void;
}

interface LineDraft {
  selected: boolean;
  quantity: number;
  disposition: ProductRefundDisposition;
}

type RefundDraft = Record<string, LineDraft>;

function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function availableQuantity(line: SaleDetailLine): number {
  if (Number.isFinite(line.refundable_quantity)) {
    return Math.max(0, Math.trunc(line.refundable_quantity));
  }
  return Math.max(0, line.quantity - (line.refunded_quantity ?? 0));
}

function roundMoney(amount: number): number {
  return Math.round((amount + Number.EPSILON) * 100) / 100;
}

function allocatedRefundAmount(
  line: SaleDetailLine,
  quantity: number,
  subtotal: number,
  total: number
): number {
  if (subtotal <= 0 || line.quantity <= 0 || quantity <= 0) return 0;
  return roundMoney(
    (line.line_total * total * quantity) / (subtotal * line.quantity)
  );
}

function isPaymentMethod(value: unknown): value is PaymentMethod {
  return value === "cash" || value === "transfer" || value === "card";
}

export function ProductRefundModal({ saleId, open, onOpenChange }: ProductRefundModalProps) {
  const detail = useSaleDetail(saleId, open);
  const refund = useRefundSale(saleId ?? "");
  const sale = detail.data;
  const isOwner = useAuthStore((state) => state.user?.role === "owner");
  const initializedSale = useRef<string | null>(null);

  const [draft, setDraft] = useState<RefundDraft>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashDrawerId, setCashDrawerId] = useState<string>();
  const [date, setDate] = useState(todayIso());
  const [reason, setReason] = useState("");
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!open) {
      initializedSale.current = null;
      return;
    }
    if (!sale || initializedSale.current === sale.id) return;
    initializedSale.current = sale.id;
    setDraft(
      Object.fromEntries(
        sale.lines.map((line) => [
          line.sale_item_id,
          { selected: false, quantity: 0, disposition: "returned_to_stock" },
        ])
      )
    );
    setMethod(isPaymentMethod(sale.payment?.payment_method) ? sale.payment.payment_method : "cash");
    setCashDrawerId(undefined);
    setDate(todayIso());
    setReason("");
    setIdempotencyKey(createIdempotencyKey());
    setError(null);
  }, [open, sale]);

  const selectedLines = useMemo(() => {
    if (!sale) return [];
    return sale.lines.flatMap((line) => {
      const lineDraft = draft[line.sale_item_id];
      const max = availableQuantity(line);
      const quantity = Math.min(max, Math.max(0, Math.trunc(lineDraft?.quantity ?? 0)));
      if (!lineDraft?.selected || quantity <= 0) return [];
      return [{ line, quantity, disposition: lineDraft.disposition }];
    });
  }, [draft, sale]);

  const preview = useMemo(() => {
    if (!sale) {
      return {
        units: 0,
        economicValue: 0,
        balanceCancelled: 0,
        moneyReturned: 0,
        restocked: 0,
        notRestocked: 0,
      };
    }
    let units = 0;
    let economicValue = 0;
    let restocked = 0;
    let notRestocked = 0;
    for (const item of selectedLines) {
      units += item.quantity;
      economicValue += allocatedRefundAmount(item.line, item.quantity, sale.subtotal, sale.total);
      if (item.disposition === "returned_to_stock") restocked += item.quantity;
      else notRestocked += item.quantity;
    }
    economicValue = roundMoney(economicValue);
    const balanceCancelled = roundMoney(
      Math.min(Math.max(0, sale.balance_pending), economicValue)
    );
    const moneyReturned = roundMoney(economicValue - balanceCancelled);
    return {
      units,
      economicValue,
      balanceCancelled,
      moneyReturned,
      restocked,
      notRestocked,
    };
  }, [sale, selectedLines]);

  function toggleLine(line: SaleDetailLine, selected: boolean) {
    const max = availableQuantity(line);
    setDraft((current) => ({
      ...current,
      [line.sale_item_id]: {
        selected: selected && max > 0,
        quantity: selected && max > 0 ? Math.max(1, current[line.sale_item_id]?.quantity ?? 0) : 0,
        disposition: current[line.sale_item_id]?.disposition ?? "returned_to_stock",
      },
    }));
    setError(null);
  }

  function setQuantity(line: SaleDetailLine, quantity: number) {
    if (!Number.isFinite(quantity)) return;
    const max = availableQuantity(line);
    setDraft((current) => ({
      ...current,
      [line.sale_item_id]: {
        selected: true,
        quantity: Math.min(max, Math.max(0, Math.trunc(quantity))),
        disposition: current[line.sale_item_id]?.disposition ?? "returned_to_stock",
      },
    }));
    setError(null);
  }

  function setDisposition(lineID: string, disposition: ProductRefundDisposition) {
    setDraft((current) => ({
      ...current,
      [lineID]: {
        selected: current[lineID]?.selected ?? false,
        quantity: current[lineID]?.quantity ?? 0,
        disposition,
      },
    }));
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!isOwner || !sale) return;
    if (selectedLines.length === 0) {
      setError(t.page.refund.errors.noLines);
      return;
    }
    if (reason.trim().length < 3) {
      setError(t.page.refund.errors.reason);
      return;
    }
    if (preview.moneyReturned > sale.refundable + 0.001) {
      setError(t.page.refund.errors.exceedsAvailable(fmtMoney(sale.refundable)));
      return;
    }

    try {
      const response = await refund.mutateAsync({
        reason: reason.trim(),
        method,
        payment_date: date,
        ...(method === "cash" && cashDrawerId ? { cash_drawer_id: cashDrawerId } : {}),
        idempotency_key: idempotencyKey,
        line_items: selectedLines.map((item) => ({
          sale_item_id: item.line.sale_item_id,
          quantity: item.quantity,
          disposition: item.disposition,
        })),
      });
      const cancelled = response.balance_cancelled ?? 0;
      if (cancelled > 0 && response.amount > 0) {
        toast.success(
          t.page.refund.successWithDebt(fmtMoney(response.amount), fmtMoney(cancelled))
        );
      } else if (cancelled > 0) {
        toast.success(t.page.refund.successDebtOnly(fmtMoney(cancelled)));
      } else {
        toast.success(t.page.refund.success(fmtMoney(response.amount)));
      }
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const details = caught.details as Record<string, unknown> | null;
        setError(
          (details?.exception as string | undefined) ||
            (details?.message as string | undefined) ||
            caught.message ||
            t.page.refund.errors.generic
        );
        return;
      }
      setError(t.page.refund.errors.generic);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !refund.isPending && onOpenChange(next)}>
      <DialogContent
        className="max-h-[92vh] max-w-4xl overflow-y-auto"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.page.refund.title(sale?.folio)}</DialogTitle>
          <DialogDescription>{t.page.refund.description}</DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> {t.page.refund.loading}
          </div>
        ) : detail.isError || !sale ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{t.page.refund.loadError}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => detail.refetch()}>
                <RotateCcw className="mr-1.5 h-4 w-4" /> {t.page.refund.retry}
              </Button>
            </AlertDescription>
          </Alert>
        ) : !isOwner ? (
          <div className="space-y-4">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t.page.refund.ownerOnly}</AlertDescription>
            </Alert>
            <PendingRefundsPanel
              saleId={sale.id}
              pendingRefundDue={sale.pending_refund_due}
              pendingRefunds={sale.pending_refunds}
              defaultMethod={sale.payment?.payment_method}
            />
          </div>
        ) : (
          <form onSubmitCapture={validateDateFields} onSubmit={submit} className="space-y-5">
            {error && (
              <Alert variant="destructive">
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <PendingRefundsPanel
              saleId={sale.id}
              pendingRefundDue={sale.pending_refund_due}
              pendingRefunds={sale.pending_refunds}
              defaultMethod={sale.payment?.payment_method}
            />

            <div className="flex flex-wrap items-end justify-between gap-3 rounded-lg border border-border bg-muted/30 px-4 py-3">
              <div>
                <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {t.page.refund.availableMoney}
                </p>
                <p className="mt-1 text-xl font-bold tabular text-foreground">
                  {fmtMoney(sale.refundable)}
                </p>
              </div>
              {sale.discount > 0 && <p className="max-w-md text-right text-xs text-muted-foreground">
                {t.page.refund.estimateHint}
              </p>}
            </div>

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[760px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="w-12 px-3 py-2.5" />
                    <th className="px-3 py-2.5 text-left font-medium">{t.page.refund.product}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t.page.refund.available}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t.page.refund.quantity}</th>
                    <th className="px-3 py-2.5 text-left font-medium">{t.page.refund.disposition}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {sale.lines.map((line) => {
                    const max = availableQuantity(line);
                    const lineDraft = draft[line.sale_item_id] ?? {
                      selected: false,
                      quantity: 0,
                      disposition: "returned_to_stock" as const,
                    };
                    return (
                      <tr key={line.sale_item_id} className={cn(max <= 0 && "opacity-60")}>
                        <td className="px-3 py-3 text-center">
                          <Checkbox
                            id={`refund-line-${line.sale_item_id}`}
                            checked={lineDraft.selected}
                            onCheckedChange={(value) => toggleLine(line, value === true)}
                            disabled={max <= 0}
                            aria-label={`Devolver ${line.product_name}`}
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Label
                            htmlFor={`refund-line-${line.sale_item_id}`}
                            className="cursor-pointer font-medium text-foreground"
                          >
                            {line.product_name}
                          </Label>
                          <p className="mt-0.5 text-xs tabular text-muted-foreground">
                            {fmtMoney(line.unit_price)} c/u
                          </p>
                          {max <= 0 && (
                            <p className="mt-1 text-xs text-muted-foreground">
                              {t.page.refund.alreadyRefunded}
                            </p>
                          )}
                        </td>
                        <td className="px-3 py-3 text-center font-medium tabular">{max}</td>
                        <td className="px-3 py-3">
                          <Input
                            type="number"
                            min={1}
                            max={max}
                            step={1}
                            value={lineDraft.quantity || ""}
                            onChange={(event) => setQuantity(line, Number(event.target.value))}
                            disabled={!lineDraft.selected || max <= 0}
                            aria-label={`Cantidad a devolver de ${line.product_name}`}
                            className="mx-auto h-9 w-24 text-center tabular"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <Select
                            value={lineDraft.disposition}
                            onValueChange={(value) =>
                              setDisposition(line.sale_item_id, value as ProductRefundDisposition)
                            }
                            disabled={!lineDraft.selected || max <= 0}
                          >
                            <SelectTrigger
                              aria-label={`Disposición de ${line.product_name}`}
                              className="min-w-[230px]"
                            >
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              {(
                                ["returned_to_stock", "damaged", "not_returned"] as const
                              ).map((disposition) => (
                                <SelectItem key={disposition} value={disposition}>
                                  <span className="flex flex-col">
                                    <span>{t.page.refund.dispositions[disposition]}</span>
                                    <span className="text-xs text-muted-foreground">
                                      {t.page.refund.dispositionHints[disposition]}
                                    </span>
                                  </span>
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <section className="space-y-2">
              <h3 className="text-sm font-semibold text-foreground">{t.page.refund.previewTitle}</h3>
              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <PreviewNumber label={t.page.refund.previewUnits} value={String(preview.units)} />
                <PreviewNumber
                  label={t.page.refund.previewMoney}
                  value={fmtMoney(preview.moneyReturned)}
                />
                {preview.balanceCancelled > 0 && (
                  <PreviewNumber
                    label={t.page.refund.previewDebt}
                    value={fmtMoney(preview.balanceCancelled)}
                  />
                )}
                <PreviewNumber label={t.page.refund.previewStock} value={String(preview.restocked)} />
                <PreviewNumber label={t.page.refund.previewNoStock} value={String(preview.notRestocked)} />
              </div>
              {preview.balanceCancelled > 0 && (
                <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
                  {t.page.refund.debtSplit(
                    fmtMoney(preview.economicValue),
                    fmtMoney(preview.balanceCancelled),
                    fmtMoney(preview.moneyReturned)
                  )}
                </p>
              )}
            </section>

            {preview.moneyReturned > 0 && (
              <>
                <fieldset className="space-y-2">
                  <legend className="text-sm font-semibold text-foreground">
                    {t.page.refund.method}
                  </legend>
                  <RadioGroup
                    value={method}
                    onValueChange={(value) => {
                      setMethod(value as PaymentMethod);
                      setError(null);
                    }}
                    className="grid grid-cols-3 gap-2"
                  >
                    {(["cash", "transfer", "card"] as const).map((value) => (
                      <label
                        key={value}
                        className={cn(
                          "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                          method === value ? "border-primary bg-primary/5" : "border-border"
                        )}
                      >
                        <RadioGroupItem value={value} />
                        {t.page.refund.methods[value]}
                      </label>
                    ))}
                  </RadioGroup>
                </fieldset>

                {method === "cash" && (
                  <CashDrawerField
                    date={date}
                    value={cashDrawerId}
                    onChange={setCashDrawerId}
                    id="product-refund-cash-drawer"
                  />
                )}
              </>
            )}

            <div
              className={cn(
                "grid gap-4",
                preview.moneyReturned > 0 && "sm:grid-cols-[180px_1fr]"
              )}
            >
              {preview.moneyReturned > 0 && (
                <div className="space-y-2">
                  <Label htmlFor="product-refund-date">{t.page.refund.date}</Label>
                  <DateInput
                    id="product-refund-date"
                    context="recent"
                    max={todayIso()}
                    value={date}
                    onValueChange={(event) => setDate(event)}
                  />
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="product-refund-reason">{t.page.refund.reason} *</Label>
                <Textarea
                  id="product-refund-reason"
                  value={reason}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setError(null);
                  }}
                  placeholder={t.page.refund.reasonPlaceholder}
                  rows={3}
                  maxLength={200}
                />
              </div>
            </div>

            <div className="flex justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={refund.isPending}
              >
                {t.page.refund.cancel}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={refund.isPending || selectedLines.length === 0}
              >
                {refund.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {refund.isPending ? t.page.refund.submitting : t.page.refund.submit}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewNumber({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p className="mt-1 text-xl font-bold tabular text-foreground">{value}</p>
    </div>
  );
}
