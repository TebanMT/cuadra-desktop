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
import { Download, FileSpreadsheet, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
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
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
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

const METHOD_KEYS: PaymentMethod[] = ["cash", "transfer", "card"];
const CONCEPT_LABEL: Record<string, string> = {
  membership: "Mensualidad",
  product: "Producto",
  balance_settlement: "Abono",
  refund: "Devolución",
  other: "Otro",
};

const PERIODS: ReportPeriod[] = [
  "today",
  "week",
  "month",
  "last_month",
  "3_months",
  "year",
];

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("month");
  const range = useReportsRange(period);

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.page.title}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t.page.subtitle}</p>
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{t.page.periodLabel}:</span>
          <Select value={period} onValueChange={(v) => setPeriod(v as ReportPeriod)}>
            <SelectTrigger className="h-9 w-44">
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
        </div>
      </div>

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

      <Link to="/reports/cash-close" className="text-sm text-primary hover:underline">
        Ver caja del día →
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
      const filename =
        res.filename ?? `reporte-${period}-${data.from}_${data.to}.${format}`;
      downloadBlob(res.blob, filename);
      toast.success(t.page.exportSuccess);
    } catch {
      toast.error(t.page.exportError);
    } finally {
      setExporting(null);
    }
  }

  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t.kpis.income} value={fmtMoney(data.totals.income)} />
        <KpiCard
          label={t.kpis.newMembers}
          value={data.totals.new_members.toLocaleString("es-MX")}
        />
        <KpiCard
          label={t.kpis.checkins}
          value={data.totals.checkins.toLocaleString("es-MX")}
        />
        <KpiCard
          label={t.kpis.refunds}
          value={fmtMoney(data.totals.refunds)}
          variant="destructive"
        />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <Card>
          <CardContent className="pt-5 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {t.charts.incomeByDay}
            </h2>
            <ChartIncome data={data.income_by_day} />
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-5 pb-5">
            <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
              {t.charts.checkinsByDay}
            </h2>
            <ChartCheckins data={data.checkins_by_day} />
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardContent className="pt-5 pb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            {t.byMethod.title}
          </h2>
          <div className="space-y-2">
            {METHOD_KEYS.map((m) => (
              <div key={m} className="flex items-baseline justify-between text-sm">
                <span>{t.byMethod[m]}</span>
                <span className="tabular-nums font-semibold">
                  {fmtMoney(data.income_by_method[m] ?? 0)}
                </span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            {t.topMembers.title}
          </h2>
          {data.top_members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t.topMembers.empty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.topMembers.columns.member}</TableHead>
                  <TableHead className="text-right">
                    {t.topMembers.columns.payments}
                  </TableHead>
                  <TableHead className="text-right">{t.topMembers.columns.total}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.top_members.map((m) => (
                  <TableRow key={m.member_id}>
                    <TableCell className="font-medium">{m.full_name}</TableCell>
                    <TableCell className="text-right text-sm text-muted-foreground">
                      {t.topMembers.paymentsCount(m.payments_count)}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {fmtMoney(m.total_paid)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardContent className="pt-5 pb-5">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            {t.recentPayments.title}
          </h2>
          {data.recent_payments.length === 0 ? (
            <p className="text-sm text-muted-foreground py-4">{t.recentPayments.empty}</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.recentPayments.columns.date}</TableHead>
                  <TableHead>{t.recentPayments.columns.member}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t.recentPayments.columns.concept}
                  </TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t.recentPayments.columns.method}
                  </TableHead>
                  <TableHead className="text-right">
                    {t.recentPayments.columns.amount}
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.recent_payments.slice(0, 25).map((p) => (
                  <TableRow key={p.id}>
                    <TableCell className="text-sm">{fmtDate(p.payment_date)}</TableCell>
                    <TableCell className="font-medium">{p.member_name}</TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {CONCEPT_LABEL[p.concept] ?? p.concept}
                    </TableCell>
                    <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                      {p.payment_method ? t.byMethod[p.payment_method] : "—"}
                    </TableCell>
                    <TableCell className="text-right tabular-nums font-semibold">
                      {fmtMoney(p.amount)}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <div className="flex flex-wrap gap-2 justify-end">
        <Button variant="outline" disabled={!!exporting} onClick={() => exportFile("pdf")}>
          {exporting === "pdf" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileText className="h-4 w-4" />
          )}
          {exporting === "pdf" ? t.page.exportingPdf : t.page.exportPdf}
        </Button>
        <Button variant="outline" disabled={!!exporting} onClick={() => exportFile("xlsx")}>
          {exporting === "xlsx" ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <FileSpreadsheet className="h-4 w-4" />
          )}
          {exporting === "xlsx" ? t.page.exportingXlsx : t.page.exportXlsx}
        </Button>
      </div>

      <p className="text-xs text-muted-foreground flex items-center gap-2">
        <Download className="h-3.5 w-3.5" /> {fmtDate(data.from)} — {fmtDate(data.to)}
      </p>
    </div>
  );
}

function KpiCard({
  label,
  value,
  variant,
}: {
  label: string;
  value: string;
  variant?: "destructive";
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p
          className={`mt-1 text-2xl font-bold tabular-nums ${variant === "destructive" ? "text-destructive" : ""}`}
        >
          {value}
        </p>
      </CardContent>
    </Card>
  );
}

function ChartIncome({ data }: { data: { date: string; total: number }[] }) {
  if (data.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sin ingresos en este período.
      </p>
    );
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => format(parseISO(v), "d MMM", { locale: es })}
            fontSize={12}
            minTickGap={24}
          />
          <YAxis
            tickFormatter={(v) => fmtMoney(v).replace(".00", "")}
            fontSize={12}
            width={70}
          />
          <Tooltip
            formatter={(v: number) => fmtMoney(v)}
            labelFormatter={(v) => fmtDate(v as string)}
            contentStyle={{ borderRadius: 6, fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="total"
            stroke="hsl(var(--primary))"
            strokeWidth={2}
            dot={false}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartCheckins({ data }: { data: { date: string; count: number }[] }) {
  if (data.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-8 text-center">
        Sin check-ins en este período.
      </p>
    );
  return (
    <div className="h-56">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
          <XAxis
            dataKey="date"
            tickFormatter={(v) => format(parseISO(v), "d MMM", { locale: es })}
            fontSize={12}
            minTickGap={24}
          />
          <YAxis fontSize={12} allowDecimals={false} />
          <Tooltip
            labelFormatter={(v) => fmtDate(v as string)}
            contentStyle={{ borderRadius: 6, fontSize: 12 }}
          />
          <Bar dataKey="count" fill="hsl(var(--primary))" radius={[4, 4, 0, 0]} />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
