import { validateDateFields } from "@/lib/date-input";
import { DateInput } from "@/components/ui/date-input";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { CashDrawerField } from "@/components/cash/CashDrawerField";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useRegisterOtherIncome, type PaymentMethod } from "@/hooks/useBilling";
import { todayIso } from "@/lib/dates";
import { keyForPayload } from "@/lib/idempotency";
import { moneyInputError } from "@/lib/moneyInput";

export function OtherIncomeDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const register = useRegisterOtherIncome();
  const [amount, setAmount] = useState("");
  const [method, setMethod] = useState<PaymentMethod>("transfer");
  const [date, setDate] = useState(todayIso());
  const [description, setDescription] = useState("");
  const [destination, setDestination] = useState<"" | "cash_drawer" | "gym_fund">("");
  const [drawer, setDrawer] = useState<string>();
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); setError(null);
    const amountError = moneyInputError(amount);
    if (amountError) return setError(amountError);
    if (description.trim().length < 3) return setError("Escribe un concepto de al menos 3 caracteres.");
    if (!date || date > todayIso()) return setError("Selecciona la fecha en que recibiste el dinero; no puede ser futura.");
    if (method === "cash" && !destination) return setError("Selecciona dónde quedó el efectivo.");
    const numeric = Number(amount);
    try {
        const input = { amount: numeric, payment_method: method, payment_date: date, description: description.trim(), cash_destination: method === "cash" ? destination as "cash_drawer" | "gym_fund" : "gym_fund" as const, ...(method === "cash" && destination === "cash_drawer" && drawer ? { cash_drawer_id: drawer } : {}) };
        attempt.current = keyForPayload(attempt.current, input);
        await register.mutateAsync({ ...input, idempotency_key: attempt.current.key });
      attempt.current = null;
      toast.success("Ingreso registrado");
      setAmount(""); setDescription(""); setDate(todayIso()); setDestination(""); setDrawer(undefined); setMethod("transfer");
      onOpenChange(false);
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos guardar. Conservamos tus datos para reintentar."); }
  }
  return <Dialog open={open} onOpenChange={onOpenChange}><DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto"><DialogHeader><DialogTitle>Otro ingreso</DialogTitle><DialogDescription>Por una venta o servicio fuera de membresías y productos.</DialogDescription></DialogHeader><form onSubmitCapture={validateDateFields} onSubmit={submit} noValidate className="space-y-4">
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <><div className="space-y-2"><Label htmlFor="other-income-description">Concepto</Label><Input id="other-income-description" maxLength={2000} placeholder="Ej. Venta de caminadora usada" value={description} onChange={e => setDescription(e.target.value)} /></div><div className="grid gap-4 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="other-income-amount">Monto</Label><Input id="other-income-amount" type="number" min="0.01" step="0.01" inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} /></div><div className="space-y-2"><Label htmlFor="other-income-date">Fecha de recepción</Label><DateInput id="other-income-date" context="recent" max={todayIso()} value={date} onValueChange={e => setDate(e)} /></div></div>
    <div className="space-y-2"><Label htmlFor="other-income-method">Método</Label><select id="other-income-method" className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={method} onChange={e => setMethod(e.target.value as PaymentMethod)}><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option></select></div>
    {method === "cash" && <div className="space-y-2"><Label htmlFor="other-income-destination">¿Dónde quedó el efectivo?</Label><select id="other-income-destination" className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={destination} onChange={e => setDestination(e.target.value as typeof destination)}><option value="">Selecciona el destino</option><option value="cash_drawer">Caja de recepción</option><option value="gym_fund">Dinero del gimnasio fuera de caja</option></select></div>}
    {method === "cash" && destination === "cash_drawer" && <CashDrawerField value={drawer} onChange={setDrawer} />}
    {method === "cash" && destination && <p className="text-xs text-muted-foreground">{destination === "cash_drawer" ? "Se sumará al efectivo de esta caja." : "Cuenta como ingreso. El efectivo de recepción no cambia."}</p>}
    <Button type="submit" className="w-full" disabled={register.isPending}>Registrar ingreso</Button></>
  </form></DialogContent></Dialog>;
}
