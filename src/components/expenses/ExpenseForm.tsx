import { validateDateFields } from "@/lib/date-input";
import { DateInput } from "@/components/ui/date-input";
import { useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { todayIso } from "@/lib/dates";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  expenses as t,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "@/strings/expenses";
import type { PaidFrom, CashMovement, ExpenseOccurrence } from "@/hooks/useExpenses";
import { moneyInputError } from "@/lib/moneyInput";
import { CashDrawerField } from "@/components/cash/CashDrawerField";

export type ExpenseFormMode = "create" | "edit";

export interface ExpenseFormValues {
  expense_date: string; // YYYY-MM-DD
  amount: string;
  category: ExpenseCategory | "";
  payment_method: ExpensePaymentMethod | "";
  paid_from: PaidFrom | "";
  cash_drawer_id?: string;
  description: string;
	payee_name:string;
	reference:string;
	classification:"fixed"|"variable";
  correction_reason: string;
}

export interface ExpenseFormSubmitPayload {
  expense_date: string;
  amount: number;
  category: ExpenseCategory;
  payment_method: ExpensePaymentMethod;
  paid_from: PaidFrom;
  cash_drawer_id?: string;
  description?: string;
	payee_name?:string;
	reference?:string;
	classification:"fixed"|"variable";
  correction_reason?: string;
  cash_movement_id?: string;
  recurring_occurrence_id?: string;
}

interface Props {
  mode: ExpenseFormMode;
  initial?: Partial<ExpenseFormValues>;
  submitting: boolean;
  onSubmit(payload: ExpenseFormSubmitPayload): void;
  onCancel(): void;
  serverError?: string | null;
  cashMovements?: CashMovement[];
  occurrences?: ExpenseOccurrence[];
  lockedCategory?: boolean;
  submitLabel?: string;
}

const emptyValues: ExpenseFormValues = {
  expense_date: todayIso(),
  amount: "",
  category: "",
  payment_method: "",
  paid_from: "",
  cash_drawer_id: undefined,
  description: "",
	payee_name:"",reference:"",classification:"variable",correction_reason:"",
};

export function ExpenseForm({ mode, initial, submitting, onSubmit, onCancel, serverError, cashMovements = [], occurrences = [], lockedCategory = false, submitLabel }: Props) {
  const [values, setValues] = useState<ExpenseFormValues>(() => ({ ...emptyValues, expense_date: todayIso(), ...initial }));
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ExpenseFormValues, string>>>({});
  const [classificationTouched, setClassificationTouched] = useState(!!initial);
  const [cashMovementId, setCashMovementId] = useState("");
  const [occurrenceId, setOccurrenceId] = useState("");
  const compatibleCash = mode === "create" && values.paid_from === "cash_drawer"
    ? cashMovements.filter(m => m.movement_type === "cash_out" && m.classification_status === "unclassified" && Math.round(m.amount * 100) === Math.round(Number(values.amount) * 100)) : [];
  const compatibleDues = mode === "create" ? occurrences.filter(o => o.status === "pending" && (o.category === values.category || (!!o.name && values.description.trim().length >= 3 && values.description.toLocaleLowerCase().includes(o.name.toLocaleLowerCase())) || (Number(values.amount) > 0 && Math.round(o.expected_amount * 100) === Math.round(Number(values.amount) * 100)))) : [];
  const usesCash = !!cashMovementId && cashMovementId !== "new";
  const usesDue = !!occurrenceId && occurrenceId !== "new";

  function update<K extends keyof ExpenseFormValues>(key: K, val: ExpenseFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
    setFieldErrors((current) => ({ ...current, [key]: undefined }));
  }

  function updateCategory(value: ExpenseCategory) {
    const suggested = ["renta", "nomina", "impuestos_y_permisos"].includes(value)
      ? "fixed"
      : "variable";
    setValues((current) => ({
      ...current,
      category: value,
      classification: classificationTouched ? current.classification : suggested,
    }));
    setFieldErrors((current) => ({ ...current, category: undefined }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setFieldErrors({});

    const nextErrors: Partial<Record<keyof ExpenseFormValues, string>> = {};
    const amountError = moneyInputError(values.amount);
    if (amountError) nextErrors.amount = amountError;
    if (!values.paid_from) nextErrors.paid_from = "Selecciona de dónde salió el dinero.";
    else if (values.paid_from === "cash_drawer" && values.payment_method !== "cash") nextErrors.paid_from = "La caja de recepción sólo se usa para pagos en efectivo.";
    if (values.expense_date > todayIso()) nextErrors.expense_date = "La fecha de pago no puede ser futura.";
    if ((compatibleCash.length > 0 && !cashMovementId) || (compatibleDues.length > 0 && !occurrenceId)) nextErrors.amount = "Revisa los registros similares antes de continuar.";
    const amount = Number(values.amount);
    if (!values.expense_date) nextErrors.expense_date = t.form.errors.dateRequired;
    if (!values.category) nextErrors.category = t.form.errors.categoryRequired;
    if (!values.payment_method) nextErrors.payment_method = t.form.errors.paymentRequired;
    if (mode === "create" && !values.description.trim()) nextErrors.description = "Escribe el concepto del gasto.";
    if (values.description.trim().length > 200) nextErrors.description = t.form.errors.descriptionTooLong;
    if (values.payee_name.trim().length > 120) nextErrors.payee_name = "Usa hasta 120 caracteres.";
    if (values.reference.trim().length > 120) nextErrors.reference = "Usa hasta 120 caracteres.";
    if (values.correction_reason.trim().length > 200) nextErrors.correction_reason = "Usa hasta 200 caracteres.";
    if (mode === "edit" && values.correction_reason.trim().length < 3) nextErrors.correction_reason = "Explica brevemente por qué corriges el gasto.";
    if (Object.keys(nextErrors).length) { setFieldErrors(nextErrors); return; }
    const data = { ...values, amount, paid_from: values.paid_from as PaidFrom,
      description: values.description.trim(), payee_name: values.payee_name.trim(), reference: values.reference.trim(), correction_reason: values.correction_reason.trim() };

    onSubmit({
      expense_date: data.expense_date,
      amount: data.amount,
      category: data.category as ExpenseCategory,
      payment_method: data.payment_method as ExpensePaymentMethod,
      paid_from: data.paid_from,
      cash_drawer_id:
        data.paid_from === "cash_drawer"
          ? data.cash_drawer_id
          : undefined,
      description: data.description || undefined,
	  payee_name:data.payee_name||undefined,reference:data.reference||undefined,classification:data.classification,
      correction_reason: data.correction_reason || undefined,
      cash_movement_id: usesCash ? cashMovementId : undefined,
      recurring_occurrence_id: usesDue ? occurrenceId : undefined,
    });
  }

  return (
    <form onSubmitCapture={validateDateFields} onSubmit={handleSubmit} className="space-y-4" noValidate>
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="e-desc">Concepto{mode === "create" ? " *" : ""}</Label>
        <Input id="e-desc" autoFocus value={values.description} maxLength={200} placeholder="Ej. Limpieza de septiembre" onChange={e => update("description", e.target.value)} />
        <FieldError message={fieldErrors.description} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="e-cat">{t.form.fields.category} *</Label>
        <Select value={values.category} onValueChange={(v) => { setOccurrenceId(""); updateCategory(v as ExpenseCategory); }} disabled={usesDue || lockedCategory}>
          <SelectTrigger id="e-cat" aria-invalid={!!fieldErrors.category}>
            <SelectValue placeholder="Selecciona una categoría" />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>{t.categories[c]}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <FieldError message={fieldErrors.category} />
      </div>

      <div className="grid sm:grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="e-amount">{t.form.fields.amount} *</Label>
          <Input
            id="e-amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={values.amount}
            onChange={(e) => { update("amount", e.target.value); setCashMovementId(""); }}
            disabled={usesCash}
            aria-invalid={!!fieldErrors.amount}
          />
          <FieldError message={fieldErrors.amount} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="e-date">{t.form.fields.date} *</Label>
          <DateInput
            id="e-date"
            context="recent"
            disabled={usesCash}
            value={values.expense_date}
            onValueChange={(e) => update("expense_date", e)}
            max={todayIso()}
            aria-invalid={!!fieldErrors.expense_date}
          />
          <FieldError message={fieldErrors.expense_date} />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="e-payment-source">Pagado con *</Label>
        <select id="e-payment-source" className="h-11 w-full rounded-md border bg-background px-3 text-sm" value={values.paid_from && values.payment_method ? `${values.paid_from}:${values.payment_method}` : ""} disabled={usesCash} aria-invalid={!!fieldErrors.paid_from || !!fieldErrors.payment_method} onChange={e => {
          const [source, method] = e.target.value.split(":");
          setValues(v => ({...v, paid_from: source as PaidFrom, payment_method: method as ExpensePaymentMethod, cash_drawer_id: undefined}));
          setCashMovementId(""); setFieldErrors(v => ({...v, paid_from: undefined, payment_method: undefined}));
        }}>
          <option value="">Elige cómo pagaste</option>
          <option value="cash_drawer:cash">Efectivo de recepción</option>
          <option value="gym_fund:transfer">Transferencia del gimnasio</option>
          <option value="gym_fund:card">Tarjeta del gimnasio</option>
          <option value="gym_fund:cash">Efectivo del gimnasio fuera de recepción</option>
          <option value="external:transfer">Transferencia personal</option>
          <option value="external:card">Tarjeta personal</option>
          <option value="external:cash">Efectivo personal</option>
        </select>
        <FieldError message={fieldErrors.paid_from || fieldErrors.payment_method} />
      </div>

      {values.paid_from === "cash_drawer" && (
        <CashDrawerField
          value={values.cash_drawer_id}
          onChange={(value) => update("cash_drawer_id", value)}
          id="expense-cash-drawer"
          disabled={usesCash}
        />
      )}

      {compatibleCash.length > 0 && <div className="space-y-2 rounded-md border p-3">
        <Label htmlFor="existing-cash">Hay salidas de caja por este monto</Label>
        <select id="existing-cash" className="h-11 w-full rounded-md border bg-background px-3" value={cashMovementId} onChange={event => {
          const id = event.target.value; setCashMovementId(id);
          const movement = compatibleCash.find(m => m.id === id);
          if (movement) setValues(v => ({ ...v, expense_date: movement.movement_on, cash_drawer_id: movement.cash_drawer_id, payment_method: "cash", description: v.description || movement.reason }));
        }}><option value="">Selecciona si es la misma salida</option><option value="new">Es otro gasto: registrar una nueva salida</option>{compatibleCash.map(m => <option key={m.id} value={m.id}>{m.movement_on} · {m.reason}</option>)}</select>
        {usesCash && <p className="text-sm text-muted-foreground">Usaremos esta salida. El efectivo ya se descontó de caja.</p>}
      </div>}
      {compatibleDues.length > 0 && <div className="space-y-2 rounded-md border p-3">
        <Label htmlFor="existing-due">Hay pagos pendientes similares</Label>
        <select id="existing-due" className="h-11 w-full rounded-md border bg-background px-3" value={occurrenceId} onChange={e => { setOccurrenceId(e.target.value); const due = compatibleDues.find(o => o.id === e.target.value); if (due) updateCategory(due.category); }}>
          <option value="">Selecciona si corresponde a uno de ellos</option><option value="new">Es otro gasto</option>{compatibleDues.map(o => <option key={o.id} value={o.id}>{o.name || o.payee_name || t.categories[o.category]} · {o.due_on} · ${o.expected_amount.toFixed(2)}</option>)}
        </select>
        {usesDue && <p className="text-sm text-muted-foreground">Este pago dejará de aparecer como pendiente.</p>}
      </div>}
      {values.paid_from === "cash_drawer" && !usesCash && <p className="text-sm text-muted-foreground">Se descontará este monto del efectivo de recepción.</p>}

      <details open={mode === "edit"} className="group rounded-md border">
        <summary className="cursor-pointer list-none px-4 py-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
          Más datos
        </summary>
        <div className="space-y-4 border-t p-4">
          <div className="space-y-2">
            <Label htmlFor="e-class">Fijo o variable</Label>
            <Select value={values.classification} onValueChange={(v) => { setClassificationTouched(true); update("classification", v as "fixed" | "variable"); }}>
              <SelectTrigger id="e-class"><SelectValue /></SelectTrigger>
              <SelectContent><SelectItem value="fixed">Fijo</SelectItem><SelectItem value="variable">Variable</SelectItem></SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground">
              Fijo: renta o internet. Variable: reparaciones o compras ocasionales.
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="e-ref">Referencia</Label>
            <Input id="e-ref" value={values.reference} maxLength={120} onChange={(e) => update("reference", e.target.value)} />
            <FieldError message={fieldErrors.reference} />
          </div>
          <div className="space-y-2"><Label htmlFor="e-payee">Proveedor o persona que recibió el pago</Label><Input id="e-payee" value={values.payee_name} maxLength={120} onChange={e => update("payee_name", e.target.value)} placeholder="Opcional" /></div>
          {mode === "edit" && (
            <div className="space-y-2">
              <Label htmlFor="e-correction-reason">Motivo de la corrección *</Label>
              <Input
                id="e-correction-reason"
                value={values.correction_reason}
                maxLength={200}
                placeholder="Ej. se capturó un monto equivocado"
                onChange={(event) => update("correction_reason", event.target.value)}
                aria-invalid={!!fieldErrors.correction_reason}
              />
              <p className="text-xs text-muted-foreground">
                Si cambia el efectivo, el corte quedará pendiente de revisión.
              </p>
              <FieldError message={fieldErrors.correction_reason} />
            </div>
          )}
        </div>
      </details>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {t.form.cancel}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {submitLabel ?? (mode === "edit" ? "Guardar cambios" : t.form.submit)}
        </Button>
      </div>
    </form>
  );
}

function FieldError({ message }: { message?: string }) {
  return message ? <p className="text-xs text-destructive">{message}</p> : null;
}
