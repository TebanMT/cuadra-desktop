import { addDays, differenceInCalendarDays, format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const DATE_FMT_SHORT = "d MMM yyyy";

export function parseDate(value: string | null | undefined): Date | null {
  if (!value) return null;
  const d = value.includes("T") ? parseISO(value) : parseISO(`${value}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

export function fmtDate(value: string | Date | null | undefined): string {
  if (!value) return "—";
  const d = typeof value === "string" ? parseDate(value) : value;
  if (!d) return "—";
  return format(d, DATE_FMT_SHORT, { locale: es });
}

export function fmtIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

export function todayIso(): string {
  return fmtIso(new Date());
}

export function daysFromToday(value: string | null | undefined): number | null {
  const d = parseDate(value);
  if (!d) return null;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return differenceInCalendarDays(d, today);
}

export function previewExpiry(startDateIso: string, durationDays: number): string {
  const start = parseDate(startDateIso);
  if (!start) return "—";
  return fmtDate(addDays(start, durationDays));
}

export function lastVisitLabel(
  value: string | null | undefined,
  strings: { never: string; today: string; yesterday: string; daysAgo: (n: number) => string }
): string {
  if (!value) return strings.never;
  const days = daysFromToday(value);
  if (days === null) return strings.never;
  const ago = -days;
  if (ago <= 0) return strings.today;
  if (ago === 1) return strings.yesterday;
  return strings.daysAgo(ago);
}
