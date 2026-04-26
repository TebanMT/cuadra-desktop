import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useSettleBalance,
  fmtMoney,
  type PaymentMethod,
} from "@/hooks/useBilling";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { billing as t } from "@/strings/billing";

interface Props {
  paymentId: string;
  memberName: string;
  pendingBalance: number;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function SettleBalanceModal({
  paymentId,
  memberName,
  pendingBalance,
  open,
  onOpenChange,
}: Props) {
  const settle = useSettleBalance(paymentId);
  const [amount, setAmount] = useState<string>("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setAmount(pendingBalance.toFixed(2));
      setMethod("cash");
      setError(null);
    }
  }, [open, pendingBalance]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = parseFloat(amount);
    if (!Number.isFinite(v) || v <= 0 || v > pendingBalance) {
      setError(t.settle.errors.amountInvalid);
      return;
    }
    if (!method) {
      setError(t.settle.errors.methodRequired);
      return;
    }
    try {
      const res = await settle.mutateAsync({
        amount: v,
        payment_method: method,
        payment_date: todayIso(),
      });
      toast.success(t.settle.success(fmtMoney(res.remaining_balance)));
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.settle.errors.generic);
      } else {
        setError(t.settle.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.settle.title(memberName)}</DialogTitle>
          <p className="text-sm text-muted-foreground">
            {t.settle.pendingLabel(fmtMoney(pendingBalance))}
          </p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label htmlFor="sb-amount">{t.settle.amountLabel}</Label>
            <Input
              id="sb-amount"
              type="number"
              inputMode="decimal"
              min={0}
              max={pendingBalance}
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label>{t.settle.methodLabel}</Label>
            <RadioGroup
              value={method}
              onValueChange={(v) => setMethod(v as PaymentMethod)}
              className="flex flex-wrap gap-4"
            >
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="cash" id="sb-m-cash" />
                <span>{t.payment.methods.cash}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="transfer" id="sb-m-tr" />
                <span>{t.payment.methods.transfer}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="card" id="sb-m-card" />
                <span>{t.payment.methods.card}</span>
              </label>
            </RadioGroup>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={settle.isPending}
            >
              {t.settle.cancel}
            </Button>
            <Button type="submit" disabled={settle.isPending}>
              {settle.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.settle.submit(fmtMoney(parseFloat(amount) || 0))}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
