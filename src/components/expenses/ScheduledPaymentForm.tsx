import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { toast } from "sonner";
import { ExpenseForm, type ExpenseFormSubmitPayload } from "@/components/expenses/ExpenseForm";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { fetchAllExpenses, usePayOccurrence, useUnclassifiedCash, type ExpenseOccurrence } from "@/hooks/useExpenses";
import { todayIso } from "@/lib/dates";
import { keyForPayload } from "@/lib/idempotency";

export function ScheduledPaymentForm({ occurrence, onClose }: { occurrence: ExpenseOccurrence; onClose(): void }) {
  const pay = usePayOccurrence();
  const cash = useUnclassifiedCash();
  const existing = useQuery({ queryKey: ["expenses", "matching-scheduled", occurrence.category], queryFn: () => fetchAllExpenses({ category: occurrence.category }) });
  const [selected, setSelected] = useState("");
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const candidates = (existing.data ?? []).filter(e => !e.recurring_occurrence_id);
  const chosen = candidates.find(e => e.id === selected);
  const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
  async function submit(payload: ExpenseFormSubmitPayload) {
    setError(null);
    const input = { ...payload, id: occurrence.id, paid_on: payload.expense_date, ...(chosen ? { expense_id: chosen.id } : {}) };
    attempt.current = keyForPayload(attempt.current, input);
    try {
      await pay.mutateAsync({ ...input, idempotency_key: attempt.current.key });
      attempt.current = null;
      toast.success(chosen ? "Pago relacionado con el gasto existente" : "Pago registrado");
      onClose();
    } catch (e) { setError(e instanceof Error ? e.message : "No se pudo registrar el pago. Conservamos tus datos."); }
  }
  if (cash.isLoading || existing.isLoading) return <p className="text-sm text-muted-foreground">Buscando registros que puedan corresponder a este pago…</p>;
  if (cash.error || existing.error) return <div role="alert" className="space-y-3"><p>No pudimos consultar los registros existentes.</p><Button variant="outline" onClick={() => { cash.refetch(); existing.refetch(); }}>Reintentar</Button></div>;
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">{occurrence.name || occurrence.payee_name || "Pago programado"} · vence {occurrence.due_on} · previsto {money(occurrence.expected_amount)}</p>
    {candidates.length > 0 && <div className="space-y-2"><Label htmlFor="existing-scheduled-expense">Hay gastos registrados en esta categoría</Label><select id="existing-scheduled-expense" className="w-full h-10 rounded-md border bg-background px-3 text-sm" value={selected} onChange={e => { setSelected(e.target.value); setError(null); }}><option value="">Selecciona si alguno corresponde a este pago</option><option value="new">Es otro pago: registrar uno nuevo</option>{candidates.map(e => <option key={e.id} value={e.id}>{e.paid_on} · {e.description || e.payee_name || "Gasto"} · {money(e.amount)}</option>)}</select><p className="text-xs text-muted-foreground">Relacionar un gasto existente no vuelve a descontar dinero.</p></div>}
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    {chosen ? <div className="space-y-4"><p className="rounded-md bg-muted p-3 text-sm">{chosen.description || chosen.payee_name} · pagado el {chosen.paid_on} por {money(chosen.amount)}</p><Button className="w-full" disabled={pay.isPending} onClick={() => submit({ ...chosen, expense_date: chosen.paid_on, description: chosen.description ?? undefined, payee_name: chosen.payee_name ?? undefined, reference: chosen.reference ?? undefined, cash_drawer_id: chosen.cash_drawer_id ?? undefined, cash_movement_id: undefined, recurring_occurrence_id: undefined })}>Relacionar este gasto</Button></div>
    : <ExpenseForm key={occurrence.id} mode="create" lockedCategory submitLabel="Registrar pago" initial={{ amount: String(occurrence.expected_amount), expense_date: todayIso(), category: occurrence.category, payment_method: occurrence.payment_method, description: occurrence.name ?? "", payee_name: occurrence.payee_name ?? "", classification: occurrence.classification }} cashMovements={cash.data?.items ?? []} submitting={pay.isPending || (candidates.length > 0 && !selected)} onSubmit={submit} onCancel={onClose} />}
  </div>;
}
