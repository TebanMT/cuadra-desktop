import { ChargeSettingsStatus } from "@/components/billing/ChargeSettingsStatus";
import { chargeSettingsReady, CHARGE_SETTINGS_REQUIRED } from "@/lib/chargeSettingsReadiness";
import { validateDateFields } from "@/lib/date-input";
import { DateInput } from "@/components/ui/date-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Tag, X, Plus, Minus } from "lucide-react";
import { addDays, max as dateMax } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import type { Promotion } from "@/hooks/usePromotions";
import {
  promotions as pt,
  formatPromotionValue,
} from "@/strings/promotions";
import { PromotionPickerModal } from "./PromotionPickerModal";
import { CompanionSelectorModal } from "./CompanionSelectorModal";
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
import type { AccessStatus, Member, MembershipSummary } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { addMonthsClamped, fmtDate, parseDate, todayIso } from "@/lib/dates";
import { billing as t } from "@/strings/billing";
import { members as mt } from "@/strings/members";
import { CashDrawerField } from "@/components/cash/CashDrawerField";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePermission } from "@/lib/permissions";
import { keyForPayload } from "@/lib/idempotency";
import { RestrictedNote } from "@/components/shared/RestrictedNote";
import { VigenciaBadge } from "@/components/members/VigenciaBadge";
import { vigenciaFrom } from "@/lib/vigencia";
import { cn } from "@/lib/utils";

interface Props {
  member: Pick<Member, "id" | "full_name" | "phone" | "enrollment_paid" | "last_maintenance_paid">;
  currentMembership: MembershipSummary | null | undefined;
  /** Decisión de acceso del backend (detalle del socio). Sin ella, la
   *  vigencia actual se infiere de la membresía. */
  accessStatus?: AccessStatus;
  open: boolean;
  onOpenChange(open: boolean): void;
  onPaid?(receipt: RegisterMembershipPaymentResponse): void;
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
  durationDays: number,
  durationMonths?: number | null
): string | null {
  const payDate = parseDate(paymentDateIso);
  if (!payDate) return null;
  const cur = currentExpiry ? parseDate(currentExpiry) : null;
  const base = cur && cur >= payDate ? cur : payDate;
  const from = dateMax([base, payDate]);
  // Espeja computeExpiry del dominio: meses de calendario cuando el plan
  // los declara (con clamp de fin de mes), días corridos si no.
  if (durationMonths && durationMonths > 0) {
    return fmtDate(addMonthsClamped(from, durationMonths));
  }
  return fmtDate(addDays(from, durationDays));
}

export function PaymentModal({ member, currentMembership, accessStatus, open, onOpenChange, onPaid }: Props) {
  const readOnly = useAuthStore(s => s.readOnly);
  // Per-operator permissions: a discount or a backdated payment needs
  // "discounts"; charging less than the total needs "credit".
  const canDiscount = usePermission("discounts");
  const canCredit = usePermission("credit");
  const [cashReady, setCashReady] = useState(false);
  const types = useMembershipTypes();
  const register = useRegisterMembershipPayment();
  const sync = useSyncStatus(open);
  // Gym-level toggles + montos default ("¿el gym cobra inscripción /
  // mantenimiento, y por cuánto?"). Fuente de verdad
  // gyms.charge_settings — mismo hook que MemberForm para que la
  // experiencia sea consistente entre el flujo de alta y el de cobro.
  const chargeSettings = useGymChargeSettings();
  const feesReady = chargeSettingsReady(chargeSettings.data);
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
  const [cashDrawerId, setCashDrawerId] = useState<string>();
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
  // Promo state: el operador puede elegir una promo de la lista vigente
  // o por código (PromotionPickerModal). Si la promo es
  // companion_memberships, abre CompanionSelectorModal en cascada para
  // recolectar los IDs de socios destinatarios.
  const [promo, setPromo] = useState<Promotion | null>(null);
  const [companionIDs, setCompanionIDs] = useState<string[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [companionOpen, setCompanionOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const completed = useRef(false);
  const sending = useRef(false);
  const opened = useRef(false);
  const paymentAttempt = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (open && !opened.current) {
      completed.current = false;
      setTypeId(currentMembership?.membership_type_id || "");
      setMethod("cash");
      setCashDrawerId(undefined);
      setPaymentDate(todayIso());
      setNotes("");
      setDiscountOpen(false);
      setDiscountAmount("");
      setDiscountReason("");
      setPartialOpen(false);
      setPartialAmount("");
      setChargeEnrollment(null);
      setChargeMaintenance(null);
      setPromo(null);
      setCompanionIDs([]);
      setPickerOpen(false);
      setCompanionOpen(false);
      setError(null);

      paymentAttempt.current = null;
    }
    opened.current = open;
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

  // Without "discounts" a due fee can't be skipped (the backend answers
  // 403); forcing a fee that isn't due is still fine.
  const lockEnrollment = !canDiscount && autoEnrollment;
  const lockMaintenance = !canDiscount && autoMaintenance;

  // Decisión final tras posible override del operador.
  const willChargeEnrollment =
    enrollmentAmount > 0 && (lockEnrollment || (chargeEnrollment ?? autoEnrollment));
  const willChargeMaintenance =
    maintenanceAmount > 0 && (lockMaintenance || (chargeMaintenance ?? autoMaintenance));

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
    if (!discountOpen || !canDiscount) return 0;
    const v = parseFloat(discountAmount);
    return Number.isFinite(v) && v > 0 ? v : 0;
  }, [discountOpen, discountAmount, canDiscount]);

  // Promo preview client-side. Espeja Calculate() del BE (calculator.go).
  // El BE recalcula auth y rebota cualquier discrepancia (la promo puede
  // estar expirada o sobre-límite). Para los kinds no-descuento (extra_days,
  // companion_memberships, free_enrollment no-aplicable) el discount es 0.
  const promoDiscount = useMemo(() => {
    if (!promo || !breakdown) return 0;
    switch (promo.kind) {
      case "percent":
        if (promo.value == null) return 0;
        return Math.min(breakdown.subtotal, breakdown.subtotal * (promo.value / 100));
      case "fixed_amount":
        if (promo.value == null) return 0;
        return Math.min(breakdown.subtotal, promo.value);
      case "free_enrollment":
        if (!willChargeEnrollment) return 0;
        return Math.min(breakdown.subtotal, enrollmentAmount);
      case "extra_days":
      case "companion_memberships":
        return 0;
    }
  }, [promo, breakdown, willChargeEnrollment, enrollmentAmount]);

  const total = useMemo(() => {
    if (!breakdown) return 0;
    return Math.max(0, breakdown.subtotal - discountValue - promoDiscount);
  }, [breakdown, discountValue, promoDiscount]);

  const partialValue = useMemo(() => {
    if (!partialOpen || !canCredit) return null;
    const v = parseFloat(partialAmount);
    return Number.isFinite(v) && v > 0 ? v : null;
  }, [partialOpen, partialAmount, canCredit]);

  const amountToCharge = partialValue ?? total;
  const pendingBalance = partialValue !== null ? Math.max(0, total - partialValue) : 0;

  const newExpiry = useMemo(
    () =>
      selectedType
        ? previewNewExpiry(
            paymentDate,
            currentMembership?.expiry_date,
            selectedType.duration_days,
            selectedType.duration_months,
          )
        : null,
    [selectedType, paymentDate, currentMembership?.expiry_date]
  );

  // Vigencia antes del cobro, con la misma insignia de búsqueda, lista y
  // ficha; el pie muestra la nueva. Sin access_status se deriva de la
  // membresía (pending_payment = sin primer pago), nunca de su status crudo.
  const currentVigencia = useMemo(() => {
    if (!currentMembership) return accessStatus ? vigenciaFrom({ accessStatus }) : null;
    const status = accessStatus ?? (currentMembership.status === "pending_payment" ? "denied_unpaid_enrollment" : undefined);
    return vigenciaFrom({ accessStatus: status, expiryDate: currentMembership.expiry_date ?? null });
  }, [accessStatus, currentMembership]);

  // Desglose sólo cuando el total tiene más de una pieza: con el puro plan,
  // el importe ya vive en el pie y en el botón.
  const hasBreakdown =
    enrollmentAmount > 0 ||
    (maintenanceAmount > 0 && !!maintenanceFrequency) ||
    discountValue > 0 ||
    promoDiscount > 0;

  const offline = levelOf(sync.data) !== "ok";

  function validate(): string | null {
    if (!feesReady) return CHARGE_SETTINGS_REQUIRED;
    if (method === "cash" && !cashReady) return "Espera a confirmar la caja o reintenta su consulta.";
    if (!selectedType) return t.payment.errors.amountInvalid;
    if (!method) return t.payment.errors.methodRequired;
    if (total <= 0) return t.payment.errors.amountInvalid;
    if (discountOpen && canDiscount && promo) {
      // Mismo gate que el BE: stacking manual+promo prohibido.
      return "No puedes combinar descuento manual con promoción.";
    }
    if (discountOpen && canDiscount) {
      if (discountValue <= 0 || !breakdown || discountValue > breakdown.subtotal) {
        return t.payment.errors.discountInvalid;
      }
      if (!discountReason.trim()) return t.payment.errors.discountReasonRequired;
    }
    if (partialOpen && canCredit) {
      if (partialValue === null || partialValue <= 0 || partialValue > total) {
        return t.payment.errors.partialInvalid;
      }
    }
    if (promo && promo.kind === "companion_memberships") {
      const want = promo.companion_count ?? 0;
      if (companionIDs.length !== want) {
        return "Elige los socios destinatarios antes de cobrar.";
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

    const paymentWithoutKey = {
      member_id: member.id,
      membership_type_id: selectedType.id,
      payment_method: method,
      ...(method === "cash" && cashDrawerId ? { cash_drawer_id: cashDrawerId } : {}),
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
      ...(discountOpen && canDiscount
        ? { discount_amount: discountValue, discount_reason: discountReason.trim() }
        : {}),
      ...(partialOpen && partialValue !== null ? { partial_amount: partialValue } : {}),
      ...(notes.trim() ? { notes: notes.trim() } : {}),
      ...(promo
        ? {
            promotion: {
              promotion_id: promo.id,
              ...(companionIDs.length > 0 ? { companion_member_ids: companionIDs } : {}),
            },
          }
        : {}),
    };
    paymentAttempt.current = keyForPayload(paymentAttempt.current, paymentWithoutKey);
    const payload: RegisterMembershipPaymentInput = {
      ...paymentWithoutKey,
      idempotency_key: paymentAttempt.current.key,
    };

    sending.current = true;
    try {
      const res = await register.mutateAsync(payload);
      completed.current = true;
      onOpenChange(false);
      onPaid?.(res);
      const expiryFmt = fmtDate(res.new_expiry);
      const amountFmt = fmtMoney(res.paid);
      if (res.pending_offline_sync || offline) {
        toast.success(t.payment.success.offline);
      } else {
        toast.success(t.payment.success.online(amountFmt, member.full_name, expiryFmt));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || t.payment.errors.generic);
      } else {
        setError(t.payment.errors.generic);
      }
    } finally { sending.current = false; }
  }

  return (
    <Dialog open={open} busy={register.isPending} onOpenChange={value => { if (!sending.current) onOpenChange(value); }}>
      <DialogContent className="flex max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 space-y-2 border-b px-6 py-5">
          <DialogTitle>{t.payment.title(member.full_name)}</DialogTitle>
          {currentVigencia && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
              <span>Vigencia actual</span>
              <VigenciaBadge vigencia={currentVigencia} size="sm" />
            </div>
          )}
          <DialogDescription className="sr-only">Revisa el importe, el método de pago y la nueva vigencia antes de confirmar el cobro.</DialogDescription>
        </DialogHeader>

          <form onSubmitCapture={validateDateFields} onSubmit={handleSubmit} className="flex min-h-0 flex-col" noValidate>
            <div className="min-h-0 space-y-4 overflow-y-auto px-6 py-4">
            {offline && (
              <Alert>
                <AlertDescription>{t.payment.offline}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="pm-type">{t.payment.membership}</Label>
              <Select value={typeId} onValueChange={setTypeId} disabled={types.isLoading}>
                <SelectTrigger id="pm-type">
                  {/* El precio vive en las opciones; el importe a cobrar, en el pie. */}
                  <SelectValue placeholder="Selecciona…">{selectedType?.name}</SelectValue>
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

            {/* Desglose: plan + cobros extra (con su casilla) + descuentos.
                Los extras sólo aparecen cuando el gym cobra ese concepto Y
                el plan/gym resolvió un monto > 0. El operador puede quitar
                el default ("promo sin inscripción este mes") o forzarlo. Sin
                fila de total: el total vive en el pie fijo. */}
            {selectedType && hasBreakdown && (
              <div className="space-y-2">
                <p id="pm-breakdown-label" className="text-sm font-medium">Desglose</p>
                <ul aria-labelledby="pm-breakdown-label" className="divide-y rounded-md border text-sm">
                  <li className="flex min-h-11 items-center justify-between gap-3 px-3">
                    <span className="min-w-0 truncate">{t.payment.membership} {selectedType.name}</span>
                    <span className="tabular">{fmtMoney(selectedType.price)}</span>
                  </li>
                  {enrollmentAmount > 0 && (
                    <li>
                      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <Checkbox
                            checked={willChargeEnrollment}
                            disabled={lockEnrollment}
                            onCheckedChange={(v) => setChargeEnrollment(v === true)}
                          />
                          <span className={willChargeEnrollment ? "" : "text-muted-foreground line-through"}>
                            {t.payment.breakdown.enrollment}
                          </span>
                          {member.enrollment_paid && (
                            <span className="text-xs text-muted-foreground">(ya pagada)</span>
                          )}
                        </span>
                        <span className={cn("tabular", !willChargeEnrollment && "text-muted-foreground line-through")}>
                          {fmtMoney(enrollmentAmount)}
                        </span>
                      </label>
                    </li>
                  )}
                  {maintenanceAmount > 0 && maintenanceFrequency && (
                    <li>
                      <label className="flex min-h-11 cursor-pointer items-center justify-between gap-3 px-3">
                        <span className="flex min-w-0 items-center gap-2">
                          <Checkbox
                            checked={willChargeMaintenance}
                            disabled={lockMaintenance}
                            onCheckedChange={(v) => setChargeMaintenance(v === true)}
                          />
                          <span className={willChargeMaintenance ? "" : "text-muted-foreground line-through"}>
                            {t.payment.breakdown.maintenance}
                          </span>
                          <span className="text-xs text-muted-foreground">
                            ({FREQ_LABEL[maintenanceFrequency]})
                          </span>
                        </span>
                        <span className={cn("tabular", !willChargeMaintenance && "text-muted-foreground line-through")}>
                          {fmtMoney(maintenanceAmount)}
                        </span>
                      </label>
                    </li>
                  )}
                  {discountValue > 0 && (
                    <li className="flex min-h-11 items-center justify-between gap-3 px-3 text-success-text">
                      <span>{t.payment.breakdown.discount}</span>
                      <span className="tabular">−{fmtMoney(discountValue)}</span>
                    </li>
                  )}
                  {promoDiscount > 0 && promo && (
                    <li className="flex min-h-11 items-center justify-between gap-3 px-3 text-success-text">
                      <span className="min-w-0 truncate">Promoción · {promo.name}</span>
                      <span className="tabular">−{fmtMoney(promoDiscount)}</span>
                    </li>
                  )}
                </ul>
                {(lockEnrollment || lockMaintenance) && (
                  <RestrictedNote permission="discounts">
                    {lockEnrollment && lockMaintenance
                      ? "No puedes quitar la inscripción ni el mantenimiento."
                      : lockEnrollment
                        ? "No puedes quitar la inscripción."
                        : "No puedes quitar el mantenimiento."}
                  </RestrictedNote>
                )}
                {/* Avisos: educar al operador cuando fuerza un cobro que el
                    sistema no recomendaba. Informa sin bloquear. */}
                {(warnEnrollmentForced || warnMaintenanceForced) && (
                  <div className="flex items-start gap-2 rounded-md bg-warning-soft px-3 py-2 text-xs text-warning-foreground">
                    <AlertTriangle aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                    <div className="space-y-1">
                      {warnEnrollmentForced && (
                        <p>{t.payment.warn.enrollmentAlreadyPaid}</p>
                      )}
                      {warnMaintenanceForced && nextMaintenanceDue && (
                        <p>{t.payment.warn.maintenanceNotDue(nextMaintenanceDue)}</p>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            <div className="space-y-2">
              <Label id="pm-method-label">{t.payment.method}</Label>
              <RadioGroup
                aria-labelledby="pm-method-label"
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
                className="flex flex-wrap gap-4"
              >
                <label className="flex min-h-11 items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="cash" id="pm-m-cash" />
                  <span>{t.payment.methods.cash}</span>
                </label>
                <label className="flex min-h-11 items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="transfer" id="pm-m-tr" />
                  <span>{t.payment.methods.transfer}</span>
                </label>
                <label className="flex min-h-11 items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="card" id="pm-m-card" />
                  <span>{t.payment.methods.card}</span>
                </label>
              </RadioGroup>
            </div>

            {method === "cash" && (
              <CashDrawerField onReadyChange={setCashReady}
                value={cashDrawerId}
                onChange={setCashDrawerId}
                date={paymentDate}
                id="membership-cash-drawer"
              />
            )}

            <details className="rounded-md border p-3">
              <summary className="min-h-11 cursor-pointer py-3 font-medium">Promoción, descuento o pago parcial</summary>
              <div className="space-y-3 pt-2">
            {/* Promoción — sección entre subtotal y total (UC del prompt).
                Sin promo: botón "Aplicar promoción" → abre Picker. Con
                promo: card resumen con badge + botón Quitar. Para
                companion_memberships, badge adicional con la cantidad de
                socios elegidos + botón para re-elegir si los slots están
                vacíos. */}
            {/* Sin promoción no hay caja: el botón ya vive dentro del <details>
                con borde y una segunda caja se leía como tarjeta anidada. */}
            <div className={promo ? "rounded-md border bg-card p-3" : undefined}>
              {!promo ? (
                <Button requiresWrite
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full"
                  onClick={() => setPickerOpen(true)}
                  disabled={discountOpen}
                  title={discountOpen ? "Quita el descuento manual primero" : undefined}
                >
                  <Tag className="h-4 w-4 mr-2" />
                  Aplicar promoción
                </Button>
              ) : (
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <Tag className="h-4 w-4 text-primary" />
                        <span className="font-medium text-sm">{promo.name}</span>
                        <Badge variant="secondary" className="text-xs">
                          {formatPromotionValue(promo.kind, promo.value, promo.companion_count)}
                        </Badge>
                      </div>
                      {promo.kind === "extra_days" && promo.value != null && (
                        <div className="text-xs text-success-text mt-1">
                          {pt.picker.extraDaysPreview(promo.value)}
                        </div>
                      )}
                      {promo.kind === "companion_memberships" && (
                        <div className="text-xs text-success-text mt-1">
                          {pt.picker.companionPreview(promo.companion_count ?? 0)} ·
                          {" "}
                          {companionIDs.length === (promo.companion_count ?? 0)
                            ? `${companionIDs.length} ya elegidos`
                            : `Faltan ${(promo.companion_count ?? 0) - companionIDs.length}`}
                        </div>
                      )}
                    </div>
                    <Button
                      type="button"
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        setPromo(null);
                        setCompanionIDs([]);
                      }}
                      title={pt.picker.remove}
                      aria-label={pt.picker.remove}
                    >
                      <X aria-hidden="true" className="h-4 w-4" />
                    </Button>
                  </div>
                  {promo.kind === "companion_memberships" && (
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => setCompanionOpen(true)}
                    >
                      {companionIDs.length > 0 ? "Cambiar socios" : "Elegir socios"}
                    </Button>
                  )}
                </div>
              )}
            </div>

            <PromotionPickerModal
              open={pickerOpen}
              onOpenChange={setPickerOpen}
              target="membership"
              onApply={(p) => {
                setPromo(p);
                setCompanionIDs([]);
                if (p.kind === "companion_memberships") {
                  setCompanionOpen(true);
                }
              }}
            />
            <CompanionSelectorModal
              open={companionOpen}
              onOpenChange={setCompanionOpen}
              companionCount={promo?.companion_count ?? 0}
              excludeMemberID={member.id}
              onConfirm={(ids) => setCompanionIDs(ids)}
            />

            <div className="space-y-3">
              {canDiscount && <button
                type="button"
                className="inline-flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                aria-expanded={discountOpen}
                onClick={() => setDiscountOpen((v) => !v)}
              >
                {discountOpen ? <Minus aria-hidden className="h-4 w-4" /> : <Plus aria-hidden className="h-4 w-4" />}
                {discountOpen ? t.payment.removeDiscount : t.payment.addDiscount}
              </button>}
              {canDiscount && discountOpen && (
                <div className="grid grid-cols-2 gap-2 border-l border-border pl-3">
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

              {canCredit && <button
                type="button"
                className="flex min-h-11 items-center gap-1.5 text-sm font-medium text-primary hover:underline"
                aria-expanded={partialOpen}
                onClick={() => setPartialOpen((v) => !v)}
              >
                {partialOpen ? <Minus aria-hidden className="h-4 w-4" /> : <Plus aria-hidden className="h-4 w-4" />}
                {partialOpen ? t.payment.removePartial : t.payment.addPartial}
              </button>}
              {!canDiscount && (
                <RestrictedNote permission="discounts">No puedes aplicar descuentos.</RestrictedNote>
              )}
              {!canCredit && (
                <RestrictedNote permission="credit">No puedes cobrar a medias.</RestrictedNote>
              )}
              {canCredit && partialOpen && (
                <div className="space-y-1 border-l border-border pl-3">
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
                </div>
              )}
            </div>

              </div>
            </details>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="pm-date">{t.payment.date}</Label>
                <DateInput
                  id="pm-date"
                  context="recent"
                  value={paymentDate}
                  disabled={!canDiscount}
                  onValueChange={(e) => setPaymentDate(e)}
                />
                {!canDiscount && (
                  <RestrictedNote permission="discounts">Se cobra con fecha de hoy.</RestrictedNote>
                )}
              </div>
              <div className="space-y-1">
                <Label htmlFor="pm-notes">{t.payment.notes}</Label>
                <Input
                  id="pm-notes"
                  value={notes}
                  placeholder="Comentario interno"
                  aria-describedby="pm-notes-hint"
                  onChange={(e) => setNotes(e.target.value)}
                />
                <p id="pm-notes-hint" className="text-xs text-muted-foreground">No aparece en el comprobante.</p>
              </div>
            </div>

            </div>
            <div className="shrink-0 space-y-3 border-t bg-background px-6 py-4">
            <ChargeSettingsStatus query={chargeSettings} />
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
              {/* Único lugar protagonista del importe (además del botón). */}
              <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-2" aria-live="polite">
                <div>
                  <p className="text-sm text-muted-foreground">{partialValue !== null ? "Abono de hoy" : t.payment.total} · {t.payment.methods[method]}</p>
                  {feesReady && selectedType
                    ? <p className="font-display text-3xl leading-tight tabular text-foreground">{fmtMoney(amountToCharge)}</p>
                    : <p className="text-base font-medium text-muted-foreground">{!feesReady ? "Total por confirmar" : "Elige una membresía"}</p>}
                </div>
                <div className="text-right text-sm">{newExpiry && <p>{t.payment.newExpiry(newExpiry)}</p>}{pendingBalance > 0 && <p className="text-warning">Saldo pendiente: <span className="tabular">{fmtMoney(pendingBalance)}</span></p>}</div>
              </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={register.isPending}
              >
                {t.payment.cancel}
              </Button>
              <Button requiresWrite size="lg" type="submit" disabled={!feesReady || (method === "cash") && !cashReady || readOnly || register.isPending || !selectedType || total <= 0}>
                {register.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {feesReady && selectedType ? t.payment.submit(fmtMoney(amountToCharge)) : "Cobrar"}
              </Button>
            </div>
            </div>
          </form>
      </DialogContent>
    </Dialog>
  );
}
