import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, MessageCircle } from "lucide-react";
import { addDays, max as dateMax } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMembershipTypes, type MembershipType } from "@/hooks/useMembershipTypes";
import {
  useRegisterMembershipPayment,
  fmtMoney,
  type PaymentMethod,
  type RegisterMembershipPaymentInput,
  type RegisterMembershipPaymentResponse,
} from "@/hooks/useBilling";
import { useSyncStatus, levelOf } from "@/hooks/useSyncStatus";
import type { Member, MembershipSummary } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { fmtDate, parseDate, todayIso } from "@/lib/dates";
import { printPdf } from "@/lib/tauri-bridge";
import { api } from "@/lib/api";
import { billing as t } from "@/strings/billing";

interface Props {
  member: Pick<Member, "id" | "full_name" | "phone" | "enrollment_paid" | "last_maintenance_paid">;
  currentMembership: MembershipSummary | null | undefined;
  open: boolean;
  onOpenChange(open: boolean): void;
}

function maintenanceApplies(
  type: MembershipType,
  lastPaid: string | null | undefined
): boolean {
  if (!type.maintenance_fee || type.maintenance_fee <= 0) return false;
  if (type.maintenance_frequency === "monthly") return true;
  if (type.maintenance_frequency === "annual") {
    if (!lastPaid) return true;
    const last = parseDate(lastPaid);
    if (!last) return true;
    const now = new Date();
    const diff = (now.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
    return diff >= 365;
  }
  return false;
}

function previewNewExpiry(
  paymentDateIso: string,
  currentExpiry: string | null | undefined,
  durationDays: number
): string | null {
  const payDate = parseDate(paymentDateIso);
  if (!payDate) return null;
  const cur = currentExpiry ? parseDate(currentExpiry) : null;
  const base = cur && cur >= payDate ? cur : payDate;
  return fmtDate(addDays(dateMax([base, payDate]), durationDays));
}

export function PaymentModal({ member, currentMembership, open, onOpenChange }: Props) {
  const types = useMembershipTypes();
  const register = useRegisterMembershipPayment();
  const sync = useSyncStatus(open);

  const [typeId, setTypeId] = useState<string>(currentMembership?.membership_type_id || "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paymentDate, setPaymentDate] = useState<string>(todayIso());
  const [notes, setNotes] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<RegisterMembershipPaymentResponse | null>(null);
  const [whatsappState, setWhatsappState] = useState<"idle" | "sending" | "sent" | "error">("idle");

  useEffect(() => {
    if (open) {
      setTypeId(currentMembership?.membership_type_id || "");
      setMethod("cash");
      setPaymentDate(todayIso());
      setNotes("");
      setDiscountOpen(false);
      setDiscountAmount("");
      setDiscountReason("");
      setPartialOpen(false);
      setPartialAmount("");
      setError(null);
      setSuccess(null);
      setWhatsappState("idle");
    }
  }, [open, currentMembership?.membership_type_id]);

  const selectedType = useMemo(
    () => types.data?.find((tp) => tp.id === typeId) || null,
    [types.data, typeId]
  );

  const breakdown = useMemo(() => {
    if (!selectedType) return null;
    const base = selectedType.price;
    const enrollment = !member.enrollment_paid ? selectedType.enrollment_fee || 0 : 0;
    const maint = maintenanceApplies(selectedType, member.last_maintenance_paid)
      ? selectedType.maintenance_fee || 0
      : 0;
    const subtotal = base + enrollment + maint;
    return { base, enrollment, maint, subtotal };
  }, [selectedType, member.enrollment_paid, member.last_maintenance_paid]);

  const discountValue = useMemo(() => {
    if (!discountOpen) return 0;
    const v = parseFloat(discountAmount);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [discountOpen, discountAmount]);

  const total = useMemo(() => {
    if (!breakdown) return 0;
    return Math.max(0, breakdown.subtotal - discountValue);
  }, [breakdown, discountValue]);

  const partialValue = useMemo(() => {
    if (!partialOpen) return null;
    const v = parseFloat(partialAmount);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [partialOpen, partialAmount]);

  const amountToCharge = partialValue ?? total;
  const pendingBalance = partialValue !== null ? Math.max(0, total - partialValue) : 0;

  const newExpiry = useMemo(
    () =>
      selectedType
        ? previewNewExpiry(paymentDate, currentMembership?.expiry_date, selectedType.duration_days)
        : null,
    [selectedType, paymentDate, currentMembership?.expiry_date]
  );

  const offline = levelOf(sync.data) !== "ok";

  function validate(): string | null {
    if (!selectedType) return t.payment.errors.amountInvalid;
    if (!method) return t.payment.errors.methodRequired;
    if (total <= 0) return t.payment.errors.amountInvalid;
    if (discountOpen) {
      if (discountValue <= 0 || !breakdown || discountValue > breakdown.subtotal) {
        return t.payment.errors.discountInvalid;
      }
      if (!discountReason.trim()) return t.payment.errors.discountReasonRequired;
    }
    if (partialOpen) {
      if (partialValue === null || partialValue <= 0 || partialValue > total) {
        return t.payment.errors.partialInvalid;
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    if (!selectedType) return;

    const payload: RegisterMembershipPaymentInput = {
      member_id: member.id,
      membership_type_id: selectedType.id,
      payment_method: method,
      amount: amountToCharge,
      payment_date: paymentDate,
      ...(discountOpen
        ? { discount_amount: discountValue, discount_reason: discountReason.trim() }
        : {}),
      ...(partialOpen && partialValue !== null ? { partial_amount: partialValue } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    try {
      const res = await register.mutateAsync(payload);
      setSuccess(res);
      const expiryFmt = fmtDate(res.new_expiry_date);
      const amountFmt = fmtMoney(res.payment.amount);
      if (res.pending_offline_sync || offline) {
        toast.success(t.payment.success.offline);
      } else {
        toast.success(t.payment.success.online(amountFmt, member.full_name, expiryFmt));
      }
      if (res.payment.receipt_sent_via === "whatsapp") {
        toast.message(t.payment.success.whatsappSent(member.full_name.split(" ")[0]));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.payment.errors.generic);
      } else {
        setError(t.payment.errors.generic);
      }
    }
  }

  async function handlePrint() {
    if (!success) return;
    try {
      const res = await api.blob(`/api/v1/payments/${success.payment.id}/receipt.pdf`);
      const buf = new Uint8Array(await res.blob.arrayBuffer());
      await printPdf(buf);
      toast.success(t.payment.afterAction.printOk);
    } catch {
      toast.error(t.payment.afterAction.printError);
    }
  }

  async function handleSendWhatsapp() {
    if (!success) return;
    setWhatsappState("sending");
    try {
      await api.post(`/api/v1/payments/${success.payment.id}/send-receipt`, {
        channel: "whatsapp",
      });
      setWhatsappState("sent");
      toast.success(t.payment.afterAction.whatsappOk);
    } catch {
      setWhatsappState("error");
      toast.error(t.payment.afterAction.whatsappError);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>{t.payment.title(member.full_name)}</DialogTitle>
        </DialogHeader>

        {success ? (
          <div className="space-y-4">
            <Alert>
              <AlertDescription>
                {fmtMoney(success.payment.amount)} cobrados. Vence {fmtDate(success.new_expiry_date)}.
              </AlertDescription>
            </Alert>
            <div className="flex flex-wrap gap-2">
              <Button variant="outline" onClick={handlePrint}>
                <Printer className="h-4 w-4" />
                {t.payment.afterAction.print}
              </Button>
              <Button
                variant="outline"
                onClick={handleSendWhatsapp}
                disabled={whatsappState === "sending" || !member.phone}
              >
                {whatsappState === "sending" ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <MessageCircle className="h-4 w-4" />
                )}
                {whatsappState === "sending"
                  ? t.payment.afterAction.whatsappSending
                  : t.payment.afterAction.sendWhatsapp}
              </Button>
              <Button onClick={() => onOpenChange(false)} className="ml-auto">
                {t.payment.afterAction.close}
              </Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4" noValidate>
            {offline && (
              <Alert>
                <AlertDescription>{t.payment.offline}</AlertDescription>
              </Alert>
            )}
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="pm-type">{t.payment.membership}</Label>
              <Select value={typeId} onValueChange={setTypeId} disabled={types.isLoading}>
                <SelectTrigger id="pm-type">
                  <SelectValue placeholder="Selecciona…" />
                </SelectTrigger>
                <SelectContent>
                  {types.data
                    ?.filter((tp) => tp.active || tp.id === currentMembership?.membership_type_id)
                    .map((tp) => (
                      <SelectItem key={tp.id} value={tp.id}>
                        {tp.name} — {fmtMoney(tp.price)}
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
            </div>

            {breakdown && (
              <div className="rounded-md border bg-muted/40 p-3 space-y-1.5">
                <div className="flex items-baseline justify-between">
                  <span className="text-sm">{t.payment.total}</span>
                  <span className="text-2xl font-semibold tabular-nums">{fmtMoney(total)}</span>
                </div>
                <div className="text-xs text-muted-foreground space-y-0.5">
                  <div className="flex justify-between">
                    <span>{t.payment.breakdown.base}</span>
                    <span className="tabular-nums">{fmtMoney(breakdown.base)}</span>
                  </div>
                  {breakdown.enrollment > 0 && (
                    <div className="flex justify-between">
                      <span>+ {t.payment.breakdown.enrollment}</span>
                      <span className="tabular-nums">{fmtMoney(breakdown.enrollment)}</span>
                    </div>
                  )}
                  {breakdown.maint > 0 && (
                    <div className="flex justify-between">
                      <span>+ {t.payment.breakdown.maintenance}</span>
                      <span className="tabular-nums">{fmtMoney(breakdown.maint)}</span>
                    </div>
                  )}
                  {discountValue > 0 && (
                    <div className="flex justify-between text-success">
                      <span>− {t.payment.breakdown.discount}</span>
                      <span className="tabular-nums">−{fmtMoney(discountValue)}</span>
                    </div>
                  )}
                </div>
              </div>
            )}

            <div className="space-y-3">
              <button
                type="button"
                className="text-sm text-primary hover:underline"
                onClick={() => setDiscountOpen((v) => !v)}
              >
                {discountOpen ? t.payment.removeDiscount : t.payment.addDiscount}
              </button>
              {discountOpen && (
                <div className="grid grid-cols-2 gap-2 pl-3 border-l-2 border-muted">
                  <div className="space-y-1">
                    <Label htmlFor="pm-disc">{t.payment.discountLabel}</Label>
                    <Input
                      id="pm-disc"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      value={discountAmount}
                      onChange={(e) => setDiscountAmount(e.target.value)}
                    />
                  </div>
                  <div className="space-y-1">
                    <Label htmlFor="pm-disc-r">{t.payment.discountReasonLabel} *</Label>
                    <Input
                      id="pm-disc-r"
                      value={discountReason}
                      placeholder={t.payment.discountReasonPlaceholder}
                      onChange={(e) => setDiscountReason(e.target.value)}
                    />
                  </div>
                </div>
              )}

              <button
                type="button"
                className="text-sm text-primary hover:underline block"
                onClick={() => setPartialOpen((v) => !v)}
              >
                {partialOpen ? t.payment.removePartial : t.payment.addPartial}
              </button>
              {partialOpen && (
                <div className="pl-3 border-l-2 border-muted space-y-1">
                  <Label htmlFor="pm-partial">{t.payment.partialLabel}</Label>
                  <Input
                    id="pm-partial"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={total}
                    value={partialAmount}
                    onChange={(e) => setPartialAmount(e.target.value)}
                  />
                  {pendingBalance > 0 && (
                    <p className="text-xs text-muted-foreground">
                      {t.payment.partialHint(fmtMoney(pendingBalance))}
                    </p>
                  )}
                </div>
              )}
            </div>

            <div className="space-y-2">
              <Label>{t.payment.method}</Label>
              <RadioGroup
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
                className="flex flex-wrap gap-4"
              >
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="cash" id="pm-m-cash" />
                  <span>{t.payment.methods.cash}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="transfer" id="pm-m-tr" />
                  <span>{t.payment.methods.transfer}</span>
                </label>
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="card" id="pm-m-card" />
                  <span>{t.payment.methods.card}</span>
                </label>
              </RadioGroup>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pm-date">{t.payment.date}</Label>
                <Input
                  id="pm-date"
                  type="date"
                  value={paymentDate}
                  onChange={(e) => setPaymentDate(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="pm-notes">{t.payment.notes}</Label>
                <Input
                  id="pm-notes"
                  value={notes}
                  placeholder={t.payment.notesPlaceholder}
                  onChange={(e) => setNotes(e.target.value)}
                />
              </div>
            </div>

            {newExpiry && (
              <p className="text-sm text-muted-foreground">{t.payment.newExpiry(newExpiry)}</p>
            )}

            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={register.isPending}
              >
                {t.payment.cancel}
              </Button>
              <Button type="submit" disabled={register.isPending || !selectedType || total <= 0}>
                {register.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t.payment.submit(fmtMoney(amountToCharge))}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
