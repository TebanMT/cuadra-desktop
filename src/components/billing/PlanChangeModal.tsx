import { useEffect, useMemo, useRef, useState } from "react";
import { Loader2, Minus, Plus } from "lucide-react";
import { toast } from "sonner";
import { differenceInCalendarDays } from "date-fns";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useMembershipTypes } from "@/hooks/useMembershipTypes";
import {
  useChangeMembershipPlan,
  fmtMoney,
  type PaymentMethod,
  type PlanChangeInput,
  type PlanChangeResponse,
} from "@/hooks/useBilling";
import { useSyncStatus, levelOf } from "@/hooks/useSyncStatus";
import type { Member, MembershipSummary } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { fmtDate, parseDate, todayIso } from "@/lib/dates";
import { billing as t } from "@/strings/billing";
import { CashDrawerField } from "@/components/cash/CashDrawerField";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePermission } from "@/lib/permissions";
import { keyForPayload } from "@/lib/idempotency";
import { RestrictedNote } from "@/components/shared/RestrictedNote";

interface Props {
  member: Pick<Member, "id" | "full_name">;
  currentMembership: MembershipSummary;
  open: boolean;
  onOpenChange(open: boolean): void;
  onChanged?(res: PlanChangeResponse): void;
}

type ChargeOption = "prorated" | "full";

// Espeja planChangeProration del backend (change_membership_plan.go, UC-048):
// la sugerencia vive en [0, delta] aun con fechas degeneradas (ciclo de 0
// días, hoy fuera del ciclo por un ajuste manual). El BE recalcula y manda;
// esto es sólo el preview.
function proration(delta: number, daysRemaining: number, cycleDays: number): number {
  if (delta <= 0) return 0;
  if (daysRemaining <= 0) return 0;
  if (cycleDays <= 0 || daysRemaining >= cycleDays) return delta;
  return Math.min(delta, Math.round((delta * daysRemaining) / cycleDays));
}

export function PlanChangeModal({ member, currentMembership, open, onOpenChange, onChanged }: Props) {
  const readOnly = useAuthStore((s) => s.readOnly);
  // Mismos permisos que UC-018: descuento necesita "discounts", cobrar a
  // medias necesita "credit". Elegir proporcional o diferencia completa no es
  // un descuento (DA-48.3) — cualquier operador puede.
  const canDiscount = usePermission("discounts");
  const canCredit = usePermission("credit");
  const [cashReady, setCashReady] = useState(false);
  const types = useMembershipTypes();
  const change = useChangeMembershipPlan();
  const sync = useSyncStatus(open);

  const [typeId, setTypeId] = useState("");
  const [chargeOption, setChargeOption] = useState<ChargeOption>("prorated");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [cashDrawerId, setCashDrawerId] = useState<string>();
  const [notes, setNotes] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  const [error, setError] = useState<string | null>(null);
  const completed = useRef(false);
  const sending = useRef(false);
  const opened = useRef(false);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (open && !opened.current) {
      completed.current = false;
      setTypeId("");
      setChargeOption("prorated");
      setMethod("cash");
      setCashDrawerId(undefined);
      setNotes("");
      setDiscountOpen(false);
      setDiscountAmount("");
      setDiscountReason("");
      setPartialOpen(false);
      setPartialAmount("");
      setError(null);
      attempt.current = null;
    }
    opened.current = open;
  }, [open]);

  // Sólo upgrade o cambio lateral: tipos activos de precio >= al snapshot
  // actual, distintos del actual. Un downgrade se elige al renovar (UC-018).
  const eligible = useMemo(
    () =>
      (types.data ?? []).filter(
        (tp) =>
          tp.active &&
          tp.id !== currentMembership.membership_type_id &&
          tp.price >= currentMembership.price,
      ),
    [types.data, currentMembership],
  );

  // Con un solo camino de upgrade (el caso común), pre-elegirlo ahorra el
  // dropdown; con varios, el operador decide.
  useEffect(() => {
    if (open && !typeId && eligible.length === 1) setTypeId(eligible[0].id);
  }, [open, typeId, eligible]);

  const selectedType = useMemo(
    () => eligible.find((tp) => tp.id === typeId) || null,
    [eligible, typeId],
  );

  // días del ciclo y restantes con las FECHAS REALES de la membresía actual
  // (respeta ajustes manuales de UC-017). Hoy cuenta como restante.
  const { cycleDays, daysRemaining } = useMemo(() => {
    const start = parseDate(currentMembership.start_date);
    const expiry = parseDate(currentMembership.expiry_date);
    const today = parseDate(todayIso());
    if (!start || !expiry || !today) return { cycleDays: 0, daysRemaining: 0 };
    return {
      cycleDays: differenceInCalendarDays(expiry, start),
      daysRemaining: differenceInCalendarDays(expiry, today),
    };
  }, [currentMembership.start_date, currentMembership.expiry_date]);

  const delta = selectedType ? selectedType.price - currentMembership.price : 0;
  const prorated = proration(delta, daysRemaining, cycleDays);
  // Cuando el prorrateo coincide con la diferencia completa (ciclo entero por
  // delante o fechas degeneradas) no hay nada que elegir.
  const hasOptions = delta > 0 && prorated < delta;
  const chosen = !selectedType ? 0 : hasOptions && chargeOption === "full" ? delta : delta > 0 ? (hasOptions ? prorated : delta) : 0;

  const discountValue = useMemo(() => {
    if (!discountOpen || !canDiscount) return 0;
    const v = parseFloat(discountAmount);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [discountOpen, discountAmount, canDiscount]);

  const total = Math.max(0, chosen - discountValue);

  const partialValue = useMemo(() => {
    if (!partialOpen || !canCredit) return null;
    const v = parseFloat(partialAmount);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [partialOpen, partialAmount, canCredit]);

  const amountToCharge = partialValue ?? total;
  const pendingBalance = partialValue !== null ? Math.max(0, total - partialValue) : 0;
  const offline = levelOf(sync.data) !== "ok";
  const expiryFmt = fmtDate(currentMembership.expiry_date);

  function validate(): string | null {
    if (!selectedType) return t.planChange.errors.typeRequired;
    if (total > 0 && !method) return t.payment.errors.methodRequired;
    if (total > 0 && method === "cash" && !cashReady)
      return "Espera a confirmar la caja o reintenta su consulta.";
    if (discountOpen && canDiscount) {
      if (discountValue <= 0 || discountValue > chosen) return t.payment.errors.discountInvalid;
      if (!discountReason.trim()) return t.payment.errors.discountReasonRequired;
    }
    if (partialOpen && canCredit) {
      if (partialValue === null || partialValue <= 0 || partialValue > total) {
        return t.payment.errors.partialInvalid;
      }
    }
    return null;
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current || completed.current || readOnly) return;
    const v = validate();
    if (v) {
      setError(v);
      return;
    }
    setError(null);
    if (!selectedType) return;

    const changeWithoutKey = {
      member_id: member.id,
      new_membership_type_id: selectedType.id,
      amount: chosen,
      ...(total > 0 ? { payment_method: method } : {}),
      ...(total > 0 && method === "cash" && cashDrawerId ? { cash_drawer_id: cashDrawerId } : {}),
      ...(discountOpen && canDiscount && discountValue > 0
        ? { discount_amount: discountValue, discount_reason: discountReason.trim() }
        : {}),
      ...(partialOpen && partialValue !== null ? { partial_amount: partialValue } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };
    attempt.current = keyForPayload(attempt.current, changeWithoutKey);
    const payload: PlanChangeInput = {
      ...changeWithoutKey,
      idempotency_key: attempt.current.key,
    };

    sending.current = true;
    try {
      const res = await change.mutateAsync(payload);
      completed.current = true;
      onOpenChange(false);
      onChanged?.(res);
      if (res.pending_offline_sync || offline) {
        toast.success(t.payment.success.offline);
      } else {
        toast.success(
          t.planChange.success(member.full_name, res.new_type_name, fmtDate(res.expiry)),
        );
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || t.planChange.errors.generic);
      } else {
        setError(t.planChange.errors.generic);
      }
    } finally {
      sending.current = false;
    }
  }

  const noEligible = !types.isLoading && eligible.length === 0;

  return (
    <Dialog
      open={open}
      busy={change.isPending}
      onOpenChange={(value) => {
        if (!sending.current) onOpenChange(value);
      }}
    >
      <DialogContent className="flex max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5">
          <DialogTitle>{t.planChange.title(member.full_name)}</DialogTitle>
          <div className="text-sm text-muted-foreground">
            <span>{t.planChange.currentLabel}</span>{" "}
            <span className="font-medium text-foreground">
              {currentMembership.type_name} — {fmtMoney(currentMembership.price)}
            </span>
            {currentMembership.expiry_date && (
              <> · {t.planChange.expires(expiryFmt, Math.max(0, daysRemaining))}</>
            )}
          </div>
          <DialogDescription className="sr-only">
            Elige el plan nuevo y el cobro por lo que queda del ciclo. La vigencia no cambia.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-col" noValidate>
          <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
            {offline && (
              <Alert>
                <AlertDescription>{t.payment.offline}</AlertDescription>
              </Alert>
            )}

            {noEligible ? (
              <Alert>
                <AlertDescription>{t.planChange.noEligible}</AlertDescription>
              </Alert>
            ) : (
              <div className="space-y-2">
                <Label htmlFor="pc-type">{t.planChange.newLabel}</Label>
                <Select value={typeId} onValueChange={setTypeId} disabled={types.isLoading}>
                  <SelectTrigger id="pc-type">
                    <SelectValue placeholder={t.planChange.newPlaceholder}>
                      {selectedType?.name}
                    </SelectValue>
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.map((tp) => (
                      <SelectItem key={tp.id} value={tp.id}>
                        {tp.name} — {fmtMoney(tp.price)}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}

            {selectedType && delta === 0 && (
              <p className="text-sm text-muted-foreground">{t.planChange.lateralFree}</p>
            )}

            {selectedType && hasOptions && (
              <div className="space-y-2">
                <Label id="pc-charge-label">{t.planChange.chargeLabel}</Label>
                <RadioGroup
                  aria-labelledby="pc-charge-label"
                  value={chargeOption}
                  onValueChange={(v) => setChargeOption(v as ChargeOption)}
                  className="gap-0 divide-y rounded-md border"
                >
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2">
                    <span className="flex min-w-0 items-center gap-2">
                      <RadioGroupItem value="prorated" id="pc-opt-prorated" />
                      <span>
                        {t.planChange.prorated}
                        <span className="block text-xs text-muted-foreground">
                          {t.planChange.proratedDetail(fmtMoney(delta), daysRemaining, cycleDays)}
                        </span>
                      </span>
                    </span>
                    <span className="tabular font-medium">{fmtMoney(prorated)}</span>
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3 py-2">
                    <span className="flex items-center gap-2">
                      <RadioGroupItem value="full" id="pc-opt-full" />
                      <span>{t.planChange.full}</span>
                    </span>
                    <span className="tabular font-medium">{fmtMoney(delta)}</span>
                  </label>
                </RadioGroup>
              </div>
            )}

            {total > 0 && (
              <div className="space-y-2">
                <Label id="pc-method-label">{t.payment.method}</Label>
                <RadioGroup
                  aria-labelledby="pc-method-label"
                  value={method}
                  onValueChange={(v) => setMethod(v as PaymentMethod)}
                  className="flex flex-wrap gap-4"
                >
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <RadioGroupItem value="cash" id="pc-m-cash" />
                    <span>{t.payment.methods.cash}</span>
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <RadioGroupItem value="transfer" id="pc-m-tr" />
                    <span>{t.payment.methods.transfer}</span>
                  </label>
                  <label className="flex min-h-11 cursor-pointer items-center gap-2">
                    <RadioGroupItem value="card" id="pc-m-card" />
                    <span>{t.payment.methods.card}</span>
                  </label>
                </RadioGroup>
              </div>
            )}

            {total > 0 && method === "cash" && (
              <CashDrawerField
                onReadyChange={setCashReady}
                value={cashDrawerId}
                onChange={setCashDrawerId}
                date={todayIso()}
                id="plan-change-cash-drawer"
              />
            )}

            {selectedType && delta > 0 && (
              <details className="rounded-md border p-3">
                <summary className="min-h-11 cursor-pointer py-3 font-medium">
                  Descuento o pago parcial
                </summary>
                <div className="space-y-3 pt-2">
                  {canDiscount && (
                    <button
                      type="button"
                      className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      aria-expanded={discountOpen}
                      onClick={() => setDiscountOpen((v) => !v)}
                    >
                      {discountOpen ? (
                        <Minus aria-hidden className="h-4 w-4" />
                      ) : (
                        <Plus aria-hidden className="h-4 w-4" />
                      )}
                      {discountOpen ? t.payment.removeDiscount : t.payment.addDiscount}
                    </button>
                  )}
                  {canDiscount && discountOpen && (
                    <div className="grid grid-cols-2 gap-2 border-l border-border pl-3">
                      <div className="space-y-1">
                        <Label htmlFor="pc-disc">{t.payment.discountLabel}</Label>
                        <Input
                          id="pc-disc"
                          type="number"
                          inputMode="decimal"
                          min={0}
                          value={discountAmount}
                          onChange={(e) => setDiscountAmount(e.target.value)}
                        />
                      </div>
                      <div className="space-y-1">
                        <Label htmlFor="pc-disc-r">{t.payment.discountReasonLabel} *</Label>
                        <Input
                          id="pc-disc-r"
                          value={discountReason}
                          placeholder={t.payment.discountReasonPlaceholder}
                          onChange={(e) => setDiscountReason(e.target.value)}
                        />
                      </div>
                    </div>
                  )}
                  {canCredit && (
                    <button
                      type="button"
                      className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                      aria-expanded={partialOpen}
                      onClick={() => setPartialOpen((v) => !v)}
                    >
                      {partialOpen ? (
                        <Minus aria-hidden className="h-4 w-4" />
                      ) : (
                        <Plus aria-hidden className="h-4 w-4" />
                      )}
                      {partialOpen ? t.payment.removePartial : t.payment.addPartial}
                    </button>
                  )}
                  {!canDiscount && (
                    <RestrictedNote permission="discounts">No puedes aplicar descuentos.</RestrictedNote>
                  )}
                  {!canCredit && (
                    <RestrictedNote permission="credit">No puedes cobrar a medias.</RestrictedNote>
                  )}
                  {canCredit && partialOpen && (
                    <div className="space-y-1 border-l border-border pl-3">
                      <Label htmlFor="pc-partial">{t.payment.partialLabel}</Label>
                      <Input
                        id="pc-partial"
                        type="number"
                        inputMode="decimal"
                        min={0}
                        max={total}
                        value={partialAmount}
                        onChange={(e) => setPartialAmount(e.target.value)}
                      />
                    </div>
                  )}
                </div>
              </details>
            )}

            <div className="space-y-1">
              <Label htmlFor="pc-notes">{t.payment.notes}</Label>
              <Input
                id="pc-notes"
                value={notes}
                placeholder="Comentario interno"
                aria-describedby="pc-notes-hint"
                onChange={(e) => setNotes(e.target.value)}
              />
              <p id="pc-notes-hint" className="text-xs text-muted-foreground">
                No aparece en el comprobante.
              </p>
            </div>
          </div>

          <div className="shrink-0 space-y-3 border-t bg-background px-6 py-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2" aria-live="polite">
              <div>
                <p className="text-sm text-muted-foreground">
                  {total > 0
                    ? `${partialValue !== null ? "Abono de hoy" : t.payment.total} · ${t.payment.methods[method]}`
                    : t.planChange.noCharge}
                </p>
                {selectedType ? (
                  <p className="font-display text-3xl leading-tight tabular text-foreground">
                    {fmtMoney(amountToCharge)}
                  </p>
                ) : (
                  <p className="text-base font-medium text-muted-foreground">Elige el plan nuevo</p>
                )}
              </div>
              <div className="max-w-[18rem] text-right text-xs text-muted-foreground">
                <p>{t.planChange.keepsExpiry(expiryFmt)}</p>
                {selectedType && (
                  <p>{t.planChange.nextRenewal(selectedType.name, fmtMoney(selectedType.price))}</p>
                )}
                {pendingBalance > 0 && (
                  <p className="text-warning">
                    Saldo pendiente: <span className="tabular">{fmtMoney(pendingBalance)}</span>
                  </p>
                )}
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={change.isPending}
              >
                {t.payment.cancel}
              </Button>
              <Button
                requiresWrite
                size="lg"
                type="submit"
                disabled={
                  readOnly ||
                  change.isPending ||
                  !selectedType ||
                  (total > 0 && method === "cash" && !cashReady)
                }
              >
                {change.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {!selectedType
                  ? t.planChange.trigger
                  : total > 0
                    ? t.planChange.submit(fmtMoney(amountToCharge))
                    : t.planChange.submitFree}
              </Button>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
