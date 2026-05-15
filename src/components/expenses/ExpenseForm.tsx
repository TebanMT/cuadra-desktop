import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  expenses as t,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "@/strings/expenses";

export type ExpenseFormMode = "create" | "edit";

export interface ExpenseFormValues {
  expense_date: string; // YYYY-MM-DD
  amount: string;
  category: ExpenseCategory;
  payment_method: ExpensePaymentMethod;
  description: string;
}

export interface ExpenseFormSubmitPayload {
  expense_date: string;
  amount: number;
  category: ExpenseCategory;
  payment_method: ExpensePaymentMethod;
  description?: string;
}

interface Props {
  mode: ExpenseFormMode;
  initial?: Partial<ExpenseFormValues>;
  submitting: boolean;
  onSubmit(payload: ExpenseFormSubmitPayload): void;
  onCancel(): void;
  serverError?: string | null;
}

const schema = z.object({
  expense_date: z.string().min(1, t.form.errors.dateRequired),
  amount: z.number({ invalid_type_error: t.form.errors.amountInvalid }).positive(t.form.errors.amountInvalid),
  category: z.string().min(1, t.form.errors.categoryRequired),
  payment_method: z.string().min(1, t.form.errors.paymentRequired),
  description: z.string().max(200, t.form.errors.descriptionTooLong),
});

function todayYYYYMMDD(): string {
  const d = new Date();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${d.getFullYear()}-${m}-${day}`;
}

const emptyValues: ExpenseFormValues = {
  expense_date: todayYYYYMMDD(),
  amount: "",
  category: "renta",
  payment_method: "cash",
  description: "",
};

export function ExpenseForm({ mode, initial, submitting, onSubmit, onCancel, serverError }: Props) {
  const [values, setValues] = useState<ExpenseFormValues>({ ...emptyValues, ...initial });
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (initial) setValues((v) => ({ ...v, ...initial }));
  }, [initial]);

  function update<K extends keyof ExpenseFormValues>(key: K, val: ExpenseFormValues[K]) {
    setValues((v) => ({ ...v, [key]: val }));
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    const amount = parseFloat(values.amount);
    const parsed = schema.safeParse({
      expense_date: values.expense_date,
      amount,
      category: values.category,
      payment_method: values.payment_method,
      description: values.description.trim(),
    });

    if (!parsed.success) {
      setError(parsed.error.errors[0].message);
      return;
    }

    onSubmit({
      expense_date: parsed.data.expense_date,
      amount: parsed.data.amount,
      category: parsed.data.category as ExpenseCategory,
      payment_method: parsed.data.payment_method as ExpensePaymentMethod,
      description: parsed.data.description || undefined,
    });
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4" noValidate>
      {(error || serverError) && (
        <Alert variant="destructive">
          <AlertDescription>{error || serverError}</AlertDescription>
        </Alert>
      )}

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-2">
          <Label htmlFor="e-date">{t.form.fields.date} *</Label>
          <Input
            id="e-date"
            type="date"
            value={values.expense_date}
            onChange={(e) => update("expense_date", e.target.value)}
            autoFocus
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="e-amount">{t.form.fields.amount} *</Label>
          <Input
            id="e-amount"
            type="number"
            inputMode="decimal"
            min={0}
            step="0.01"
            value={values.amount}
            onChange={(e) => update("amount", e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-2">
        <Label htmlFor="e-cat">{t.form.fields.category} *</Label>
        <Select
          value={values.category}
          onValueChange={(v) => update("category", v as ExpenseCategory)}
        >
          <SelectTrigger id="e-cat">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t.categories[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="e-method">{t.form.fields.paymentMethod} *</Label>
        <Select
          value={values.payment_method}
          onValueChange={(v) => update("payment_method", v as ExpensePaymentMethod)}
        >
          <SelectTrigger id="e-method">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {EXPENSE_PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {t.methods[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <div className="space-y-2">
        <Label htmlFor="e-desc">{t.form.fields.description}</Label>
        <Input
          id="e-desc"
          value={values.description}
          maxLength={200}
          placeholder={t.form.descriptionPlaceholder}
          onChange={(e) => update("description", e.target.value)}
        />
        <p className="text-xs text-muted-foreground">{t.form.descriptionHint}</p>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="outline" onClick={onCancel} disabled={submitting}>
          {t.form.cancel}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
          {t.form.submit}
        </Button>
      </div>
    </form>
  );
}
