import type { ReactNode } from "react";
import { Link } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/PagePrimitives";
import { RestrictedNote } from "@/components/shared/RestrictedNote";
import { ReportHelp } from "@/components/reports/ReportContent";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { usePermission } from "@/lib/permissions";
import type { DashboardData, KpiTrend } from "@/hooks/useReports";
import { fmtDate } from "@/lib/dates";
import {
  dashboardWindow,
  recentIncomeLink,
  type ReviewItem,
} from "@/lib/dashboard";
import { financialIntegrityWarningLabel } from "@/strings/financialWarnings";
import { dashboard as t } from "@/strings/dashboard";

export function LoadError({
  children,
  retry,
  busy = false,
}: {
  children: ReactNode;
  retry(): unknown;
  busy?: boolean;
}) {
  return (
    <div
      role="alert"
      className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-warning/40 bg-warning-soft p-3 text-sm"
    >
      <span>{children}</span>
      <Button
        size="sm"
        variant="outline"
        disabled={busy}
        onClick={() => void retry()}
      >
        Reintentar
      </Button>
    </div>
  );
}

function Change({
  metric,
  money = false,
}: {
  metric?: KpiTrend;
  money?: boolean;
}) {
  const visibility = useMoneyVisibility();
  if (!metric || (money && visibility.hidden)) return null;
  const value =
    metric.delta_pct != null
      ? `${metric.delta_pct > 0 ? "+" : ""}${metric.delta_pct.toFixed(0)}%`
      : metric.delta != null
        ? `${metric.delta > 0 ? "+" : ""}${money ? visibility.fmt(metric.delta) : metric.delta}`
        : null;
  return value ? (
    <span className="text-xs tabular-nums text-muted-foreground">{value}</span>
  ) : null;
}

export function MonthSummary({
  data,
  day,
}: {
  data: DashboardData;
  day?: string;
}) {
  const money = useMoneyVisibility();
  const window = dashboardWindow(data, day);
  const income = data.income_month,
    outflows = data.expenses_month;
  const result =
    data.period_result_month ??
    (income && outflows
      ? {
          value: Math.round((income.value - outflows.value) * 100) / 100,
          delta:
            income.delta != null && outflows.delta != null
              ? income.delta - outflows.delta
              : null,
          delta_pct: null,
        }
      : undefined);
  const partial = data.integrity?.status === "incomplete";
  return (
    <SectionCard
      appearance="plain"
      title="Este mes"
      className="[container-type:inline-size]"
      description={
        day ? `${fmtDate(day.slice(0, 8) + "01")} — ${fmtDate(day)}` : undefined
      }
      action={
        <Link
          className="text-sm text-primary hover:underline"
          to="/reports?period=month"
        >
          Ver reportes
        </Link>
      }
    >
      {partial && (
        <p
          role="status"
          className="mb-3 rounded-lg bg-warning-soft p-3 text-sm"
        >
          {financialIntegrityWarningLabel(data.integrity?.warnings?.[0])}{" "}
          <Link className="font-medium underline" to="/reports?period=month">
            Ver movimientos por revisar
          </Link>
        </p>
      )}
      <dl className="divide-y [@container(min-width:32rem)]:grid [@container(min-width:32rem)]:grid-cols-3 [@container(min-width:32rem)]:gap-5 [@container(min-width:32rem)]:divide-y-0">
        {[
          { label: "Ingresos", metric: income },
          { label: "Salidas", metric: outflows },
          {
            label: partial ? "Resultado parcial" : "Resultado",
            metric: result,
          },
        ].map(({ label, metric }, i) => (
          <div
            key={label}
            className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 py-3 [@container(min-width:32rem)]:block [@container(min-width:32rem)]:py-1"
          >
            <dt className="flex items-center gap-1 text-sm text-muted-foreground">
              {label}
              {i === 2 && (
                <ReportHelp title="Resultado">
                  Ingresos menos gastos pagados, compras pagadas y devoluciones.
                  Los pagos pendientes aún no se descuentan. No es el efectivo
                  disponible en caja.
                </ReportHelp>
              )}
            </dt>
            <dd className="max-w-full text-right [@container(min-width:32rem)]:text-left">
              <span
                className="block break-words font-display tabular text-xl [@container(min-width:32rem)]:mt-2 [@container(min-width:32rem)]:text-2xl"
              >
                {metric == null ? "No disponible" : money.fmt(metric.value)}
              </span>
              <Change metric={metric} money />
            </dd>
          </div>
        ))}
      </dl>
      {window && (
        <p className="mt-3 text-xs text-muted-foreground">
          Comparado con {fmtDate(window.from)} — {fmtDate(window.to)}
        </p>
      )}
      {day && (
        <Link
          to={recentIncomeLink(day)}
          className="mt-3 inline-block text-sm text-primary hover:underline"
        >
          Ver ingresos de los últimos 30 días
        </Link>
      )}
    </SectionCard>
  );
}

export function TodaySummary({
  data,
  day,
  onEntries,
}: {
  data: DashboardData;
  day?: string;
  onEntries(): void;
}) {
  return (
    <div className="flex flex-wrap items-center gap-x-8 gap-y-2 border-y py-2 text-sm" aria-label="Actividad del gimnasio">
      <Link to="/members?status=active" className="inline-flex min-h-11 items-center gap-2 hover:underline">
        <strong className="font-display tabular text-base">{data.active_members.value.toLocaleString("es-MX")}</strong>
        <span className="text-muted-foreground">socios activos</span>
      </Link>
      <button type="button" onClick={onEntries} disabled={!day} className="inline-flex min-h-11 items-center gap-2 hover:underline disabled:opacity-60">
        <strong className="font-display tabular text-base">{data.checkins_today == null ? "—" : data.checkins_today.toLocaleString("es-MX")}</strong>
        <span className="text-muted-foreground">entradas hoy</span>
        <ChevronRight aria-hidden="true" className="h-4 w-4" />
      </button>
    </div>
  );
}

export function ReviewList({
  items,
  notices,
}: {
  items: ReviewItem[];
  notices?: ReactNode;
}) {
  const money = useMoneyVisibility();

  return (
    <SectionCard appearance="plain" title="Por revisar" flush>
      {!items.length && !notices && <p className="py-3 text-sm text-muted-foreground">No hay pendientes por revisar.</p>}
      <ul className="divide-y">
        {items.map((item) => (
          <li key={item.id}>
            <Link
              to={item.to}
              className="flex items-center gap-4 px-1 py-4 hover:bg-muted/40 focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="w-12 shrink-0 text-right font-display tabular text-xl">
                {item.count}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-sm font-medium">{item.label}</span>
                {item.detail && (
                  <span className="block text-xs text-muted-foreground">
                    {item.detail}
                  </span>
                )}
                {item.amount != null && (
                  <span className="block break-words text-sm tabular-nums font-medium">
                    {money.fmt(item.amount)}
                  </span>
                )}
              </span>
              <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          </li>
        ))}
      </ul>
      {notices && <div className="space-y-2 py-3">{notices}</div>}
    </SectionCard>
  );
}

const METHODS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
};
const CONCEPTS: Record<string, string> = {
  membership: "Membresía",
  product: "Producto",
  balance_settlement: "Abono",
  refund: "Devolución",
  other: "Otro ingreso",
};
export function RecentPayments({
  data,
  incomePath,
}: {
  data: DashboardData;
  incomePath: string;
}) {
  const money = useMoneyVisibility();
  // Without "view_totals" the backend only returns today's payments: say so
  // in the title and the empty state instead of "nothing recent".
  const allDays = usePermission("view_totals");
  return (
    <SectionCard
      appearance="plain"
      title={allDays ? t.recentPayments.title : t.recentPayments.todayTitle}
      className="self-stretch"
      action={
        <Link
          to={incomePath}
          className="inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-primary hover:underline"
        >
          Ver ingresos
          {/* Navegación interna: chevron, como «Por revisar». La flecha
              diagonal queda para lo que abre fuera de Tinta. */}
          <ChevronRight aria-hidden="true" className="h-4 w-4" />
        </Link>
      }
      flush
    >
      {!data.recent_payments?.length ? (
        <p className="py-3 text-sm text-muted-foreground">
          {allDays ? t.recentPayments.empty : t.recentPayments.todayEmpty}
        </p>
      ) : (
        <ul className="divide-y">
          {data.recent_payments.slice(0, 5).map((payment) => (
            <li
              key={payment.id}
              className="flex flex-wrap items-start justify-between gap-x-3 gap-y-1 py-3"
            >
              <div className="min-w-0 flex-1 basis-36">
                <p className="break-words text-sm font-medium">
                  {payment.member_name ||
                    payment.sale_summary ||
                    (payment.concept === "other"
                      ? "Otro ingreso"
                      : "Venta de mostrador")}
                </p>
                <p className="mt-1 text-xs text-muted-foreground">
                  {CONCEPTS[payment.concept] ?? "Cobro"} ·{" "}
                  {METHODS[payment.payment_method ?? ""] ?? "Sin método"}
                </p>
                <p className="text-xs text-muted-foreground">
                  {fmtDate(payment.payment_date)}
                </p>
              </div>
              <span className="max-w-full break-words font-display tabular text-sm">
                {money.fmt(payment.amount)}
              </span>
            </li>
          ))}
        </ul>
      )}
      {!allDays && (
        <RestrictedNote permission="view_totals" className="border-t pt-3">
          {t.recentPayments.otherDaysRestricted}
        </RestrictedNote>
      )}
    </SectionCard>
  );
}

export function DashboardSkeleton() {
  return (
    <div role="status" aria-label="Cargando resumen" className="space-y-4">
      <p className="text-sm text-muted-foreground">Cargando actividad…</p>
      <div className="skeleton h-12 rounded-md" />
      <div className="skeleton h-36 rounded-md" />
    </div>
  );
}
