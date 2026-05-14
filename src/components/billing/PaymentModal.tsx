import { useEffect, useMemo, useState } from "react";
import { Loader2, Printer, MessageCircle } from "lucide-react";
import { addDays, max as dateMax } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
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
import { useMembershipTypes, type MaintenanceFrequency } from "@/hooks/useMembershipTypes";
import {
  useRegisterMembershipPayment,
  fmtMoney,
  type PaymentMethod,
  type RegisterMembershipPaymentInput,
  type RegisterMembershipPaymentResponse,
} from "@/hooks/useBilling";
import { useGymChargeSettings } from "@/hooks/useGymChargeSettings";
import { useSyncStatus, levelOf } from "@/hooks/useSyncStatus";
import type { Member, MembershipSummary } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { fmtDate, parseDate, todayIso } from "@/lib/dates";
import { printPdf } from "@/lib/tauri-bridge";
import { api } from "@/lib/api";
import { billing as t } from "@/strings/billing";
import { members as mt } from "@/strings/members";

interface Props {
  member: Pick<Member, "id" | "full_name" | "phone" | "enrollment_paid" | "last_maintenance_paid">;
  currentMembership: MembershipSummary | null | undefined;
  open: boolean;
  onOpenChange(open: boolean): void;
}

// Días mínimos entre cobros de mantenimiento para cada frecuencia. Espeja
// maintenanceThresholdDays() del backend (UC-018). 0 = siempre cobrar
// (mensual coincide con el ciclo del plan); null = frecuencia desconocida
// o sin frequency configurada, nunca cobrar.
const FREQ_THRESHOLD_DAYS: Record<MaintenanceFrequency, number> = {
  monthly: 0,
  bimonthly: 60,
  quarterly: 90,
  semiannual: 180,
  annual: 365,
};

// FREQ_LABEL espeja t.types.freq* — usar el mismo string para que el
// operador vea la misma palabra en la página de Membresías y en este
// modal.
const FREQ_LABEL: Record<MaintenanceFrequency, string> = {
  monthly: mt.types.freqMonthly,
  bimonthly: mt.types.freqBimonthly,
  quarterly: mt.types.freqQuarterly,
  semiannual: mt.types.freqSemiannual,
  annual: mt.types.freqAnnual,
};

// maintenanceDue decide si toca cobrar mantenimiento hoy basado en la
// frecuencia efectiva (del plan o del gym como fallback) + última fecha
// de cobro de mantenimiento. Es la función "auto" que default-toggles
// el checkbox; el operador puede override manualmente.
function maintenanceDue(
  frequency: MaintenanceFrequency | undefined,
  lastPaid: string | null | undefined,
  effectiveAmount: number,
  paymentDate: string,
): boolean {
  if (!frequency || effectiveAmount <= 0) return false;
  const threshold = FREQ_THRESHOLD_DAYS[frequency];
  if (threshold === undefined) return false;
  if (threshold === 0) return true; // monthly
  if (!lastPaid) return true;
  const last = parseDate(lastPaid);
  const pay = parseDate(paymentDate);
  if (!last || !pay) return true;
  const diff = (pay.getTime() - last.getTime()) / (1000 * 60 * 60 * 24);
  return diff >= threshold;
}

// effectiveFee: misma lógica que MemberForm.calcTotal — el snapshot del
// plan tiene prioridad cuando es > 0, caso contrario cae al default a
// nivel gym (charge_settings).
function effectiveFee(planFee: number | undefined, gymDefault: number): number {
  if (planFee && planFee > 0) return planFee;
  return gymDefault;
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
  // Gym-level toggles + montos default ("¿el gym cobra inscripción /
  // mantenimiento, y por cuánto?"). Fuente de verdad
  // gyms.charge_settings — mismo hook que MemberForm para que la
  // experiencia sea consistente entre el flujo de alta y el de cobro.
  const chargeSettings = useGymChargeSettings();
  const gym = useMemo(
    () => ({
      chargesEnrollment: !!chargeSettings.data?.charges_enrollment,
      chargesMaintenance: !!chargeSettings.data?.charges_maintenance,
      defaultEnrollment: chargeSettings.data?.enrollment_amount ?? 0,
      defaultMaintenance: chargeSettings.data?.maintenance_amount ?? 0,
      // El gym puede configurar la frecuencia de mantenimiento a nivel
      // global; los planes que no la traigan caen a este valor por
      // default (mismo patrón que enrollment_amount / maintenance_amount).
      defaultFrequency:
        (chargeSettings.data?.maintenance_frequency as MaintenanceFrequency | undefined) || undefined,
    }),
    [chargeSettings.data],
  );

  const [typeId, setTypeId] = useState<string>(currentMembership?.membership_type_id || "");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [paymentDate, setPaymentDate] = useState<string>(todayIso());
  const [notes, setNotes] = useState("");
  const [discountOpen, setDiscountOpen] = useState(false);
  const [discountAmount, setDiscountAmount] = useState("");
  const [discountReason, setDiscountReason] = useState("");
  const [partialOpen, setPartialOpen] = useState(false);
  const [partialAmount, setPartialAmount] = useState("");
  // Operator override de los cobros extra. null = "no se ha tocado, usa
  // la decisión automática"; true/false = decisión explícita del
  // operador. Reset al abrir el modal.
  const [chargeEnrollment, setChargeEnrollment] = useState<boolean | null>(null);
  const [chargeMaintenance, setChargeMaintenance] = useState<boolean | null>(null);
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
      setChargeEnrollment(null);
      setChargeMaintenance(null);
      setError(null);
      setSuccess(null);
      setWhatsappState("idle");
    }
  }, [open, currentMembership?.membership_type_id]);

  const selectedType = useMemo(
    () => types.data?.find((tp) => tp.id === typeId) || null,
    [types.data, typeId]
  );

  // Montos efectivos: plan-fee si > 0, sino default del gym. Vacíos cuando
  // el gym no cobra esa cuota (charges_* = false).
  const enrollmentAmount = useMemo(() => {
    if (!selectedType || !gym.chargesEnrollment) return 0;
    return effectiveFee(selectedType.enrollment_fee, gym.defaultEnrollment);
  }, [selectedType, gym]);

  const maintenanceAmount = useMemo(() => {
    if (!selectedType || !gym.chargesMaintenance) return 0;
    return effectiveFee(selectedType.maintenance_fee, gym.defaultMaintenance);
  }, [selectedType, gym]);

  // Frecuencia efectiva: plan-snapshot tiene prioridad; si el plan no
  // la tiene (plan viejo + gym prendió el toggle después), cae al
  // default del gym (charge_settings.maintenance_frequency). Sin
  // ninguna, no se cobra mantenimiento (el toggle ni siquiera aparece).
  const maintenanceFrequency: MaintenanceFrequency | undefined =
    selectedType?.maintenance_frequency || gym.defaultFrequency;

  // Auto-toggles: "¿qué deberíamos cobrar HOY por default?" Mismo
  // criterio que el BE (UC-018):
  //   * Enrollment: socio no ha pagado inscripción Y monto > 0.
  //   * Maintenance: pasó el threshold de la frecuencia (o no hay
  //     last_maintenance_paid) Y monto > 0.
  const autoEnrollment = !member.enrollment_paid && enrollmentAmount > 0;
  const autoMaintenance = maintenanceDue(
    maintenanceFrequency,
    member.last_maintenance_paid,
    maintenanceAmount,
    paymentDate,
  );

  // Decisión final tras posible override del operador.
  const willChargeEnrollment =
    enrollmentAmount > 0 && (chargeEnrollment ?? autoEnrollment);
  const willChargeMaintenance =
    maintenanceAmount > 0 && (chargeMaintenance ?? autoMaintenance);

  // Warnings inline: sólo cuando el operador FORZÓ un cobro que el
  // sistema no recomendaba (override manual sobre auto-decisión false).
  // No bloquea — sólo educa.
  const warnEnrollmentForced = willChargeEnrollment && !autoEnrollment;
  const warnMaintenanceForced = willChargeMaintenance && !autoMaintenance;
  // Fecha en la que SÍ tocaría el próximo cobro de mantenimiento.
  // Sólo útil cuando hay last_maintenance_paid + frecuencia conocida.
  const nextMaintenanceDue = useMemo(() => {
    if (!maintenanceFrequency || !member.last_maintenance_paid) return null;
    const last = parseDate(member.last_maintenance_paid);
    if (!last) return null;
    const threshold = FREQ_THRESHOLD_DAYS[maintenanceFrequency];
    if (threshold <= 0) return null;
    return fmtDate(addDays(last, threshold));
  }, [maintenanceFrequency, member.last_maintenance_paid]);

  const breakdown = useMemo(() => {
    if (!selectedType) return null;
    const base = selectedType.price;
    const enrollment = willChargeEnrollment ? enrollmentAmount : 0;
    const maint = willChargeMaintenance ? maintenanceAmount : 0;
    const subtotal = base + enrollment + maint;
    return { base, enrollment, maint, subtotal };
  }, [selectedType, willChargeEnrollment, willChargeMaintenance, enrollmentAmount, maintenanceAmount]);

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
      // Forzar la decisión del operador (override de la auto-decisión
      // del BE). Si el monto efectivo es 0 el flag se ignora server-
      // side, pero igual lo mandamos para que el wire refleje la
      // intención.
      charge_enrollment: willChargeEnrollment,
      charge_maintenance: willChargeMaintenance,
      ...(willChargeEnrollment ? { enrollment_amount: enrollmentAmount } : {}),
      ...(willChargeMaintenance ? { maintenance_amount: maintenanceAmount } : {}),
      ...(discountOpen
        ? { discount_amount: discountValue, discount_reason: discountReason.trim() }
        : {}),
      ...(partialOpen && partialValue !== null ? { partial_amount: partialValue } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
    };

    try {
      const res = await register.mutateAsync(payload);
      setSuccess(res);
      const expiryFmt = fmtDate(res.new_expiry);
      const amountFmt = fmtMoney(res.paid);
      if (res.pending_offline_sync || offline) {
        toast.success(t.payment.success.offline);
      } else {
        toast.success(t.payment.success.online(amountFmt, member.full_name, expiryFmt));
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
      const res = await api.blob(`/api/v1/payments/${success.payment_id}/receipt.pdf`);
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
      await api.post(`/api/v1/payments/${success.payment_id}/send-receipt`, {
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
                {fmtMoney(success.paid)} cobrados. Vence {fmtDate(success.new_expiry)}.
                {success.balance_pending > 0 && (
                  <> Saldo pendiente: {fmtMoney(success.balance_pending)}.</>
                )}
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

            {/* Toggles de cobros extra. Sólo aparecen cuando el gym
                cobra ese concepto Y el plan/gym resolvió un monto > 0;
                de lo contrario, no hay nada que toggle-ear. El operador
                puede deseleccionar el default ("promo sin inscripción
                este mes") o forzarlo. */}
            {selectedType && (enrollmentAmount > 0 || maintenanceAmount > 0) && (
              <div className="space-y-1.5 rounded-md border bg-muted/20 p-3">
                {enrollmentAmount > 0 && (
                  <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                    <span className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={willChargeEnrollment}
                        onCheckedChange={(v) => setChargeEnrollment(v === true)}
                      />
                      <span className={willChargeEnrollment ? "" : "text-muted-foreground line-through"}>
                        {t.payment.breakdown.enrollment}
                      </span>
                      {member.enrollment_paid && (
                        <span className="text-xs text-muted-foreground">(ya pagada)</span>
                      )}
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtMoney(enrollmentAmount)}
                    </span>
                  </label>
                )}
                {maintenanceAmount > 0 && maintenanceFrequency && (
                  <label className="flex items-center justify-between gap-3 text-sm cursor-pointer">
                    <span className="flex items-center gap-2 min-w-0">
                      <Checkbox
                        checked={willChargeMaintenance}
                        onCheckedChange={(v) => setChargeMaintenance(v === true)}
                      />
                      <span className={willChargeMaintenance ? "" : "text-muted-foreground line-through"}>
                        {t.payment.breakdown.maintenance}
                      </span>
                      <span className="text-xs text-muted-foreground">
                        ({FREQ_LABEL[maintenanceFrequency]})
                      </span>
                    </span>
                    <span className="tabular-nums text-muted-foreground">
                      {fmtMoney(maintenanceAmount)}
                    </span>
                  </label>
                )}
                {/* Warnings inline: educar al operador cuando fuerza un
                    cobro que el sistema no recomendaba. Estilo "soft
                    warning" (no destructive) — informa sin bloquear. */}
                {(warnEnrollmentForced || warnMaintenanceForced) && (
                  <div className="mt-2 space-y-1 rounded border border-warning/30 bg-warning/5 px-2.5 py-1.5 text-xs text-warning">
                    {warnEnrollmentForced && (
                      <p>{t.payment.warn.enrollmentAlreadyPaid}</p>
                    )}
                    {warnMaintenanceForced && nextMaintenanceDue && (
                      <p>{t.payment.warn.maintenanceNotDue(nextMaintenanceDue)}</p>
                    )}
                  </div>
                )}
              </div>
            )}

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
