import { validateDateFields } from "@/lib/date-input";
import { DateInput } from "@/components/ui/date-input";
import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useSettlePendingSaleRefund,
  type PendingSaleRefund,
} from "@/hooks/useSales";
import { fmtMoney, type PaymentMethod } from "@/hooks/useBilling";
import { ApiError } from "@/lib/api";
import { fmtDate, todayIso } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { sales as t } from "@/strings/sales";
import { useAuthStore } from "@/stores/useAuthStore";
import { CashDrawerField } from "@/components/cash/CashDrawerField";

interface PendingRefundsPanelProps {
  saleId: string;
  pendingRefundDue?: number;
  pendingRefunds?: PendingSaleRefund[];
  defaultMethod?: PaymentMethod | null;
}

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

export function PendingRefundsPanel({
  saleId,
  pendingRefundDue = 0,
  pendingRefunds = [],
  defaultMethod,
}: PendingRefundsPanelProps) {
  const isOwner = useAuthStore((state) => state.user?.role === "owner");
  const [selected, setSelected] = useState<PendingSaleRefund | null>(null);
  const [method, setMethod] = useState<PaymentMethod>(defaultMethod ?? "cash");
  const [cashDrawerId, setCashDrawerId] = useState<string>();
  const [date, setDate] = useState(todayIso());
  const [idempotencyKey, setIdempotencyKey] = useState(createIdempotencyKey);
  const [error, setError] = useState<string | null>(null);
  const settlement = useSettlePendingSaleRefund(selected?.correction_id ?? "", saleId);

  useEffect(() => {
    if (!selected) return;
    if (pendingRefunds.some((item) => item.correction_id === selected.correction_id)) return;
    setSelected(null);
  }, [pendingRefunds, selected]);

  if (pendingRefunds.length === 0 || pendingRefundDue < 0.01) return null;

  function beginSettlement(item: PendingSaleRefund) {
    setSelected(item);
    setMethod(defaultMethod ?? "cash");
    setCashDrawerId(undefined);
    setDate(todayIso());
    setIdempotencyKey(createIdempotencyKey());
    setError(null);
  }

  async function settle() {
    if (!selected || !isOwner) return;
    setError(null);
    try {
      const response = await settlement.mutateAsync({
        payment_method: method,
        payment_date: date,
        ...(method === "cash" && cashDrawerId ? { cash_drawer_id: cashDrawerId } : {}),
        idempotency_key: idempotencyKey,
      });
      toast.success(t.page.pendingRefund.success(fmtMoney(response.amount)));
      setSelected(null);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const details = caught.details as Record<string, unknown> | null;
        setError(
          (details?.exception as string | undefined) ||
            (details?.message as string | undefined) ||
            caught.message ||
            t.page.pendingRefund.error
        );
        return;
      }
      setError(t.page.pendingRefund.error);
    }
  }

  return (
    <section className="space-y-3 rounded-lg border border-warning/40 bg-warning/5 p-4">
      <div className="space-y-1">
        <h3 className="text-sm font-semibold text-foreground">{t.page.pendingRefund.title}</h3>
        <p className="text-xs text-muted-foreground">
          {t.page.pendingRefund.total(fmtMoney(pendingRefundDue))}
        </p>
      </div>

      <div className="space-y-2">
        {pendingRefunds.map((item) => {
          const isSelected = selected?.correction_id === item.correction_id;
          return (
            <div key={item.correction_id} className="rounded-md border border-border bg-card p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 space-y-1">
                  <p className="font-semibold tabular text-foreground">{fmtMoney(item.amount_due)}</p>
                  <p className="text-xs text-muted-foreground">
                    {t.page.pendingRefund.reason}: {item.reason || "—"}
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {t.page.pendingRefund.created}: {fmtDate(item.created_at)}
                  </p>
                </div>
                {isOwner ? (
                  <Button
                    type="button"
                    variant={isSelected ? "secondary" : "outline"}
                    size="sm"
                    onClick={() => (isSelected ? setSelected(null) : beginSettlement(item))}
                    disabled={settlement.isPending}
                  >
                    {isSelected ? t.page.pendingRefund.cancel : t.page.pendingRefund.settle}
                  </Button>
                ) : (
                  <p className="max-w-56 text-xs text-muted-foreground">
                    {t.page.pendingRefund.ownerHint}
                  </p>
                )}
              </div>

              {isSelected && isOwner && (
                <div data-date-scope className="mt-4 space-y-3 border-t border-border pt-3">
                  {error && (
                    <Alert variant="destructive">
                      <AlertTriangle className="h-4 w-4" />
                      <AlertTitle>Error</AlertTitle>
                      <AlertDescription>{error}</AlertDescription>
                    </Alert>
                  )}
                  <fieldset className="space-y-2">
                    <legend className="text-sm font-medium">{t.page.pendingRefund.method}</legend>
                    <RadioGroup
                      value={method}
                      onValueChange={(value) => setMethod(value as PaymentMethod)}
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
                      id={`pending-refund-cash-drawer-${item.correction_id}`}
                    />
                  )}
                  <div className="space-y-2">
                    <Label htmlFor={`pending-refund-date-${item.correction_id}`}>
                      {t.page.pendingRefund.date}
                    </Label>
                    <DateInput
                      id={`pending-refund-date-${item.correction_id}`}
                      context="recent"
                      max={todayIso()}
                      value={date}
                      onValueChange={(event) => setDate(event)}
                      className="max-w-56"
                    />
                  </div>
                  <div className="flex justify-end">
                    <Button
                      type="button"
                      variant="destructive"
                      onClick={event => { if (validateDateFields(event)) settle(); }}
                      disabled={settlement.isPending}
                    >
                      {settlement.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                      {settlement.isPending
                        ? t.page.pendingRefund.confirming
                        : t.page.pendingRefund.confirm}
                    </Button>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </section>
  );
}
