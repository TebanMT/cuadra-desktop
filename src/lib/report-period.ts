import {
  addDays,
  differenceInCalendarDays,
  endOfMonth,
  format,
  startOfMonth,
  subMonths,
} from "date-fns";
import { es } from "date-fns/locale";
import { parseDateInput } from "@/lib/date-input";
import { fmtDate, fmtIso, parseDate, todayIso } from "@/lib/dates";
import type { ReportRange } from "@/components/reports/PeriodBar";

export type ReportView = "money" | "members" | "products";
export const REPORT_VIEWS: { value: ReportView; label: string }[] = [
  { value: "money", label: "Dinero" },
  { value: "members", label: "Socios" },
  { value: "products", label: "Productos" },
];

export function readReportRange(params: URLSearchParams): {
  range: ReportRange;
  error?: string;
} {
  const period = params.get("period");
  const from = params.get("from"),
    to = params.get("to");
  if (period === "custom" || from || to) {
    const valid =
      from &&
      to &&
      parseDateInput(from) === from &&
      parseDateInput(to) === to &&
      from <= to;
    if (
      !valid ||
      to! > todayIso() ||
      differenceInCalendarDays(parseDate(to!)!, parseDate(from!)!) >= 366
    ) {
      return {
        range: { period: "month" },
        error: "Elige un período válido de hasta 366 días.",
      };
    }
    return { range: { period: "custom", from: from!, to: to! } };
  }
  if (
    period &&
    !["today", "week", "month", "last_month", "3_months", "year"].includes(
      period,
    )
  ) {
    return { range: { period: "month" }, error: "Elige un período válido." };
  }
  return { range: { period: (period || "month") as ReportRange["period"] } };
}

export function writeReportRange(params: URLSearchParams, range: ReportRange) {
  const next = new URLSearchParams(params);
  next.set("period", range.period);
  next.delete("from");
  next.delete("to");
  if (range.period === "custom" && range.from && range.to) {
    next.set("from", range.from);
    next.set("to", range.to);
  }
  return next;
}

export const reportLink = (
  path: string,
  from: string,
  to: string,
  extra: Record<string, string> = {},
) => `${path}?${new URLSearchParams({ ...extra, from, to })}`;

export function comparisonDates(data: {
  period: string;
  from: string;
  to: string;
  previous_from?: string;
  previous_to?: string;
}) {
  if (data.previous_from && data.previous_to)
    return { from: data.previous_from, to: data.previous_to };
  // Compatibility with an API from the previous release. Mirrors previousWindow.
  const from = parseDate(data.from)!,
    to = parseDate(data.to)!;
  const offset = differenceInCalendarDays(to, from);
  if (["month", "last_month"].includes(data.period)) {
    const start = subMonths(startOfMonth(from), 1);
    const end = addDays(start, offset);
    return {
      from: fmtIso(start),
      to: fmtIso(end > endOfMonth(start) ? endOfMonth(start) : end),
    };
  }
  return {
    from: fmtIso(addDays(from, -(offset + 1))),
    to: fmtIso(addDays(from, -1)),
  };
}

export type ReportBucket = {
  date: string;
  from: string;
  to: string;
  label: string;
  income: number;
  outflows: number;
  count: number;
};
export function reportBuckets(
  from: string,
  to: string,
  income: { date: string; total: number }[] = [],
  outflows: { date: string; total: number }[] = [],
  counts: { date: string; count: number }[] = [],
) {
  const first = parseDate(from),
    last = parseDate(to);
  if (!first || !last || from > to)
    return { monthly: false, rows: [] as ReportBucket[] };
  const monthly = differenceInCalendarDays(last, first) > 31;
  const map = new Map<string, ReportBucket>();
  for (let day = first; day <= last; day = addDays(day, 1)) {
    const iso = fmtIso(day),
      key = monthly ? iso.slice(0, 7) : iso;
    const row = map.get(key);
    if (row) row.to = iso;
    else
      map.set(key, {
        date: key,
        from: iso,
        to: iso,
        label: monthly ? format(day, "MMM yyyy", { locale: es }) : fmtDate(iso),
        income: 0,
        outflows: 0,
        count: 0,
      });
  }
  for (const [items, field] of [
    [income, "income"],
    [outflows, "outflows"],
    [counts, "count"],
  ] as const) {
    for (const item of items) {
      const iso = item.date.slice(0, 10);
      if (iso < from || iso > to) continue;
      const row = map.get(monthly ? iso.slice(0, 7) : iso);
      if (row)
        row[field] +=
          field === "count"
            ? (item as { count: number }).count
            : Math.round((item as { total: number }).total * 100);
    }
  }
  return {
    monthly,
    rows: [...map.values()].map((row) => ({
      ...row,
      income: row.income / 100,
      outflows: row.outflows / 100,
    })),
  };
}
