import { useMemo, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
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
  AlertTriangle,
  ArrowUpRight,
  CircleDollarSign,
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Package,
  Receipt,
  ShoppingCart,
  Sparkles,
  TrendingDown,
  TrendingUp,
  UserPlus,
  Users,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
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
import { fmtMoney, useGymPayments, type PaymentMethod } from "@/hooks/useBilling";
import { useMoneyVisibility, MASKED_MONEY } from "@/hooks/useMoneyVisibility";
import { fmtDate } from "@/lib/dates";
import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";
import { downloadBlob } from "@/lib/tauri-bridge";
import { reports as t } from "@/strings/reports";
import { useAuthStore } from "@/stores/useAuthStore";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";
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
import { deltaText } from "@/lib/kpi";

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
  "custom",
];

const TOOLTIP_STYLE = {
  borderRadius: 8,
  fontSize: 12,
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  color: "hsl(var(--popover-foreground))",
};

// Helper to compute "today" YYYY-MM-DD for default custom range values.
function todayIso() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(
    d.getDate(),
  ).padStart(2, "0")}`;
}

export default function ReportsPage() {
  const [period, setPeriod] = useState<ReportPeriod>("month");
  // Custom range — only consulted when period === "custom". Defaults to a
  // 14-day window ending today so the picker isn't empty.
  const [customFrom, setCustomFrom] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() - 13);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  });
  const [customTo, setCustomTo] = useState<string>(() => todayIso());

  const range = useReportsRange(
    period,
    period === "custom" ? customFrom : undefined,
    period === "custom" ? customTo : undefined,
  );

  const customIncomplete = period === "custom" && (!customFrom || !customTo);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={t.page.title}
        subtitle={t.page.subtitle}
        actions={
          <div className="flex items-center gap-2 flex-wrap">
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
            {period === "custom" && (
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs text-muted-foreground">
                  {t.page.customFromLabel}
                </label>
                <Input
                  type="date"
                  value={customFrom}
                  onChange={(e) => setCustomFrom(e.target.value)}
                  className="h-10 w-40"
                />
                <label className="text-xs text-muted-foreground">
                  {t.page.customToLabel}
                </label>
                <Input
                  type="date"
                  value={customTo}
                  onChange={(e) => setCustomTo(e.target.value)}
                  className="h-10 w-40"
                />
              </div>
            )}
          </div>
        }
      />

      {customIncomplete && (
        <Alert>
          <AlertDescription>{t.page.customInvalid}</AlertDescription>
        </Alert>
      )}

      {range.isLoading && !range.data && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {range.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.page.error}</AlertDescription>
        </Alert>
      )}

      {range.data && (
        <ReportsContent
          data={range.data}
          period={period}
          customFrom={customFrom}
          customTo={customTo}
        />
      )}

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

function ReportsContent({
  data,
  period,
  customFrom,
  customTo,
}: {
  data: ReportsRangeData;
  period: ReportPeriod;
  customFrom: string;
  customTo: string;
}) {
  const [exporting, setExporting] = useState<ExportFormat | null>(null);
  const [drillDay, setDrillDay] = useState<{ kind: "income" | "checkins"; day: string } | null>(
    null,
  );
  const money = useMoneyVisibility();
  const navigate = useNavigate();
  const plan = useAuthStore((s) => s.gym?.subscription_plan);
  const isPlus = canAccessPlusFeatures(plan);

  async function exportFile(format: ExportFormat) {
    setExporting(format);
    try {
      const res = await fetchExport("period_summary", format, {
        period,
        from: period === "custom" ? customFrom : undefined,
        to: period === "custom" ? customTo : undefined,
      });
      const filename = res.filename ?? `reporte-${period}-${data.from}_${data.to}.${format}`;
      downloadBlob(res.blob, filename);
      toast.success(t.page.exportSuccess);
    } catch {
      toast.error(t.page.exportError);
    } finally {
      setExporting(null);
    }
  }

  const net = data.totals.net.value;
  const netTone = net > 0 ? "success" : net < 0 ? "danger" : "neutral";
  const NetIcon = net >= 0 ? TrendingUp : TrendingDown;

  const critical = data.critical_stock;
  const criticalTone: "danger" | "warning" | "success" =
    critical.out_count > 0 ? "danger" : critical.low_count > 0 ? "warning" : "success";

  return (
    <>
      {/* Headline — Utilidad del período full-width, tono según signo. */}
      <StatCard
        title={t.kpis.net}
        value={money.fmt(net)}
        icon={NetIcon}
        tone={netTone}
        delta={money.hidden ? null : deltaText(data.totals.net)}
        hint={t.kpis.netHint}
        className="text-base"
      />

      {/* Stats — 6 KPIs principales + Stock crítico. */}
      <div className="grid gap-4 sm:grid-cols-2 md:grid-cols-3 2xl:grid-cols-7">
        <StatCard
          title={t.kpis.income}
          value={money.fmt(data.totals.income.value)}
          icon={CircleDollarSign}
          tone="success"
          hint={`${fmtDate(data.from)} — ${fmtDate(data.to)}`}
          delta={money.hidden ? null : deltaText(data.totals.income)}
        />
        <StatCard
          title={t.kpis.inventoryCost}
          value={money.fmt(data.totals.inventory_cost.value)}
          icon={Package}
          tone={data.totals.inventory_cost.value > 0 ? "danger" : "neutral"}
          hint="compras de mercancía"
          delta={money.hidden ? null : deltaText(data.totals.inventory_cost)}
        />
        <StatCard
          title={t.kpis.expensesGeneral}
          value={money.fmt(data.totals.expenses_general.value)}
          icon={Receipt}
          tone={data.totals.expenses_general.value > 0 ? "danger" : "neutral"}
          hint="gastos generales"
          delta={money.hidden ? null : deltaText(data.totals.expenses_general)}
        />
        <StatCard
          title={t.kpis.newMembers}
          value={data.totals.new_members.value.toLocaleString("es-MX")}
          icon={UserPlus}
          tone="neutral"
          hint="altas en el período"
          delta={deltaText(data.totals.new_members)}
        />
        <StatCard
          title={t.kpis.checkins}
          value={data.totals.checkins.value.toLocaleString("es-MX")}
          icon={Users}
          tone="neutral"
          hint="entradas registradas"
          delta={deltaText(data.totals.checkins)}
        />
        <StatCard
          title={t.kpis.refunds}
          value={money.fmt(data.totals.refunds.value)}
          icon={TrendingDown}
          tone={data.totals.refunds.value > 0 ? "danger" : "neutral"}
          hint="devoluciones"
          delta={money.hidden ? null : deltaText(data.totals.refunds)}
        />
        <StatCard
          title={t.kpis.criticalStock}
          value={(critical.out_count + critical.low_count).toLocaleString("es-MX")}
          icon={critical.out_count > 0 ? AlertTriangle : Sparkles}
          tone={criticalTone}
          hint={t.kpis.criticalStockHint(critical.out_count, critical.low_count)}
          onClick={() => navigate("/products?low_stock=1")}
        />
      </div>

      {/* Charts */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t.charts.incomeVsExpensesByDay}
          description={t.charts.incomeVsExpensesHint}
        >
          <ChartIncomeVsExpenses
            income={data.income_by_day}
            expenses={data.expenses_by_day}
            onDayClick={(day) => setDrillDay({ kind: "income", day })}
          />
        </SectionCard>

        <SectionCard title={t.charts.checkinsByDay} description="Entradas diarias">
          <ChartCheckins
            data={data.checkins_by_day}
            onDayClick={(day) => setDrillDay({ kind: "checkins", day })}
          />
        </SectionCard>
      </div>

      {/* Breakdowns side-by-side: pagos por método + gastos por categoría */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t.byMethod.title}
          description="Cómo se cobró durante el período"
          flush
        >
          <ul className="divide-y divide-border">
            {METHOD_KEYS.map((m) => {
              const value = data.income_by_method[m] ?? 0;
              const totalIncome = data.totals.income.value;
              const pct = totalIncome > 0 ? (value / totalIncome) * 100 : 0;
              return (
                <li key={m} className="flex items-center gap-4 px-6 py-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-sm font-medium text-foreground">
                        {t.byMethod[m]}
                      </span>
                      <span className="tabular text-sm font-bold text-foreground">
                        {money.fmt(value)}
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

        <SectionCard
          title={t.byCategory.title}
          description={t.byCategory.description}
          flush
        >
          <CategoryBreakdown data={data.expenses_by_category} />
        </SectionCard>
      </div>

      {/* Top members + Top products */}
      <div className="grid gap-4 lg:grid-cols-2">
        <SectionCard
          title={t.topMembers.title}
          description="Quiénes pagaron más en el período"
          flush
        >
          {data.top_members.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t.topMembers.empty}
            </p>
          ) : (
            <DataTable>
              <DataTableHead>
                <DataTableTh className="pl-6">{t.topMembers.columns.member}</DataTableTh>
                <DataTableTh className="text-right">
                  {t.topMembers.columns.payments}
                </DataTableTh>
                <DataTableTh className="text-right pr-6">
                  {t.topMembers.columns.total}
                </DataTableTh>
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
                      {money.fmt(m.total_paid)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </SectionCard>

        <SectionCard
          title={t.topProducts.title}
          description={t.topProducts.description}
          flush
        >
          {data.top_products.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">
              {t.topProducts.empty}
            </p>
          ) : (
            <DataTable>
              <DataTableHead>
                <DataTableTh className="pl-6">{t.topProducts.columns.product}</DataTableTh>
                <DataTableTh className="text-right">
                  {t.topProducts.columns.quantity}
                </DataTableTh>
                <DataTableTh className="text-right pr-6">
                  {t.topProducts.columns.revenue}
                </DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {data.top_products.map((p, idx) => (
                  <DataTableRow key={p.product_id}>
                    <DataTableCell className="pl-6">
                      <div className="flex items-center gap-3">
                        <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-muted text-xs font-bold text-muted-foreground tabular">
                          {idx + 1}
                        </span>
                        <span className="font-semibold text-foreground">
                          {p.product_name}
                        </span>
                      </div>
                    </DataTableCell>
                    <DataTableCell className="text-right text-muted-foreground tabular">
                      {t.topProducts.quantityValue(p.quantity)}
                    </DataTableCell>
                    <DataTableCell className="text-right pr-6 tabular font-bold text-foreground">
                      {money.fmt(p.revenue)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          )}
        </SectionCard>
      </div>

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
                    {money.hidden ? (
                      <span className="text-muted-foreground">{MASKED_MONEY}</span>
                    ) : p.amount < 0 ? (
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

      {/* Gastos del período (BC expenses) */}
      <SectionCard
        title={t.expensesSection.title}
        description={t.expensesSection.description}
        flush
      >
        {data.expenses.length === 0 ? (
          <div className="px-6 py-10 text-center space-y-2">
            <p className="text-sm text-muted-foreground">{t.expensesSection.empty}</p>
            <p className="text-xs text-muted-foreground">{t.expensesSection.hint}</p>
          </div>
        ) : (
          <>
            <DataTable>
              <DataTableHead>
                <DataTableTh className="pl-6">{t.expensesSection.columns.date}</DataTableTh>
                <DataTableTh>{t.expensesSection.columns.category}</DataTableTh>
                <DataTableTh>{t.expensesSection.columns.description}</DataTableTh>
                <DataTableTh className="hidden md:table-cell">
                  {t.expensesSection.columns.method}
                </DataTableTh>
                <DataTableTh className="text-right pr-6">
                  {t.expensesSection.columns.amount}
                </DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {data.expenses.map((e) => (
                  <DataTableRow key={e.id}>
                    <DataTableCell className="pl-6 tabular text-muted-foreground">
                      {fmtDate(e.expense_date)}
                    </DataTableCell>
                    <DataTableCell>
                      <span className="font-semibold text-foreground">
                        {t.expenseCategories[e.category] ?? e.category}
                      </span>
                    </DataTableCell>
                    <DataTableCell className="text-muted-foreground">
                      {e.description || "—"}
                    </DataTableCell>
                    <DataTableCell className="hidden md:table-cell text-muted-foreground">
                      {t.expenseMethods[e.payment_method] ?? e.payment_method}
                    </DataTableCell>
                    <DataTableCell className="text-right pr-6 tabular font-bold text-foreground">
                      {money.fmt(e.amount)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
            <div className="flex items-center justify-end gap-3 px-6 py-3 border-t bg-muted/30 text-sm">
              <span className="text-muted-foreground">{t.expensesSection.totalLabel}</span>
              <span className="tabular font-bold text-foreground">
                {money.fmt(data.totals.expenses_general.value)}
              </span>
            </div>
          </>
        )}
      </SectionCard>

      {/* Compras de inventario */}
      <SectionCard
        title={t.inventoryCosts.title}
        description={t.inventoryCosts.description}
        flush
      >
        {data.inventory_costs.length === 0 ? (
          <div className="px-6 py-10 text-center space-y-2">
            <p className="text-sm text-muted-foreground">{t.inventoryCosts.empty}</p>
            <p className="text-xs text-muted-foreground">{t.inventoryCosts.hint}</p>
          </div>
        ) : (
          <>
            <DataTable>
              <DataTableHead>
                <DataTableTh className="pl-6">{t.inventoryCosts.columns.date}</DataTableTh>
                <DataTableTh>{t.inventoryCosts.columns.product}</DataTableTh>
                <DataTableTh className="text-right">{t.inventoryCosts.columns.qty}</DataTableTh>
                <DataTableTh className="text-right hidden md:table-cell">
                  {t.inventoryCosts.columns.costUnit}
                </DataTableTh>
                <DataTableTh className="text-right pr-6">
                  {t.inventoryCosts.columns.costTotal}
                </DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {data.inventory_costs.map((m) => (
                  <DataTableRow key={m.movement_id}>
                    <DataTableCell className="pl-6 tabular text-muted-foreground">
                      {fmtDate(m.occurred_at.slice(0, 10))}
                    </DataTableCell>
                    <DataTableCell>
                      <span className="font-semibold text-foreground">{m.product_name}</span>
                      {m.reason && (
                        <span className="block text-xs text-muted-foreground mt-0.5">
                          {m.reason}
                        </span>
                      )}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular text-muted-foreground">
                      {m.delta.toLocaleString("es-MX")}
                    </DataTableCell>
                    <DataTableCell className="text-right tabular hidden md:table-cell text-muted-foreground">
                      {money.fmt(m.cost_unit)}
                    </DataTableCell>
                    <DataTableCell className="text-right pr-6 tabular font-bold text-foreground">
                      {money.fmt(m.cost_total)}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
            <div className="flex items-center justify-end gap-3 px-6 py-3 border-t bg-muted/30 text-sm">
              <span className="text-muted-foreground">{t.inventoryCosts.totalLabel}</span>
              <span className="tabular font-bold text-foreground">
                {money.fmt(data.totals.inventory_cost.value)}
              </span>
            </div>
          </>
        )}
      </SectionCard>

      {/* Export actions — Excel/CSV/PDF export es feature Plus según landing.
          Standard ve los reportes en pantalla; los botones de export sólo
          aparecen para Plus. Mientras Plus no se vende, Standard ni siquiera
          ve el upsell — cuando Plus se libere, agregar la rama else con
          el link de upgrade (ver git history y comentario
          `CUANDO PLUS SE LIBERE` en src/hooks/useSubscription.ts). */}
      <div className="flex flex-wrap items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="inline-flex items-center gap-2">
          <Receipt className="h-3.5 w-3.5" />
          <span>
            {fmtDate(data.from)} — {fmtDate(data.to)}
          </span>
        </span>
        {isPlus && (
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
        )}
      </div>

      {/* Drill-down dialog */}
      <DrillDownDialog
        open={!!drillDay}
        kind={drillDay?.kind ?? "income"}
        day={drillDay?.day ?? ""}
        onClose={() => setDrillDay(null)}
      />
    </>
  );
}

function CategoryBreakdown({ data }: { data: Record<string, number> }) {
  const money = useMoneyVisibility();
  const entries = useMemo(() => {
    const list = Object.entries(data).filter(([, v]) => v > 0);
    list.sort((a, b) => b[1] - a[1]);
    return list;
  }, [data]);
  const total = entries.reduce((sum, [, v]) => sum + v, 0);
  if (entries.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-10 px-6 text-center">
        {t.byCategory.empty}
      </p>
    );
  return (
    <ul className="divide-y divide-border">
      {entries.map(([key, value]) => {
        const pct = total > 0 ? (value / total) * 100 : 0;
        return (
          <li key={key} className="flex items-center gap-4 px-6 py-4">
            <div className="flex-1 min-w-0">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-sm font-medium text-foreground">
                  {t.expenseCategories[key] ?? key}
                </span>
                <span className="tabular text-sm font-bold text-foreground">
                  {money.fmt(value)}
                </span>
              </div>
              <div className="mt-2 h-2 rounded-full bg-muted overflow-hidden">
                <div
                  className="h-full bg-destructive/70 rounded-full transition-all"
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
  );
}

function ChartIncomeVsExpenses({
  income,
  expenses,
  onDayClick,
}: {
  income: { date: string; total: number }[];
  expenses: { date: string; total: number }[];
  onDayClick: (day: string) => void;
}) {
  const money = useMoneyVisibility();
  // Merge both series into one shape so a single LineChart can render them.
  const merged = useMemo(() => {
    const byDay = new Map<string, { date: string; income: number; expenses: number }>();
    for (const r of income) {
      const day = r.date.slice(0, 10);
      const cur = byDay.get(day) ?? { date: day, income: 0, expenses: 0 };
      cur.income += r.total;
      byDay.set(day, cur);
    }
    for (const r of expenses) {
      const day = r.date.slice(0, 10);
      const cur = byDay.get(day) ?? { date: day, income: 0, expenses: 0 };
      cur.expenses += r.total;
      byDay.set(day, cur);
    }
    return Array.from(byDay.values()).sort((a, b) => a.date.localeCompare(b.date));
  }, [income, expenses]);

  if (merged.length === 0)
    return (
      <p className="text-sm text-muted-foreground py-10 text-center">
        Sin movimientos en este período.
      </p>
    );

  return (
    <div className="h-56 -mx-2">
      <ResponsiveContainer width="100%" height="100%">
        <LineChart data={merged} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
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
            tickFormatter={(v) =>
              money.hidden ? MASKED_MONEY : fmtMoney(v).replace(".00", "")
            }
            fontSize={12}
            width={64}
            stroke="hsl(var(--muted-foreground))"
            tickLine={false}
            axisLine={false}
          />
          <Tooltip
            formatter={(v: number, name: string) => [
              money.fmt(v),
              name === "income" ? t.charts.legendIncome : t.charts.legendExpenses,
            ]}
            labelFormatter={(v) => fmtDate(v as string)}
            contentStyle={TOOLTIP_STYLE}
            labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          />
          <Legend
            iconType="line"
            formatter={(name) =>
              name === "income" ? t.charts.legendIncome : t.charts.legendExpenses
            }
            wrapperStyle={{ fontSize: 12 }}
          />
          <Line
            type="monotone"
            dataKey="income"
            stroke="hsl(var(--chart-1))"
            strokeWidth={2}
            dot={{ r: 3, fill: "hsl(var(--chart-1))", cursor: "pointer" }}
            activeDot={{
              r: 5,
              fill: "hsl(var(--chart-1))",
              cursor: "pointer",
              onClick: (_: unknown, payload: { payload?: { date?: string } }) => {
                if (payload?.payload?.date) onDayClick(payload.payload.date);
              },
            }}
          />
          <Line
            type="monotone"
            dataKey="expenses"
            stroke="hsl(var(--destructive))"
            strokeWidth={2}
            dot={false}
            activeDot={{ r: 5, fill: "hsl(var(--destructive))" }}
          />
        </LineChart>
      </ResponsiveContainer>
    </div>
  );
}

function ChartCheckins({
  data,
  onDayClick,
}: {
  data: { date: string; count: number }[];
  onDayClick: (day: string) => void;
}) {
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
          <Bar
            dataKey="count"
            fill="hsl(var(--chart-2))"
            radius={[6, 6, 0, 0]}
            cursor="pointer"
            onClick={(d: { date?: string } | undefined) => {
              if (d?.date) onDayClick(d.date.slice(0, 10));
            }}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}

// DrillDownDialog renders the per-day list of payments or check-ins so the
// owner can see "what made up that bar/point". Reuses useGymPayments for
// income (already supports from/to); checkins drill-down hits the now-extended
// GET /api/v1/checkins with from/to filters.
function DrillDownDialog({
  open,
  kind,
  day,
  onClose,
}: {
  open: boolean;
  kind: "income" | "checkins";
  day: string;
  onClose: () => void;
}) {
  const money = useMoneyVisibility();
  // Payments — only fetched when the income dialog is open.
  const payments = useGymPayments({ from: day, to: day, page: 1, page_size: 200 });
  // Check-ins — only fetched when the checkins dialog is open.
  const checkins = useQuery<{ items: CheckinDrillRow[] }>({
    queryKey: ["checkins", "drill", day],
    queryFn: () =>
      api.get<{ items: CheckinDrillRow[] }>("/api/v1/checkins", {
        query: { from: day, to: day, limit: 200 },
      }),
    enabled: open && kind === "checkins" && !!day,
    staleTime: 30_000,
  });

  const title =
    kind === "income"
      ? t.drillDown.incomeTitle(day ? fmtDate(day) : "")
      : t.drillDown.checkinsTitle(day ? fmtDate(day) : "");

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {kind === "income" ? (
              <CircleDollarSign className="h-5 w-5 text-primary" />
            ) : (
              <ShoppingCart className="h-5 w-5 text-primary" />
            )}
            {title}
          </DialogTitle>
          <DialogDescription>
            {kind === "income"
              ? "Cobros registrados ese día."
              : "Entradas registradas ese día."}
          </DialogDescription>
        </DialogHeader>
        {kind === "income" ? (
          payments.isLoading ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t.drillDown.loading}
            </p>
          ) : (payments.data?.items ?? []).length === 0 ? (
            <p className="text-sm text-muted-foreground py-6 text-center">
              {t.drillDown.incomeEmpty}
            </p>
          ) : (
            <div className="max-h-96 overflow-auto">
              <DataTable>
                <DataTableHead>
                  <DataTableTh className="pl-4">Socio</DataTableTh>
                  <DataTableTh>Concepto</DataTableTh>
                  <DataTableTh>Método</DataTableTh>
                  <DataTableTh className="text-right pr-4">Monto</DataTableTh>
                </DataTableHead>
                <DataTableBody>
                  {(payments.data?.items ?? []).map((p) => (
                    <DataTableRow key={p.id}>
                      <DataTableCell className="pl-4">
                        {p.member_name ?? "—"}
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {CONCEPT_LABEL[p.concept] ?? p.concept}
                      </DataTableCell>
                      <DataTableCell className="text-muted-foreground">
                        {p.payment_method ? t.byMethod[p.payment_method] : "—"}
                      </DataTableCell>
                      <DataTableCell className="text-right pr-4 tabular font-bold">
                        {money.fmt(p.amount)}
                      </DataTableCell>
                    </DataTableRow>
                  ))}
                </DataTableBody>
              </DataTable>
            </div>
          )
        ) : checkins.isLoading ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t.drillDown.loading}
          </p>
        ) : (checkins.data?.items ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">
            {t.drillDown.checkinsEmpty}
          </p>
        ) : (
          <div className="max-h-96 overflow-auto">
            <DataTable>
              <DataTableHead>
                <DataTableTh className="pl-4">Hora</DataTableTh>
                <DataTableTh>Socio</DataTableTh>
                <DataTableTh>Método</DataTableTh>
                <DataTableTh className="pr-4">Resultado</DataTableTh>
              </DataTableHead>
              <DataTableBody>
                {(checkins.data?.items ?? []).map((c) => (
                  <DataTableRow key={c.id}>
                    <DataTableCell className="pl-4 tabular text-muted-foreground">
                      {format(parseISO(c.created_at), "HH:mm")}
                    </DataTableCell>
                    <DataTableCell>{c.member_name ?? "—"}</DataTableCell>
                    <DataTableCell className="text-muted-foreground">
                      {c.method}
                    </DataTableCell>
                    <DataTableCell className="pr-4 text-muted-foreground">
                      {c.result}
                    </DataTableCell>
                  </DataTableRow>
                ))}
              </DataTableBody>
            </DataTable>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

interface CheckinDrillRow {
  id: string;
  member_id: string | null;
  member_name: string | null;
  method: string;
  result: string;
  created_at: string;
}
