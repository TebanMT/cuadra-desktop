import { validateDateFields } from "@/lib/date-input";
import { DateInput } from "@/components/ui/date-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { History, Loader2 } from "lucide-react";
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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { CashDrawerField } from "@/components/cash/CashDrawerField";
import {
  fmtMoney,
  useCorrectPayment,
  usePaymentCorrectionHistory,
  type Payment,
  type PaymentMethod,
} from "@/hooks/useBilling";
import { ApiError } from "@/lib/api";
import { fmtDate, todayIso } from "@/lib/dates";
import { keyForPayload } from "@/lib/idempotency";

interface Props {
  payment: Payment | null;
  open: boolean;
  onOpenChange(open: boolean): void;
}

const METHOD_LABEL: Record<PaymentMethod, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
};

function errorMessage(error: unknown): string {
  if (!(error instanceof ApiError)) return "No pudimos guardar la corrección.";
  const details = error.details as Record<string, unknown> | undefined;
  return (
    (typeof details?.exception === "string" && details.exception) ||
    (typeof details?.message === "string" && details.message) ||
    error.message ||
    "No pudimos guardar la corrección."
  );
}

/**
 * Exceptional, owner-only correction of facts that were captured incorrectly.
 * It deliberately does not perform a refund or rewrite the service delivered.
 */
export function PaymentCorrectionModal({ payment, open, onOpenChange }: Props) {
  const correction = useCorrectPayment(payment?.id ?? "");
  const history = usePaymentCorrectionHistory(payment?.id, open);
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [date, setDate] = useState(todayIso());
  const [cashDestination, setCashDestination] = useState<"cash_drawer" | "gym_fund">("cash_drawer");
  const [cashDrawerId, setCashDrawerId] = useState<string>();
  const [reason, setReason] = useState("");
  const [annul, setAnnul] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);

  useEffect(() => {
    if (!open || !payment) return;
    setAmount(payment.amount.toFixed(2));
    setMethod(payment.payment_method ?? "cash");
    setDate(payment.payment_date);
    setCashDestination(payment.cash_destination ?? "cash_drawer");
    setCashDrawerId(payment.cash_drawer_id ?? undefined);
    setReason("");
    setAnnul(false);
    setError(null);
    attempt.current = null;
  }, [open, payment]);

  const numericAmount = Number(amount);
  const obligation = (payment?.amount ?? 0) + (payment?.balance_pending ?? 0);
  const resultingBalance = payment?.concept === "membership"
    ? Math.max(0, obligation - (Number.isFinite(numericAmount) ? numericAmount : 0))
    : 0;
  const changed = useMemo(() => {
    if (annul) return true;
    if (!payment || !Number.isFinite(numericAmount)) return false;
    const beforeMethod = payment.payment_method ?? "cash";
    const beforeDrawer = beforeMethod === "cash" ? payment.cash_drawer_id ?? "" : "";
    const afterDrawer = method === "cash" && cashDestination === "cash_drawer" ? cashDrawerId ?? beforeDrawer : "";
    return (
      Math.abs(numericAmount - payment.amount) >= 0.005 ||
      method !== beforeMethod ||
      date !== payment.payment_date ||
      beforeDrawer !== afterDrawer || (payment.concept === "other" && (payment.cash_destination ?? "cash_drawer") !== cashDestination)
    );
  }, [annul, cashDestination, cashDrawerId, date, method, numericAmount, payment]);

  const changesCash = payment
    ? (payment.payment_method === "cash" && payment.cash_destination !== "gym_fund") || (method === "cash" && cashDestination === "cash_drawer")
    : false;

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    if (!payment) return;
    if (!annul && (!Number.isFinite(numericAmount) || numericAmount <= 0)) {
      setError("Captura un monto mayor a cero.");
      return;
    }
    if (!annul && payment.concept === "membership" && numericAmount > obligation + 0.005) {
      setError(`El cobro no puede superar el total acordado de ${fmtMoney(obligation)}.`);
      return;
    }
    if (reason.trim().length < 3) {
      setError("Explica el error de captura con al menos 3 caracteres.");
      return;
    }
    if (!changed) {
      setError("No hay ningún dato distinto por guardar.");
      return;
    }

    const payload = annul ? {
      expected_version: payment.version,
      reason: reason.trim(),
      annul: true as const,
    } : {
      expected_version: payment.version,
      reason: reason.trim(),
      amount: Math.round(numericAmount * 100) / 100,
      payment_method: method,
      payment_date: date,
      ...(payment.concept === "other" ? { cash_destination: cashDestination } : {}),
      ...(method === "cash" && cashDestination === "cash_drawer" && cashDrawerId ? { cash_drawer_id: cashDrawerId } : {}),
    };
    attempt.current = keyForPayload(attempt.current, { payment_id: payment.id, ...payload });
    try {
      const result = await correction.mutateAsync({
        ...payload,
        idempotency_key: attempt.current.key,
      });
      attempt.current = null;
      toast.success(
        result.annulled
          ? "Ingreso anulado."
          : result.after.balance_pending > 0
          ? `Cobro corregido · quedan ${fmtMoney(result.after.balance_pending)} pendientes.`
          : "Cobro corregido.",
      );
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiError && caught.status === 409) {
        setError("Este cobro cambió en otro dispositivo. Cierra y vuelve a abrirlo.");
        return;
      }
      setError(errorMessage(caught));
    }
  }

  const supported = payment?.concept === "membership" || payment?.concept === "other";

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Corregir cobro capturado</DialogTitle>
          <DialogDescription>
            Corrige los datos del cobro. No devuelve dinero ni cambia la vigencia de la membresía.
          </DialogDescription>
        </DialogHeader>

        {!supported ? (
          <Alert variant="destructive">
            <AlertDescription>
              Corrige los productos desde la venta. Para devolver dinero, usa “Devolver”.
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmitCapture={validateDateFields} className="space-y-4" onSubmit={submit}>

            {payment?.concept === "other" && (
              <div className="flex items-start gap-3 rounded-md border border-destructive/40 bg-destructive/5 p-3">
                <Checkbox
                  id="payment-correction-annul"
                  checked={annul}
                  onCheckedChange={(value) => setAnnul(value === true)}
                />
                <div className="space-y-1">
                  <Label htmlFor="payment-correction-annul">Anular ingreso inexistente</Label>
                  <p className="text-xs text-muted-foreground">
                    Úsalo sólo si el ingreso extraordinario nunca ocurrió. Si el dinero entró y después se devolvió, registra la salida real.
                  </p>
                </div>
              </div>
            )}

            <fieldset disabled={annul} className="grid gap-4 sm:grid-cols-2 disabled:opacity-50">
              <div className="space-y-1.5">
                <Label htmlFor="payment-correction-amount">Monto registrado</Label>
                <Input
                  id="payment-correction-amount"
                  type="number"
                  min="0.01"
                  max={payment?.concept === "membership" ? obligation : undefined}
                  step="0.01"
                  value={amount}
                  onChange={(event) => setAmount(event.target.value)}
                  autoFocus
                />
                {payment?.concept === "membership" && (
                  <p className="text-xs text-muted-foreground">
                    Total acordado {fmtMoney(obligation)} · quedaría pendiente {fmtMoney(resultingBalance)}
                  </p>
                )}
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="payment-correction-date">Fecha del cobro</Label>
                <DateInput
                  id="payment-correction-date"
                  context="recent"
                  max={todayIso()}
                  value={date}
                  onValueChange={(event) => setDate(event)}
                />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="payment-correction-method">Método</Label>
                <Select value={method} onValueChange={(value) => setMethod(value as PaymentMethod)}>
                  <SelectTrigger id="payment-correction-method">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(METHOD_LABEL).map(([value, label]) => (
                      <SelectItem key={value} value={value}>{label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              {payment?.concept === "other" && method === "cash" && <div className="space-y-2 sm:col-span-2"><Label htmlFor="correct-income-destination">¿Dónde quedó el efectivo?</Label><select id="correct-income-destination" className="w-full h-10 border rounded-md bg-background px-3 text-sm" value={cashDestination} onChange={e => setCashDestination(e.target.value as typeof cashDestination)}><option value="cash_drawer">Caja de recepción</option><option value="gym_fund">Dinero del gimnasio fuera de caja</option></select></div>}
              {method === "cash" && cashDestination === "cash_drawer" && (
                <div className="sm:col-span-2">
                  <CashDrawerField
                    id="payment-correction-drawer"
                    value={cashDrawerId}
                    onChange={setCashDrawerId}
                    date={date}
                  />
                </div>
              )}
              <div className="space-y-1.5 sm:col-span-2">
                <Label htmlFor="payment-correction-reason">Motivo de la corrección</Label>
                <Textarea
                  id="payment-correction-reason"
                  maxLength={200}
                  placeholder="Ej. Se capturaron $400, pero el comprobante muestra $40"
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                />
              </div>
            </fieldset>

            {changesCash && changed && (
              <p className="text-xs font-medium text-warning">
                Esta corrección cambia la expectativa de caja; no modifica el conteo de efectivo ya capturado.
              </p>
            )}
            {error && (
              <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>
            )}
            <div className="flex justify-end gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                Cancelar
              </Button>
              <Button type="submit" disabled={correction.isPending}>
                {correction.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {annul ? "Anular ingreso" : "Guardar corrección"}
              </Button>
            </div>
          </form>
        )}

        {(history.data?.items.length ?? 0) > 0 && (
          <section className="space-y-2 border-t pt-4">
            <h3 className="flex items-center gap-2 text-sm font-semibold">
              <History className="h-4 w-4" /> Historial de correcciones
            </h3>
            <ul className="space-y-2">
              {history.data!.items.map((item) => (
                <li key={item.id} className="rounded-md border p-3 text-xs">
                  <p className="font-medium">{item.reason}</p>
                  <p className="mt-1 text-muted-foreground">
                    {item.annulled || item.after.annulled ? (
                      <>{fmtDate(item.before.payment_date)} · {METHOD_LABEL[item.before.payment_method]} · {fmtMoney(item.before.amount)} → anulado</>
                    ) : (
                      <>{fmtDate(item.before.payment_date)} · {METHOD_LABEL[item.before.payment_method]} · {fmtMoney(item.before.amount)}
                        {" → "}
                        {fmtDate(item.after.payment_date)} · {METHOD_LABEL[item.after.payment_method]} · {fmtMoney(item.after.amount)}</>
                    )}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}
      </DialogContent>
    </Dialog>
  );
}
