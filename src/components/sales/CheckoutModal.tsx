import { useEffect, useRef, useState } from "react";
import { Banknote, CreditCard, Handshake, Loader2, Smartphone } from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fmtMoney, type PaymentMethod } from "@/hooks/useBilling";
import { useSetupStatus } from "@/hooks/useSetupStatus";
import type { MemberSearchResult } from "@/hooks/useSales";
import { MemberAssociator } from "@/components/sales/MemberAssociator";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sales as t } from "@/strings/sales";
import { CashDrawerField } from "@/components/cash/CashDrawerField";
import { todayIso } from "@/lib/dates";
import { moneyCents } from "./saleDraft";

export type CheckoutInput = { method: PaymentMethod; paid?: number; cash_drawer_id?: string; received?: number };
type CheckoutMode = PaymentMethod | "fiado";
const methods = [
  { key: "cash", label: "Efectivo", icon: Banknote },
  { key: "card", label: "Tarjeta", icon: CreditCard },
  { key: "transfer", label: "Transferencia", icon: Smartphone },
] as const;
interface Props {
  open: boolean; onOpenChange(open: boolean): void; total: number; itemCount: number;
  member: MemberSearchResult | null; onMemberChange(m: MemberSearchResult | null): void;
  memberDebt: number; debtStatus?: "loading" | "error" | "ready"; onRetryDebt?(): void;
  onSettle(): void; submitting: boolean; blockedReason?: string;
  onConfirm(input: CheckoutInput): Promise<void>;
}

export function CheckoutModal({ open, onOpenChange, total, itemCount, member, onMemberChange,
  memberDebt, debtStatus = "ready", onRetryDebt, onSettle, submitting, blockedReason, onConfirm }: Props) {
  const setup = useSetupStatus();
  const configured = methods.filter(m => setup.data?.payment_methods?.[m.key]);
  // Older gyms can have completed setup with no saved methods. Preserve their
  // existing checkout options; a loading/failed request is not an empty config.
  const available = setup.data && configured.length === 0 ? methods : configured;
  const firstMethod = available[0]?.key ?? "cash";
  const [selectedMode, setMode] = useState<CheckoutMode | null>(null);
  const mode: CheckoutMode = selectedMode === "fiado" ? "fiado"
    : available.find(m => m.key === selectedMode)?.key ?? firstMethod;
  const [given, setGiven] = useState("");
  const [paidValue, setPaidValue] = useState("");
  const [selectedAbonoMethod, setAbonoMethod] = useState<PaymentMethod | null>(null);
  const abonoMethod = available.find(m => m.key === selectedAbonoMethod)?.key ?? firstMethod;
  const [drawer, setDrawer] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const sending = useRef(false);
  useEffect(() => {
    if (open) { setMode(null); setGiven(""); setPaidValue(""); setAbonoMethod(null); setDrawer(undefined); setError(null); }
  }, [open]);
  const credit = mode === "fiado" && total > 0;
  const paid = credit ? (paidValue.trim() === "" ? 0 : Number(paidValue)) : total;
  const validPaid = Number.isFinite(paid) && paid >= 0 && moneyCents(paid) <= moneyCents(total);
  const method = credit ? abonoMethod : mode === "fiado" ? firstMethod : mode;
  const cash = method === "cash" && paid > 0;
  const received = given.trim() === "" ? paid : Number(given);
  const cashInvalid = cash && (!Number.isFinite(received) || moneyCents(received) < moneyCents(paid));
  const methodUnavailable = paid > 0 && !available.some(m => m.key === method);
  const disabled = total <= 0 || submitting || !validPaid || cashInvalid || (credit && !member) || methodUnavailable || !!blockedReason;
  const balance = validPaid ? Math.max(0, moneyCents(total) - moneyCents(paid)) / 100 : total;
  const label = total === 0 ? "Cobrar" : credit && paid === 0 ? "Guardar fiado"
    : t.page.checkout.confirm(fmtMoney(paid));
  async function confirm() {
    if (disabled || sending.current) return;
    sending.current = true; setError(null);
    try {
      await onConfirm({ method: paid === 0 ? "cash" : method,
        ...(credit ? { paid: moneyCents(paid) / 100 } : {}),
        ...(cash ? { received: moneyCents(received) / 100, ...(drawer ? { cash_drawer_id: drawer } : {}) } : {}) });
    } catch (err) { setError(err instanceof ApiError ? err.message : t.page.errors.generic); }
    finally { sending.current = false; }
  }
  function selectMode(next: CheckoutMode) {
    const target = next === "fiado" && mode === "fiado" ? firstMethod : next;
    if (target === mode) return;
    setMode(target); setGiven(""); setError(null);
    if (target !== "fiado") setPaidValue("");
  }
  return <Dialog open={open} onOpenChange={value => !submitting && onOpenChange(value)}>
    <DialogContent aria-describedby={undefined} className="max-w-md max-h-[calc(100dvh-2rem)] flex flex-col gap-0 overflow-hidden p-0"
      onInteractOutside={e => e.preventDefault()} onPointerDownOutside={e => e.preventDefault()}>
      <DialogHeader className="px-5 pt-5 pb-3 shrink-0">
        <DialogTitle>{total === 0 ? "Registrar venta" : t.page.checkout.title}</DialogTitle>
        <div className="flex items-baseline justify-between gap-3 pt-1">
          <span className="text-sm text-muted-foreground">Total · {t.page.checkout.itemsSummary(itemCount)}</span>
          <span className="text-3xl font-bold tabular-nums">{fmtMoney(total)}</span>
        </div>
      </DialogHeader>
      <fieldset disabled={submitting} className="relative min-h-0 overflow-y-auto px-5 pb-4 space-y-4 disabled:opacity-70">
        <div className="flex flex-wrap items-center gap-2">
          <MemberAssociator member={member} onChange={onMemberChange} />
          {member && debtStatus === "loading" && <span className="text-xs text-muted-foreground">Consultando saldo…</span>}
          {member && debtStatus === "error" && <Button type="button" variant="link" size="sm" onClick={onRetryDebt}>Reintentar consulta de saldo</Button>}
          {member && debtStatus === "ready" && memberDebt > 0 && <Button type="button" variant="ghost" size="sm" className="text-amber-700" onClick={onSettle}>{t.page.debt.chip(fmtMoney(memberDebt))}</Button>}
        </div>
        {total > 0 && <div className="grid grid-cols-2 gap-2" aria-label="Forma de pago">
          {[...available, { key: "fiado" as const, label: "Fiado", icon: Handshake }].map(({ key, label: name, icon: Icon }) =>
            <button key={key} type="button" onClick={() => selectMode(key)} aria-pressed={mode === key}
              className={cn("flex items-center gap-2 rounded-lg border-2 px-3 py-2.5 text-sm font-medium focus-visible:ring-2 focus-visible:ring-ring", mode === key ? "border-primary bg-primary/5" : "border-border hover:bg-muted")}>
              <Icon className="h-5 w-5 shrink-0" />{name}
            </button>)}
        </div>}
        {total > 0 && !setup.data && <div className="text-sm text-muted-foreground" role="status">
          {setup.isError ? <>No se pudieron cargar las formas de pago. <Button variant="link" size="sm" onClick={() => setup.refetch()}>Reintentar</Button></> : "Cargando formas de pago…"}
        </div>}
        {credit && <div className="space-y-3">
          {!member && <p className="text-sm text-amber-700">Agrega un socio para guardar el fiado.</p>}
          <div className="space-y-1.5"><Label htmlFor="co-paid">Abono inicial (opcional)</Label>
            <Input id="co-paid" type="number" inputMode="decimal" min={0} max={total} step="0.01" value={paidValue}
              onChange={e => setPaidValue(e.target.value)} placeholder="0.00" className="h-11 text-lg" aria-invalid={!validPaid} />
            {!validPaid && <p role="alert" className="text-sm text-destructive">El abono debe estar entre cero y el total.</p>}
          </div>
          {paid > 0 && available.length > 1 && <div className="flex flex-wrap gap-2" aria-label="Forma de pago del abono">{available.map(m =>
            <Button key={m.key} type="button" size="sm" variant={abonoMethod === m.key ? "default" : "outline"}
              aria-pressed={abonoMethod === m.key} onClick={() => { setAbonoMethod(m.key); setGiven(""); }}>{m.label}</Button>)}</div>}
          <p className="text-sm font-semibold tabular-nums">Queda a deber: {fmtMoney(balance)}</p>
        </div>}
        {cash && <div className="space-y-2">
          <Label htmlFor="co-given">Efectivo recibido</Label>
          <Input id="co-given" type="number" inputMode="decimal" min={0} step="0.01" value={given}
            onChange={e => setGiven(e.target.value)} placeholder={paid.toFixed(2)} className="h-11 text-lg" aria-invalid={cashInvalid} />
          <div className="flex flex-wrap gap-1.5">{[paid, ...[50, 100, 200, 500, 1000].filter(n => n > paid).slice(0, 3)].map((amount, i) =>
            <Button type="button" key={i} variant="outline" size="sm" className="h-8" onClick={() => setGiven(amount.toFixed(2))}>{i === 0 ? "Exacto" : `$${amount}`}</Button>)}</div>
          {given !== "" && Number.isFinite(received) && <p className={cn("font-semibold tabular-nums", cashInvalid ? "text-destructive" : "text-success")} role="status">
            {cashInvalid ? `Falta: ${fmtMoney((moneyCents(paid) - moneyCents(received)) / 100)}` : `Cambio: ${fmtMoney((moneyCents(received) - moneyCents(paid)) / 100)}`}
          </p>}
          {cashInvalid && !credit && received >= 0 && <Button variant="link" size="sm" className="px-0" onClick={() => { setMode("fiado"); setPaidValue(String(received)); setGiven(""); }}>Dejar saldo pendiente</Button>}
          <CashDrawerField value={drawer} onChange={setDrawer} date={todayIso()} id="sale-cash-drawer" hideHint />
        </div>}
        {paid > 0 && method !== "cash" && <p className="text-sm text-muted-foreground">{method === "card" ? t.page.checkout.cardHint : t.page.checkout.transferHint}</p>}
        {total === 0 && <p className="text-sm text-muted-foreground">La promoción cubre todo el importe. Ajusta o quita la promoción antes de continuar.</p>}
        {(error || blockedReason) && <Alert variant="destructive"><AlertDescription>{blockedReason || error}</AlertDescription></Alert>}
      </fieldset>
      <div className="relative z-10 border-t bg-background px-5 py-4 shrink-0"><Button size="lg" className="w-full" onClick={confirm} disabled={disabled}>
        {submitting && <Loader2 className="h-4 w-4 animate-spin" />}{label}
      </Button></div>
    </DialogContent>
  </Dialog>;
}
