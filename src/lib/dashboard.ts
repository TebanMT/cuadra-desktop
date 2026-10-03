import { addDays, format, parseISO } from "date-fns";
import type { DashboardData } from "@/hooks/useReports";
import { comparisonDates } from "@/lib/report-period";

// The API date is the gym's calendar day. Older APIs use the configured gym zone.
export function dashboardDay(
  data?: DashboardData,
  timezone?: string,
): string | undefined {
  if (data?.local_date) return data.local_date;
  if (!timezone) return undefined;
  try {
    const parts = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).formatToParts(new Date(data?.generated_at ?? Date.now()));
    const get = (type: string) => parts.find((p) => p.type === type)?.value;
    return `${get("year")}-${get("month")}-${get("day")}`;
  } catch {
    return undefined;
  }
}
export function dashboardWindow(data: DashboardData, day?: string) {
  if (data.previous_from && data.previous_to)
    return { from: data.previous_from, to: data.previous_to };
  return day
    ? comparisonDates({
        period: "month",
        from: day.slice(0, 8) + "01",
        to: day,
      })
    : undefined;
}
export function upcomingEnd(day: string) {
  return format(addDays(parseISO(day), 30), "yyyy-MM-dd");
}
export function sumMoney(values: number[]) {
  return values.reduce((sum, value) => sum + Math.round(value * 100), 0) / 100;
}

export function recentIncomeLink(day: string) {
  return `/reports?from=${format(addDays(parseISO(day), -29), "yyyy-MM-dd")}&to=${day}`;
}

export interface ReviewItem {
  id: string;
  label: string;
  to: string;
  detail?: string;
  amount?: number;
  count: number;
}
export function memberReviewItems(
  data: DashboardData,
  showProducts: boolean,
  balance?: number,
): ReviewItem[] {
  return [
    {
      id: "expiry",
      count: data.expiring_week.value,
      label: "Membresías por vencer",
      to: "/members?status=expiring_soon",
    },
    {
      id: "balance",
      count: data.attention_summary.pending_balance,
      label: "Socios con saldo pendiente",
      amount: balance,
      to: "/members?status=balance",
    },
    {
      id: "unrenewed",
      count: data.recoverable.value,
      label: "Socios sin renovar",
      detail: "Últimos 60 días",
      to: "/members?status=unrenewed",
    },
    ...(showProducts
      ? [
          {
            id: "stock",
            count: data.attention_summary.low_stock,
            label: "Productos con pocas existencias",
            to: "/products?low_stock=1",
          },
        ]
      : []),
  ].filter((item) => item.count > 0);
}
