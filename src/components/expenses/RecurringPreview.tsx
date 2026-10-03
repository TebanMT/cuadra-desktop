import { fmtDate, todayIso } from "@/lib/dates";

// Calendar examples follow the backend's anchor day and 15/end-of-month rules.
export function previewDates(start: string, frequency: string, end = "", from = todayIso()): string[] {
  const due = new Date(`${start}T00:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(start) || !Number.isFinite(due.getTime()) || due.toISOString().slice(0, 10) !== start) return [];
  const anchor = due.getUTCDate();
  const months: Record<string, number> = { monthly: 1, bimonthly: 2, quarterly: 3, semiannual: 6, annual: 12 };
  const result: string[] = [];
  for (let step = 0; step < 100000 && result.length < 3; step++) {
    const date = due.toISOString().slice(0, 10);
    if (end && date > end) break;
    if (date >= from) result.push(date);
    const year = due.getUTCFullYear(), month = due.getUTCMonth(), day = due.getUTCDate();
    if (frequency === "weekly" || frequency === "every_14_days") due.setUTCDate(day + (frequency === "weekly" ? 7 : 14));
    else if (frequency === "semimonthly") {
      const last = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
      due.setTime(Date.UTC(year, day === last ? month + 1 : month, day < 15 || day === last ? 15 : last));
    } else if (months[frequency]) {
      const nextMonth = month + months[frequency];
      const last = new Date(Date.UTC(year, nextMonth + 1, 0)).getUTCDate();
      due.setTime(Date.UTC(year, nextMonth, Math.min(anchor, last)));
    } else return [];
  }
  return result;
}

export function RecurringPreview({ start, frequency, end }: { start: string; frequency: string; end: string }) {
  const dates = previewDates(start, frequency, end);
  return <div className="rounded-md border bg-muted/30 p-3 text-sm space-y-1"><p className="font-medium">Próximas fechas con esta programación</p><p className="text-muted-foreground">{dates.length ? dates.map(fmtDate).join(" · ") : "No hay fechas futuras dentro del período elegido."}</p><p className="text-xs text-muted-foreground">Cada fecha aparecerá en Por pagar. Registra el pago cuando lo hayas realizado.</p></div>;
}
