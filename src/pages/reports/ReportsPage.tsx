import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowUpRight,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Receipt,
  TrendingDown,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  fetchExport,
  useReportsRange,
  type ExportFormat,
  type ReportPeriod,
  type ReportsRangeData,
} from "@/hooks/useReports";
import { fmtMoney, type PaymentMethod } from "@/hooks/useBilling";
import { fmtDate } from "@/lib/dates";
import { downloadBlob } from "@/lib/tauri-bridge";
import { reports as t } from "@/strings/reports";
import { StatCard } from "@/components/shared/StatCard";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableTh,
  PageHeader,
  SectionCard,
} from "@/components/shared/PagePrimitives";

const METHOD_KEYS: PaymentMethod[] = ["cash", "transfer", "card"];
const CONCEPT_LABEL: Record<string, string> = {
  membership: "Mensualidad",
  product: "Producto",
  balance_settlement: "Abono",
  refund: "Devolución",
  other: "Otro",
};

const PERIODS: ReportPeriod[] = ["today", "week", "month", "last_month", "3_months", "year"];

const TOOLTIP_STYLE = {
  borderRadius: 8,
  fontSize: 12,
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  color: "hsl(var(--popover-foreground))",
};

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const range = useReportsRange(period);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={t.page.title}
        subtitle={t.page.subtitle}
        actions={
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger className="h-10 w-44">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p} value={p}>
                  {t.periods[p]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        }
      />

      {range.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {range.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.page.error}</AlertDescription>
        </Alert>
      )}

      {range.data && <ReportsContent data={range.data} period={period} />}

      <Link
        to="/reports/cash-close"
        className="inline-flex items-center gap-1 text-sm text-primary hover:underline"
      >
        Ver caja del día
        <ArrowUpRight className="h-3.5 w-3.5" />
      </Link>
    </div>
  );
}

function ReportsContent({ data, period }: { data: ReportsRangeData; period: ReportPeriod }) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);

  async function exportFile(format: ExportFormat) {
    setExporting(format);
    try {
      const res = await fetchExport("payments", format, { period });
      const filename = res.filename ?? `reporte-${period}-${data.from}_${data.to}.${format}`;
      downloadBlob(res.blob, filename);
      toast.success(t.page.exportSuccess);
    } catch {
      toast.error(t.page.exportError);
    } finally {
      setExporting(null);
    }
  }

  return (
    <>
      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t.kpis.income}
          value={fmtMoney(data.totals.income)}
          icon={CircleDollarSign}
          tone="success"
          hint={`${fmtDate(data.from)} — ${fmtDate(data.to)}`}
        />
        <StatCard
          title={t.kpis.newMembers}
          value={data.totals.new_members.toLocaleString("es-MX")}
          icon={UserPlus}
          tone="neutral"
          hint="altas en el período"
        />
        <StatCard
          title={t.kpis.checkins}
          value={data.totals.checkins.toLocaleString("es-MX")}
          icon={Users}
          tone="neutral"
          hint="entradas registradas"
        />
        <StatCard
          title={t.kpis.refunds}
          value={fmtMoney(data.totals.refunds)}
          icon={TrendingDown}
          tone={data.totals.refunds > 0 ? "danger" : "neutral"}
          hint="devoluciones"
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard title={t.charts.incomeByDay} description="Tendencia diaria">
          <ChartIncome data={data.income_by_day} />
        </SectionCard>

        <SectionCard title={t.charts.checkinsByDay} description="Entradas diarias">
          <ChartCheckins data={data.checkins_by_day} />
        </SectionCard>
      </div>

      {/* By payment method */}
      <SectionCard
        title={t.byMethod.title}
        description="Cómo se cobró durante el período"
        flush
      >
        <ul className="divide-y divide-border">
          {METHOD_KEYS.map((m) => {
            const value = data.income_by_method[m] ?? 0;
            const pct = data.totals.income > 0 ? (value / data.totals.income) * 100 : 0;
            return (
              <li
                key={m}
                className="flex items-center gap-4 px-6 py-4"
              >
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline justify-between gap-3">
                    <span className="text-sm font-medium text-foreground">
                      {t.byMethod[m]}
                    </span>
                    <span className="tabular text-sm font-bold text-foreground">
                      {fmtMoney(value)}
                    </span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary rounded-full transition-all"
                      style={{ width: `${pct}%` }}
                    />
                  </div>
                  <div className="flex items-baseline justify-between mt-1.5">
                    <span className="text-xs text-muted-foreground tabular">
                      {pct.toFixed(0)}% del total
                    </span>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </SectionCard>

      {/* Top members */}
      <SectionCard title={t.topMembers.title} description="Quiénes pagaron más en el período" flush>
        {data.top_members.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">{t.topMembers.empty}</p>
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh className="pl-6">{t.topMembers.columns.member}</DataTableTh>
              <DataTableTh className="text-right">
                {t.topMembers.columns.payments}
              </DataTableTh>
              <DataTableTh className="text-right pr-6">{t.topMembers.columns.total}</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {data.top_members.map((m, idx) => (
                <DataTableRow key={m.member_id}>
                  <DataTableCell className="pl-6">
                    <div className="flex items-center gap-3">
                      <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-muted text-xs font-bold text-muted-foreground tabular">
                        {idx + 1}
                      </span>
                      <span className="font-semibold text-foreground">{m.full_name}</span>
                    </div>
                  </DataTableCell>
                  <DataTableCell className="text-right text-muted-foreground tabular">
                    {t.topMembers.paymentsCount(m.payments_count)}
                  </DataTableCell>
                  <DataTableCell className="text-right pr-6 tabular font-bold text-foreground">
                    {fmtMoney(m.total_paid)}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>

      {/* Recent payments */}
      <SectionCard
        title={t.recentPayments.title}
        description="Últimos cobros registrados"
        flush
      >
        {data.recent_payments.length === 0 ? (
          <p className="text-sm text-muted-foreground py-8 text-center">
            {t.recentPayments.empty}
          </p>
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh className="pl-6">{t.recentPayments.columns.date}</DataTableTh>
              <DataTableTh>{t.recentPayments.columns.member}</DataTableTh>
              <DataTableTh className="hidden md:table-cell">
                {t.recentPayments.columns.concept}
              </DataTableTh>
              <DataTableTh className="hidden md:table-cell">
                {t.recentPayments.columns.method}
              </DataTableTh>
              <DataTableTh className="text-right pr-6">
                {t.recentPayments.columns.amount}
              </DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {data.recent_payments.slice(0, 25).map((p) => (
                <DataTableRow key={p.id}>
                  <DataTableCell className="pl-6 tabular text-muted-foreground">
                    {fmtDate(p.payment_date)}
                  </DataTableCell>
                  <DataTableCell className="font-semibold text-foreground">
                    {p.member_name}
                  </DataTableCell>
                  <DataTableCell className="hidden md:table-cell text-muted-foreground">
                    {CONCEPT_LABEL[p.concept] ?? p.concept}
                  </DataTableCell>
                  <DataTableCell className="hidden md:table-cell text-muted-foreground">
                    {p.payment_method ? t.byMethod[p.payment_method] : "—"}
                  </DataTableCell>
                  <DataTableCell className="text-right pr-6 tabular font-bold">
                    {p.amount < 0 ? (
                      <span className="text-destructive">{fmtMoney(p.amount)}</span>
                    ) : (
                      <span className="text-foreground">{fmtMoney(p.amount)}</span>
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>

      {/* Export actions */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Receipt className="h-3.5 w-3.5" />
          <span>
            {fmtDate(data.from)} — {fmtDate(data.to)}
          </span>
        </span>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => exportFile("pdf")}
            className="rounded-md"
          >
            {exporting === "pdf" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileText className="h-4 w-4" />
            )}
            {exporting === "pdf" ? t.page.exportingPdf : t.page.exportPdf}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={!!exporting}
            onClick={() => exportFile("xlsx")}
            className="rounded-md"
          >
            {exporting === "xlsx" ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <FileSpreadsheet className="h-4 w-4" />
            )}
            {exporting === "xlsx" ? t.page.exportingXlsx : t.page.exportXlsx}
          </Button>
          <Button variant="ghost" size="sm" disabled className="rounded-md">
            <Download className="h-4 w-4" />
          </Button>
        </div>
      </div>
    </>
  );
}

function ChartIncome({ data }: { data: { date: string; total: number }[] }) {
  if (data.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Sin ingresos en este período.
      </p>
    );
  return (
    <div className="h-56 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => format(parseISO(v), "d MMM", { locale: es })}
            fontSize={12}
            minTickGap={28}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            tickFormatter={(v) => fmtMoney(v).replace(".00", "")}
            fontSize={12}
            width={64}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v: number) => [fmtMoney(v), "Ingreso"]}
            labelFormatter={(v) => fmtDate(v as string)}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 4, fill: "hsl(var(--chart-1))" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartCheckins({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Sin check-ins en este período.
      </p>
    );
  return (
    <div className="h-56 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
          <CartesianGrid
            strokeDasharray="3 3"
            stroke="hsl(var(--border))"
            vertical={false}
          />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => format(parseISO(v), "d MMM", { locale: es })}
            fontSize={12}
            minTickGap={28}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
          />
          <YAxis
            fontSize={12}
            allowDecimals={false}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
            width={32}
          />
          <Tooltip
            labelFormatter={(v) => fmtDate(v as string)}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          />
          <Bar dataKey="count" fill="hsl(var(--chart-2))" radius={[6, 6, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
