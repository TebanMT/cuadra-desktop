import { validateDateFields } from "@/lib/date-input";
import { DateInput } from "@/components/ui/date-input";
import { useEffect, useRef, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  fmtMoney,
  type Payment,
  type RefundMoneyReturn,
  useRefund,
  useRefundPreview,
} from "@/hooks/useBilling";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { keyForPayload } from "@/lib/idempotency";
import { billing as t } from "@/strings/billing";
import { CashDrawerField } from "@/components/cash/CashDrawerField";

interface Props {
  payment: Payment;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function RefundModal({ payment, open, onOpenChange }: Props) {
  const isMembership = payment.concept === "membership";
  const isProduct = payment.concept === "product";
  const isSettlement = payment.concept === "balance_settlement";
  const preview = useRefundPreview(payment.id, open && !isProduct);
  const refund = useRefund(payment.id);

  const [reason, setReason] = useState("");
  const [amount, setAmount] = useState("");
  const [refundDate, setRefundDate] = useState(todayIso());
  const [revertMembership, setRevertMembership] = useState(false);
  const [moneyReturned, setMoneyReturned] = useState<RefundMoneyReturn>(
    payment.payment_method ?? "cash",
  );
  const [cashDrawerId, setCashDrawerId] = useState<string | undefined>(
    payment.cash_drawer_id ?? undefined,
  );
  const [error, setError] = useState<string | null>(null);
  const initializedPreview = useRef("");
  const refundAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!open) return;
    setReason("");
    setAmount("");
    setRefundDate(todayIso());
    setRevertMembership(false);
    setMoneyReturned(payment.payment_method ?? "cash");
    setCashDrawerId(payment.cash_drawer_id ?? undefined);
    setError(null);
    initializedPreview.current = "";
  }, [open, payment.id, payment.payment_method, payment.cash_drawer_id]);

  useEffect(() => {
    if (!open || !preview.data || initializedPreview.current === payment.id) return;
    setAmount(preview.data.selected_refundable.toFixed(2));
    initializedPreview.current = payment.id;
  }, [open, payment.id, preview.data]);

  const selectedLimit = preview.data?.selected_refundable ?? 0;
  const aggregateLimit = preview.data?.aggregate_refundable ?? 0;
  const amountValue = Number(amount);

  function setRevert(next: boolean) {
    setRevertMembership(next);
    const nextAmount = next ? aggregateLimit : selectedLimit;
    setAmount(nextAmount.toFixed(2));
    setError(null);
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (isProduct) {
      setError(t.refund.productRequiresLines);
      return;
    }
    if (!preview.data) {
      setError("No pudimos confirmar cuánto queda disponible para devolver.");
      return;
    }
    if (reason.trim().length < 3) {
      setError(t.refund.errors.reasonRequired);
      return;
    }
    if (!refundDate) {
      setError("Selecciona la fecha en que devolviste el dinero.");
      return;
    }
    const limit = revertMembership ? aggregateLimit : selectedLimit;
    if (
      !Number.isFinite(amountValue) ||
      amountValue <= 0 ||
      amountValue > limit ||
      Math.abs(amountValue * 100 - Math.round(amountValue * 100)) > 1e-7 ||
      (revertMembership && Math.abs(amountValue - aggregateLimit) >= 0.005)
    ) {
      setError(`Captura un monto entre $0.01 y ${fmtMoney(limit)}.`);
      return;
    }

    const refundWithoutKey = {
      reason: reason.trim(),
      payment_method: moneyReturned,
      ...(moneyReturned === "cash" && cashDrawerId
        ? { cash_drawer_id: cashDrawerId }
        : {}),
      amount: amountValue,
      payment_date: refundDate,
      ...(isMembership ? { revert_membership: revertMembership } : {}),
    };
    refundAttempt.current = keyForPayload(refundAttempt.current, refundWithoutKey);

    try {
      await refund.mutateAsync({
        ...refundWithoutKey,
        idempotency_key: refundAttempt.current.key,
      });
      refundAttempt.current = null;
      toast.success(t.refund.success);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.refund.errors.generic);
      } else {
        setError(t.refund.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>Registrar devolución</DialogTitle>
          <DialogDescription>
            Registra el dinero que entregas al cliente.
          </DialogDescription>
        </DialogHeader>

        {isProduct ? (
          <div className="space-y-4">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t.refund.productRequiresLines}</AlertDescription>
            </Alert>
            <div className="flex justify-end">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                {t.refund.cancel}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmitCapture={validateDateFields} onSubmit={submit} className="space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            {preview.error && (
              <Alert variant="destructive">
                <AlertDescription>
                  No se pudo calcular cuánto puedes devolver. Cierra y vuelve a abrir.
                </AlertDescription>
              </Alert>
            )}
            {preview.data && (
              <div className="rounded-md border bg-muted/40 p-3 text-sm space-y-1.5">
                <div className="flex justify-between gap-3">
                  <span>Disponible en este cobro</span>
                  <strong className="tabular-nums">{fmtMoney(selectedLimit)}</strong>
                </div>
                {Math.abs(aggregateLimit - selectedLimit) >= 0.005 && (
                  <div className="flex justify-between gap-3 text-muted-foreground">
                    <span>Disponible en toda la obligación</span>
                    <span className="tabular-nums">{fmtMoney(aggregateLimit)}</span>
                  </div>
                )}
                {preview.data.balance_pending > 0 && (
                  <div className="flex justify-between gap-3 text-muted-foreground">
                    <span>Saldo aún no cobrado</span>
                    <span className="tabular-nums">{fmtMoney(preview.data.balance_pending)}</span>
                  </div>
                )}
              </div>
            )}

            {isSettlement && preview.data && (
              <Alert>
                <AlertDescription>
                  Al devolver este abono, {fmtMoney(Number.isFinite(amountValue) ? amountValue : 0)} volverá a
                  quedar como saldo pendiente de la obligación original.
                </AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="rf-amount">Dinero que devolverás *</Label>
              <Input
                id="rf-amount"
                type="number"
                min="0.01"
                step="0.01"
                max={revertMembership ? aggregateLimit : selectedLimit}
                value={amount}
                onChange={(event) => setAmount(event.target.value)}
                disabled={preview.isLoading || revertMembership}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rf-reason">{t.refund.reasonLabel} *</Label>
              <Textarea
                id="rf-reason"
                rows={3}
                value={reason}
                placeholder={t.refund.reasonPlaceholder}
                onChange={(event) => setReason(event.target.value)}
                autoFocus
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="rf-date">Fecha en que salió el dinero *</Label>
              <DateInput id="rf-date" context="recent" max={todayIso()} value={refundDate} onValueChange={(event) => setRefundDate(event)} required />
            </div>

            {isMembership && preview.data?.membership_revert_allowed && (
              <label className="flex items-start gap-2 cursor-pointer">
                <Checkbox
                  checked={revertMembership}
                  onCheckedChange={(value) => setRevert(value === true)}
                  className="mt-0.5"
                />
                <span className="text-sm">
                  Cancelar también esta membresía
                  {preview.data.balance_pending > 0
                    ? ` y eliminar ${fmtMoney(preview.data.balance_pending)} pendientes`
                    : ""}
                </span>
              </label>
            )}
            {isMembership && preview.data && !preview.data.membership_revert_allowed && (
              <p className="text-xs text-muted-foreground">
                {preview.data.membership_revert_block_reason ||
                  "Este cobro no permite cancelar la membresía de forma automática."}{" "}
                Puedes devolver únicamente el importe seleccionado.
              </p>
            )}

            <div className="space-y-2">
              <Label>{t.refund.moneyLabel}</Label>
              <RadioGroup
                value={moneyReturned}
                onValueChange={(value) => setMoneyReturned(value as RefundMoneyReturn)}
                className="space-y-1.5"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="cash" id="rf-cash" />
                  <span>{t.refund.money.cash}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="transfer" id="rf-tr" />
                  <span>{t.refund.money.transfer}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="card" id="rf-card" />
                  <span>{t.refund.money.card}</span>
                </label>
              </RadioGroup>
            </div>

            {moneyReturned === "cash" && (
              <CashDrawerField
                value={cashDrawerId}
                onChange={setCashDrawerId}
                id="membership-refund-cash-drawer"
              />
            )}

            <div className="flex items-start gap-2 rounded-md bg-warning/10 text-warning px-3 py-2 text-xs">
              <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" />
              <span>{t.refund.disclaimer}</span>
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={refund.isPending}
              >
                {t.refund.cancel}
              </Button>
              <Button
                type="submit"
                variant="destructive"
                disabled={refund.isPending || preview.isLoading || !preview.data}
              >
                {refund.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t.refund.submit}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
