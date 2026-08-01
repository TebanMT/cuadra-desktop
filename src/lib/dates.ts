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

// fmtDayMonth — etiqueta corta "d MMM" para listas densas y ejes de charts.
// Mismo parseo defensivo que parseDate (date-only → medianoche LOCAL).
export function fmtDayMonth(value: string | null | undefined): string {
  const d = parseDate(value);
  if (!d) return "—";
  return format(d, "d MMM", { locale: es });
}

export function fmtIso(date: Date): string {
  return format(date, "yyyy-MM-dd");
}

// fmtDayGrain — para campos date-grain que el wire codifica como instante a
// medianoche UTC ("2026-08-01T00:00:00Z", p.ej. fechas de retos): toma la
// parte de fecha y la formatea como día calendario. Pasarla por la zona
// local (fmtDate del instante) la pintaba un día antes en CDMX.
export function fmtDayGrain(value: string | null | undefined): string {
  if (!value) return "—";
  return fmtDate(value.slice(0, 10));
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

// addMonthsClamped: espejo FE de addMonthsNatural en el dominio
// (cuadra-core membership.go). 31-ene + 1 mes = 28/29-feb (clamp al
// último día del mes target), NO 3-mar como haría el overflow nativo.
// El backend es la autoridad del expiry real; esto es sólo para que el
// preview en UI coincida con lo que el backend va a calcular.
export function addMonthsClamped(start: Date, months: number): Date {
  const targetMonth = start.getMonth() + months;
  const day = start.getDate();
  // Día 0 del mes siguiente al target = último día del mes target.
  const lastDay = new Date(start.getFullYear(), targetMonth + 1, 0).getDate();
  return new Date(start.getFullYear(), targetMonth, Math.min(day, lastDay));
}

export function previewExpiry(
  startDateIso: string,
  durationDays: number,
  durationMonths?: number | null,
): string {
  const start = parseDate(startDateIso);
  if (!start) return "—";
  if (durationMonths && durationMonths > 0) {
    return fmtDate(addMonthsClamped(start, durationMonths));
  }
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
