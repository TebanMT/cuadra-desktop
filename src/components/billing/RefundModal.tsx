import { useEffect, useState } from "react";
import { Loader2, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  useRefund,
  fmtMoney,
  type Payment,
  type RefundMoneyReturn,
} from "@/hooks/useBilling";
import { ApiError } from "@/lib/api";
import { billing as t } from "@/strings/billing";

interface Props {
  payment: Payment;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function RefundModal({ payment, open, onOpenChange }: Props) {
  const refund = useRefund(payment.id);
  const [reason, setReason] = useState("");
  const [revertMembership, setRevertMembership] = useState<boolean>(payment.concept === "membership");
  const [moneyReturned, setMoneyReturned] = useState<RefundMoneyReturn>(
    payment.payment_method === "transfer" ? "transfer" : "cash"
  );
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setReason("");
      setRevertMembership(payment.concept === "membership");
      setMoneyReturned(payment.payment_method === "transfer" ? "transfer" : "cash");
      setError(null);
    }
  }, [open, payment.concept, payment.payment_method]);

  const isMembership = payment.concept === "membership";

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!reason.trim()) {
      setError(t.refund.errors.reasonRequired);
      return;
    }
    try {
      await refund.mutateAsync({
        reason: reason.trim(),
        revert_membership: isMembership ? revertMembership : false,
        money_returned: moneyReturned,
      });
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
          <DialogTitle>{t.refund.title(fmtMoney(Math.abs(payment.amount)))}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="rf-reason">{t.refund.reasonLabel} *</Label>
            <Textarea
              id="rf-reason"
              rows={3}
              value={reason}
              placeholder={t.refund.reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
              autoFocus
            />
          </div>

          {isMembership && (
            <label className="flex items-start gap-2 cursor-pointer">
              <Checkbox
                checked={revertMembership}
                onCheckedChange={(v) => setRevertMembership(v === true)}
                className="mt-0.5"
              />
              <span className="text-sm">{t.refund.revertLabel}</span>
            </label>
          )}

          <div className="space-y-2">
            <Label>{t.refund.moneyLabel}</Label>
            <RadioGroup
              value={moneyReturned}
              onValueChange={(v) => setMoneyReturned(v as RefundMoneyReturn)}
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
                <RadioGroupItem value="none" id="rf-none" />
                <span>{t.refund.money.none}</span>
              </label>
            </RadioGroup>
          </div>

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
            <Button type="submit" variant="destructive" disabled={refund.isPending}>
              {refund.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.refund.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
