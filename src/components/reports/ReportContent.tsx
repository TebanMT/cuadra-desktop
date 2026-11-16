import { CheckinHistoryDialog } from "./CheckinHistoryDialog";
import { useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { ChevronRight, HelpCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { SectionCard } from "@/components/shared/PagePrimitives";
import { FinancialNotice } from "./FinancialNotice";
import { BreakdownList } from "./ReportWidget";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import {
  useDashboard,
  type ReportsRangeData,
  type KpiTrend,
} from "@/hooks/useReports";
import { useMemberStatusCounts } from "@/hooks/useMembers";
import { reportSummary } from "@/lib/report-summary";
import {
  comparisonDates,
  reportBuckets,
  reportLink,
  type ReportView,
} from "@/lib/report-period";
import { fmtDate } from "@/lib/dates";
import { reports as rt } from "@/strings/reports";
import { api } from "@/lib/api";
import {
  CHART_COLORS,
  CHART_MARGINS,
  GRID_PROPS,
  X_AXIS_PROPS,
  Y_AXIS_PROPS,
  TOOLTIP_STYLE,
} from "./chart";

export interface ReportPaths {
  income: string;
  cash: string;
  analysis: string;
}
const METHODS: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
};
const CATEGORIES: Record<string, string> = {
  renta: "Renta",
  servicios: "Servicios",
  nomina: "Nómina",
  sueldos: "Nómina",
  mantenimiento: "Mantenimiento",
  marketing: "Publicidad y promoción",
  insumos_no_inventariables: "Materiales de uso interno",
  mercaderia_externa: "Materiales de uso interno",
  impuestos_y_permisos: "Impuestos y permisos",
  otros: "Otros",
};

export function ReportHelp({
  title,
  children,
}: {
  title: string;
  children: ReactNode;
}) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={`Qué es ${title}`}
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring"
        >
          <HelpCircle className="h-4 w-4" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-72 text-sm" sideOffset={8}>
        {children}
      </PopoverContent>
    </Popover>
  );
}

/** La comparación siempre lleva cifra: «+12% · antes $10,500». Sin dato
 * del período anterior no se muestra nada (nunca un porcentaje suelto). */
function Delta({
  metric,
  monetary = true,
}: {
  metric?: KpiTrend;
  monetary?: boolean;
}) {
  const money = useMoneyVisibility();
  if ((monetary && money.hidden) || metric?.delta == null) return null;
  const previous = metric.value - metric.delta;
  const shown = monetary
    ? money.fmt(previous)
    : previous.toLocaleString("es-MX");
  const pct =
    metric.delta_pct == null
      ? null
      : `${metric.delta_pct > 0 ? "+" : ""}${metric.delta_pct.toFixed(0)}%`;
  return (
    <span className="block text-xs tabular text-muted-foreground">
      {pct && <>{pct} · </>}antes {shown}
    </span>
  );
}

function hasComparison(metrics: (KpiTrend | undefined)[]) {
  return metrics.some((metric) => metric?.delta != null);
}

/** Explica a qué período se refiere «antes». Si ninguna cifra trae
 * comparación, desaparece. */
function ComparisonCaption({
  data,
  metrics,
  monetary = true,
}: {
  data: ReportsRangeData;
  metrics: (KpiTrend | undefined)[];
  monetary?: boolean;
}) {
  const money = useMoneyVisibility();
  if ((monetary && money.hidden) || !hasComparison(metrics)) return null;
  const previous = comparisonDates(data);
  return (
    <p className="text-xs text-muted-foreground">
      «Antes» es el período del {fmtDate(previous.from)} al {fmtDate(previous.to)}.
    </p>
  );
}

export function FinancialSummary({
  data,
  paths,
}: {
  data: ReportsRangeData;
  paths: ReportPaths;
}) {
  const money = useMoneyVisibility(),
    s = reportSummary(data);
  const fmt = (value?: number) =>
    value == null ? "No disponible" : money.fmt(value);
  const integrity = data.integrity;
  const resultLabel = s.resultIsPartial ? "Resultado parcial" : "Resultado";
  const incomeRows = [
    { label: "Membresías", value: s.membershipIncome?.value },
    {
      label: "Productos",
      value: s.productIncome?.value,
      metric: s.productIncome,
    },
    {
      label: "Otros ingresos",
      value: s.otherIncome?.value,
      metric: s.otherIncome,
    },
    ...((s.unclassifiedIncome?.value ?? 0) !== 0
      ? [{ label: "Cobros por clasificar", value: s.unclassifiedIncome?.value }]
      : []),
  ];
  const expenseRows = [
    {
      label: "Gastos de operación",
      value: s.operatingExpenses?.value,
      metric: s.operatingExpenses,
    },
    {
      label: "Compras pagadas",
      value: s.inventoryPurchases?.value,
      metric: s.inventoryPurchases,
    },
    { label: "Devoluciones", value: s.refunds?.value, metric: s.refunds },
  ];
  return (
    <div className="space-y-4">
      <FinancialNotice
        count={
          integrity?.missing_purchase_amount_count ??
          integrity?.legacy_purchase_count ??
          integrity?.legacy_unlinked_purchases ??
          0
        }
        warnings={[
          ...(integrity?.warnings ?? []),
          ...(integrity?.issues ?? []),
        ]}
        incomplete={
          !s.hasCanonicalSummary ||
          integrity?.status === "incomplete" ||
          !integrity
        }
        mismatch={
          s.formulaDifference != null && Math.abs(s.formulaDifference) >= 0.01
        }
        from={data.from}
        to={data.to}
      />
      {/* Orden de lectura = orden visual: Ingresos − Salidas = Resultado.
          Un lector de pantalla no debe oír el resultado antes que sus partes. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <section
          className="min-w-0 rounded-xl border bg-card p-4"
          aria-label="Ingresos"
        >
          <h2 className="text-sm font-medium">Ingresos</h2>
          <p className="mt-2 break-words font-display text-xl tabular sm:text-2xl">
            {fmt(s.income.value)}
          </p>
          <Delta metric={s.income} />
        </section>
        <section
          className="min-w-0 rounded-xl border bg-card p-4"
          aria-label="Salidas"
        >
          <h2 className="text-sm font-medium">Salidas</h2>
          <p className="mt-2 break-words font-display text-xl tabular sm:text-2xl">
            {fmt(s.outflows?.value)}
          </p>
          <Delta metric={s.outflows} />
        </section>
        <section
          className="col-span-2 min-w-0 rounded-xl border bg-card p-4 md:col-span-1"
          aria-label={resultLabel}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-sm font-medium">{resultLabel}</h2>
            <ReportHelp title="Resultado">
              Ingresos menos gastos pagados, compras pagadas y devoluciones. Los
              pagos pendientes aún no se descuentan.
            </ReportHelp>
          </div>
          <p
            className={`mt-1 break-words font-display text-3xl tabular ${s.resultIsPartial ? "text-warning-foreground" : (s.periodResult?.value ?? 0) < 0 ? "text-destructive" : "text-foreground"}`}
          >
            {fmt(s.periodResult?.value)}
          </p>
          {s.resultIsPartial ? (
            <p className="mt-2 text-xs text-muted-foreground">
              Faltan importes por registrar
            </p>
          ) : (
            <Delta metric={s.periodResult} />
          )}
        </section>
      </div>
      <ComparisonCaption
        data={data}
        metrics={[s.income, s.outflows, s.resultIsPartial ? undefined : s.periodResult]}
      />
      <div className="grid gap-4 md:grid-cols-2">
        <Breakdown title="Ingresos" rows={incomeRows} fmt={fmt}>
          <ReportLink to={reportLink(paths.income, data.from, data.to)}>
            Ver ingresos
          </ReportLink>
        </Breakdown>
        <Breakdown title="Salidas" rows={expenseRows} fmt={fmt}>
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            <ReportLink
              to={reportLink("/expenses", data.from, data.to, {
                view: "movements",
              })}
            >
              Ver gastos
            </ReportLink>
            <ReportLink
              to={reportLink("/expenses", data.from, data.to, {
                view: "purchases",
              })}
            >
              Ver compras
            </ReportLink>
            <ReportLink
              to={reportLink(paths.income, data.from, data.to, {
                concept: "refund",
              })}
            >
              Ver devoluciones
            </ReportLink>
          </div>
        </Breakdown>
      </div>
    </div>
  );
}

export function ReportLink({
  to,
  children,
}: {
  to: string;
  children: ReactNode;
}) {
  return (
    <Link
      className="inline-flex min-h-11 items-center gap-0.5 text-sm font-medium text-primary hover:underline"
      to={to}
    >
      {children}
      <ChevronRight aria-hidden className="h-4 w-4 shrink-0" />
    </Link>
  );
}

function Breakdown({
  title,
  rows,
  fmt,
  children,
}: {
  title: string;
  rows: { label: string; value?: number; metric?: KpiTrend }[];
  fmt(value?: number): string;
  children?: ReactNode;
}) {
  return (
    <section className="rounded-xl border bg-card p-4">
      <h3 className="mb-2 text-sm font-semibold">{title}</h3>
      <dl className="divide-y">
        {rows.map((row) => (
          <div
            key={row.label}
            className="flex items-baseline justify-between gap-3 py-2 text-sm"
          >
            <dt className="text-muted-foreground">{row.label}</dt>
            <dd className="shrink-0 text-right font-medium tabular">
              <div>{fmt(row.value)}</div>
              <Delta metric={row.metric} />
            </dd>
          </div>
        ))}
      </dl>
      {children && <div className="mt-2 border-t pt-2">{children}</div>}
    </section>
  );
}

export function ReportContent({
  data,
  view,
  paths,
}: {
  data: ReportsRangeData;
  view: ReportView;
  paths: ReportPaths;
}) {
  const money = useMoneyVisibility();
  const s = reportSummary(data);
  const fmt = (value: number) => money.fmt(value);
  if (view === "members")
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <NumberCard
            label="Socios nuevos"
            value={data.totals.new_members.value.toLocaleString("es-MX")}
            metric={data.totals.new_members}
          />
          <NumberCard
            label="Asistencias"
            value={data.totals.checkins.value.toLocaleString("es-MX")}
            metric={data.totals.checkins}
          />
        </div>
        <ComparisonCaption
          data={data}
          metrics={[data.totals.new_members, data.totals.checkins]}
          monetary={false}
        />
        <ReportTrend
          key="attendance"
          data={data}
          kind="attendance"
          paths={paths}
        />
        <CurrentMembers data={data} />
        <SectionCard title="Cobros por membresía">
          <SimpleBreakdown
            map={data.income_by_membership_type}
            fmt={fmt}
            empty="Sin cobros de membresías en este período."
          />
        </SectionCard>
      </div>
    );
  if (view === "products")
    return (
      <div className="space-y-5">
        <div className="grid grid-cols-2 gap-3">
          <NumberCard
            label="Unidades vendidas"
            value={
              data.product_sales?.units.toLocaleString("es-MX") ??
              "No disponible"
            }
          />
          <NumberCard
            label="Ingresos por productos"
            metric={s.productIncome}
            monetary
            value={
              s.productIncome ? fmt(s.productIncome.value) : "No disponible"
            }
          />
        </div>
        <ComparisonCaption data={data} metrics={[s.productIncome]} />
        <SectionCard
          title="Productos con más ingresos"
          description="Ordenados por cobros del período, incluidos abonos."
        >
          {data.top_products.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Sin ventas de productos en este período.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left text-muted-foreground">
                    <th className="pb-3 font-medium">Producto</th>
                    <th className="pb-3 text-right font-medium">Unidades</th>
                    <th className="pb-3 pl-3 text-right font-medium">
                      Ingresos
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.top_products.map((row) => (
                    <tr key={row.product_id} className="border-b last:border-0">
                      <td className="py-3 pr-3">{row.product_name}</td>
                      <td className="text-right tabular">{row.quantity}</td>
                      <td className="pl-3 text-right font-medium tabular">
                        {fmt(row.revenue)}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          <ReportLink to={reportLink(paths.income, data.from, data.to)}>
            Ver movimientos
          </ReportLink>
        </SectionCard>
        {data.critical_stock && (
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
            <div>
              {/* Mismo nombre y filtro que Inicio y Productos: «Por surtir». */}
              <h3 className="text-sm font-semibold">{rt.kpis.criticalStock} hoy</h3>
              <p className="mt-1 text-sm tabular text-muted-foreground">
                {rt.kpis.criticalStockHint(
                  data.critical_stock.out_count,
                  data.critical_stock.low_count,
                )}
              </p>
            </div>
            <ReportLink to="/products?low_stock=1">Ver productos por surtir</ReportLink>
          </div>
        )}
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-card p-4">
          <span className="text-sm">Ganancia de productos</span>
          <ReportLink
            to={reportLink(paths.analysis, data.from, data.to, {
              view: "products",
            })}
          >
            Ver análisis
          </ReportLink>
        </div>
      </div>
    );
  const cash = data.cash_reconciliation;
  const stale =
    cash?.status === "stale" ||
    cash?.latest_needs_recount ||
    (cash?.stale_sessions ?? 0) > 0;
  const attention =
    stale ||
    (cash?.requires_attention ??
      ((cash?.uncovered_activity_days ?? 0) > 0 ||
        (cash?.open_sessions ?? 0) > 0 ||
        (cash?.legacy_cash_source_unverified_count ?? 0) > 0));
  return (
    <div className="space-y-5">
      <FinancialSummary data={data} paths={paths} />
      <ReportTrend key="money" data={data} kind="money" paths={paths} />
      <div className="grid gap-4 md:grid-cols-2">
        <SectionCard title="Métodos de pago">
          <SimpleBreakdown
            map={data.income_by_method}
            labels={METHODS}
            fmt={fmt}
            empty="Sin ingresos en este período."
          />
        </SectionCard>
        <SectionCard title="Gastos por categoría">
          <SimpleBreakdown
            map={data.expenses_by_category}
            labels={CATEGORIES}
            fmt={fmt}
            empty="Sin gastos en este período."
          />
        </SectionCard>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-xl border bg-card px-4 py-2">
        <p className="text-sm">
          {stale
            ? "Hay cortes que requieren otra revisión."
            : attention
              ? "Hay movimientos de caja por revisar."
              : "Caja del período"}
        </p>
        <ReportLink to={reportLink(paths.cash, data.from, data.to)}>
          Ver caja
        </ReportLink>
      </div>
    </div>
  );
}

function NumberCard({
  label,
  value,
  metric,
  monetary = false,
}: {
  label: string;
  value: string;
  metric?: KpiTrend;
  monetary?: boolean;
}) {
  return (
    <section className="min-w-0 rounded-xl border bg-card p-4">
      <h2 className="text-sm text-muted-foreground">{label}</h2>
      <p className="mt-2 break-words font-display text-2xl tabular">{value}</p>
      <Delta metric={metric} monetary={monetary} />
    </section>
  );
}

function SimpleBreakdown({
  map,
  labels = {},
  fmt,
  empty,
}: {
  map: Record<string, number>;
  labels?: Record<string, string>;
  fmt(value: number): string;
  empty: string;
}) {
  const rows = Object.entries(map ?? {})
    .filter(([, value]) => value !== 0)
    .sort((a, b) => b[1] - a[1])
    .map(([key, value]) => ({ key, label: labels[key] ?? key, value }));
  return rows.length ? (
    <BreakdownList rows={rows} fmtValue={fmt} />
  ) : (
    <p className="text-sm text-muted-foreground">{empty}</p>
  );
}

function CurrentMembers({ data }: { data: ReportsRangeData }) {
  const current = useDashboard();
  const counts = useMemberStatusCounts();
  const [profile, setProfile] = useState(false);
  return (
    <SectionCard
      title="Socios hoy"
      description="Estado actual; no cambia con el período."
    >
      {current.isLoading ? (
        <p role="status" className="text-sm">
          Cargando socios…
        </p>
      ) : current.isError ? (
        <p role="alert" className="text-sm">
          No pudimos cargar los socios.{" "}
          <Button variant="link" onClick={() => current.refetch()}>
            Reintentar
          </Button>
        </p>
      ) : (
        current.data && (
          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <span className="text-lg font-semibold">
              {current.data.active_members.value} activos
            </span>
            <ReportLink to="/members?status=active">Ver socios</ReportLink>
          </div>
        )
      )}
      <div className="mb-4 grid gap-2 sm:grid-cols-3">
        {[
          {
            label: "Por vencer",
            value: counts.data?.expiring_soon,
            status: "expiring_soon",
          },
          // Mismo conteo y nombre que el filtro de Socios: vencidos, sin
          // primer pago y sin membresía.
          { label: "Sin vigencia", value: counts.data?.expired, status: "expired" },
          {
            label: "Con saldo",
            value: current.data?.attention_summary?.pending_balance,
            status: "balance",
          },
        ].map((item) => (
          <Link
            key={item.status}
            to={`/members?status=${item.status}`}
            className="flex min-h-11 items-center justify-between gap-3 rounded-lg bg-muted/40 px-3 text-sm hover:bg-muted"
          >
            <span>{item.label}</span>
            <span className="font-semibold tabular">
              {item.value?.toLocaleString("es-MX") ?? "—"}
            </span>
          </Link>
        ))}
      </div>
      {counts.isError && (
        <p role="alert" className="mb-3 text-sm">
          No pudimos cargar los vencimientos.{" "}
          <Button variant="link" onClick={() => counts.refetch()}>
            Reintentar
          </Button>
        </p>
      )}
      <h3 className="mb-2 text-sm font-medium">Activos por membresía</h3>
      <SimpleBreakdown
        map={data.members_by_membership_type}
        fmt={(value) => value.toLocaleString("es-MX")}
        empty="Sin socios activos."
      />
      <Button
        variant="link"
        className="mt-3 px-0"
        aria-expanded={profile}
        onClick={() => setProfile(!profile)}
      >
        {profile
          ? "Ocultar distribución por género"
          : "Ver distribución por género"}
      </Button>
      {profile && <GenderReport />}
    </SectionCard>
  );
}

function GenderReport() {
  const query = useQuery<{
    days_back: number;
    composition: { hombre: number; mujer: number; no_especificado: number };
    by_hour: {
      hour: number;
      hombre: number;
      mujer: number;
      no_especificado: number;
    }[];
  }>({
    queryKey: ["reports", "gender"],
    queryFn: () => api.get("/api/v1/reports/gender"),
    staleTime: 60_000,
  });
  if (query.isLoading) return <p role="status">Cargando…</p>;
  if (query.isError)
    return (
      <p role="alert">
        No pudimos cargar la distribución.{" "}
        <Button variant="link" onClick={() => query.refetch()}>
          Reintentar
        </Button>
      </p>
    );
  if (!query.data) return null;
  const { composition, by_hour, days_back } = query.data;
  return (
    <div className="space-y-4 border-t pt-4">
      <SimpleBreakdown
        map={{
          hombre: composition.hombre,
          mujer: composition.mujer,
          no_especificado: composition.no_especificado,
        }}
        labels={{
          hombre: "Hombres",
          mujer: "Mujeres",
          no_especificado: "Sin especificar",
        }}
        fmt={(n) => String(n)}
        empty="Sin socios activos."
      />
      <h3 className="text-sm font-medium">
        Asistencias por hora · últimos {days_back} días
      </h3>
      <div className="h-56">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={by_hour} margin={CHART_MARGINS}>
            <CartesianGrid {...GRID_PROPS} />
            <XAxis
              dataKey="hour"
              tickFormatter={(h) => `${h} h`}
              {...X_AXIS_PROPS}
            />
            <YAxis {...Y_AXIS_PROPS} allowDecimals={false} />
            <Tooltip contentStyle={TOOLTIP_STYLE} />
            <Legend />
            <Bar
              isAnimationActive={false}
              dataKey="hombre"
              name="Hombres"
              fill="hsl(var(--primary))"
            />
            <Bar
              isAnimationActive={false}
              dataKey="mujer"
              name="Mujeres"
              fill="hsl(var(--chart-4))"
            />
            <Bar
              isAnimationActive={false}
              dataKey="no_especificado"
              name="Sin especificar"
              fill="hsl(var(--muted-foreground))"
            />
          </BarChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}

export function ReportTrend({
  data,
  kind,
  paths,
}: {
  data: ReportsRangeData;
  kind: "money" | "attendance";
  paths: ReportPaths;
}) {
  const [detail, setDetail] = useState(false),
    money = useMoneyVisibility();
  const [attendance, setAttendance] = useState<{
    from: string;
    to: string;
  } | null>(null);
  const series = reportBuckets(
    data.from,
    data.to,
    data.income_by_day,
    data.expenses_by_day,
    data.checkins_by_day,
  );
  const monetary = kind === "money";
  const period = series.monthly ? "mes" : "día";
  const hasData = series.rows.some((row) =>
    monetary ? row.income !== 0 || row.outflows !== 0 : row.count !== 0,
  );
  const fmt = (value: number) =>
    monetary
      ? money.fmt(value).replace(/\.00$/, "")
      : value.toLocaleString("es-MX");
  return (
    <SectionCard
      title={`${monetary ? "Ingresos y salidas" : "Asistencias"} por ${period}`}
    >
      {attendance && (
        <CheckinHistoryDialog
          key={`${attendance.from}:${attendance.to}`}
          {...attendance}
          onClose={() => setAttendance(null)}
        />
      )}
      {!hasData ? (
        <p className="py-10 text-center text-sm text-muted-foreground">
          {monetary ? "Sin movimientos" : "Sin asistencias"} en este período.
        </p>
      ) : (
        <>
          <div className="h-56 sm:h-64">
            <ResponsiveContainer width="100%" height="100%">
              {/* Datos por día o por mes: barras, no línea. Una barra por
                  período se lee como «cuánto ese día»; la línea sugiere una
                  continuidad que no existe. */}
              <BarChart
                data={series.rows}
                margin={CHART_MARGINS}
                barGap={2}
                barCategoryGap="24%"
              >
                <CartesianGrid {...GRID_PROPS} />
                <XAxis dataKey="label" {...X_AXIS_PROPS} />
                <YAxis
                  {...Y_AXIS_PROPS}
                  width={65}
                  tickFormatter={fmt}
                  allowDecimals={monetary}
                />
                <Tooltip
                  contentStyle={TOOLTIP_STYLE}
                  cursor={{ fill: "hsl(var(--muted) / 0.6)" }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                  formatter={(value: number) => fmt(value)}
                />
                {monetary && (
                  <Legend iconType="square" wrapperStyle={{ fontSize: 12 }} />
                )}
                {monetary ? (
                  <>
                    <Bar
                      isAnimationActive={false}
                      dataKey="income"
                      name="Ingresos"
                      fill="hsl(var(--primary))"
                      radius={[2, 2, 0, 0]}
                      maxBarSize={28}
                    />
                    <Bar
                      isAnimationActive={false}
                      dataKey="outflows"
                      name="Salidas"
                      fill={CHART_COLORS.danger}
                      radius={[2, 2, 0, 0]}
                      maxBarSize={28}
                    />
                  </>
                ) : (
                  <Bar
                    isAnimationActive={false}
                    dataKey="count"
                    name="Asistencias"
                    fill="hsl(var(--primary))"
                    radius={[2, 2, 0, 0]}
                    maxBarSize={32}
                  />
                )}
              </BarChart>
            </ResponsiveContainer>
          </div>
          <Button
            variant="link"
            className="px-0"
            aria-expanded={detail}
            onClick={() => setDetail(!detail)}
          >
            {detail ? "Ocultar detalle" : `Ver detalle por ${period}`}
          </Button>
          {detail && (
            <div className="max-h-96 overflow-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-left">
                    <th className="py-2 font-medium">
                      {series.monthly ? "Mes" : "Fecha"}
                    </th>
                    <th className="py-2 text-right font-medium">
                      {monetary ? "Ingresos" : "Asistencias"}
                    </th>
                    {monetary && (
                      <th className="py-2 text-right font-medium">Salidas</th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {series.rows.map((row) => (
                    <tr key={row.date} className="border-b">
                      <td className="py-2 pr-3">{row.label}</td>
                      <td className="text-right tabular">
                        {monetary ? (
                          <Link
                            className="inline-flex min-h-10 items-center text-primary underline"
                            aria-label={`Ver ingresos de ${row.label}`}
                            to={reportLink(paths.income, row.from, row.to)}
                          >
                            {fmt(row.income)}
                          </Link>
                        ) : (
                          <Button
                            variant="link"
                            aria-label={`Ver asistencias de ${row.label}`}
                            onClick={() =>
                              setAttendance({ from: row.from, to: row.to })
                            }
                          >
                            {row.count}
                          </Button>
                        )}
                      </td>
                      {monetary && (
                        <td className="text-right tabular">
                          <span>{fmt(row.outflows)}</span>
                          <div className="flex justify-end gap-2 text-xs">
                            <Link
                              className="text-primary underline"
                              to={reportLink("/expenses", row.from, row.to, {
                                view: "movements",
                              })}
                            >
                              Gastos
                            </Link>
                            <Link
                              className="text-primary underline"
                              to={reportLink("/expenses", row.from, row.to, {
                                view: "purchases",
                              })}
                            >
                              Compras
                            </Link>
                            <Link
                              className="text-primary underline"
                              to={reportLink(paths.income, row.from, row.to, {
                                concept: "refund",
                              })}
                            >
                              Devoluciones
                            </Link>
                          </div>
                        </td>
                      )}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
