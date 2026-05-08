import { Link } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  Activity,
  ArrowDown,
  ArrowUp,
  ArrowUpRight,
  CalendarClock,
  ChevronRight,
  CircleDollarSign,
  Minus,
  TrendingDown,
  Users,
} from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDashboard } from "@/hooks/useReports";
import { fmtMoney } from "@/hooks/useBilling";
import { fmtDate } from "@/lib/dates";
import { dashboard as t } from "@/strings/dashboard";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/shared/StatCard";
import { SectionCard } from "@/components/shared/PagePrimitives";

const PAYMENT_METHOD_LABEL: Record<string, string> = {
  cash: "Efectivo",
  transfer: "Transferencia",
  card: "Tarjeta",
};

const CONCEPT_LABEL: Record<string, string> = {
  membership: "Mensualidad",
  product: "Producto",
  balance_settlement: "Abono",
  refund: "Devolución",
  other: "Otro",
};

export default function DashboardPage() {
  const user = useAuthStore((s) => s.user);
  const dashboard = useDashboard();
  const today = new Date();
  const nameLooksWrong =
    !user?.full_name || user.full_name.includes("@") || user.full_name.length < 3;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <header className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t.greeting(user?.full_name ?? null)}
          </h1>
          <p className="text-sm text-muted-foreground">
            {format(today, "EEEE d 'de' MMMM", { locale: es })}
            <span className="mx-1.5">·</span>
            <span className="font-medium text-foreground tabular">
              {format(today, "HH:mm")}
            </span>
            {nameLooksWrong && (
              <>
                <span className="mx-1.5">·</span>
                <Link to="/profile" className="text-primary hover:underline">
                  {t.fixProfileCta}
                </Link>
              </>
            )}
          </p>
        </div>
      </header>

      {dashboard.isLoading && <DashboardSkeleton />}

      {dashboard.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.error}</AlertDescription>
        </Alert>
      )}

      {dashboard.data && <DashboardContent data={dashboard.data} />}
    </div>
  );
}

function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-5 space-y-3">
            <div className="skeleton h-3 w-24" />
            <div className="skeleton h-8 w-32" />
            <div className="skeleton h-3 w-20" />
          </div>
        ))}
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <div className="skeleton h-4 w-40 mb-4" />
        <div className="skeleton h-56 w-full" />
      </div>
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2 rounded-xl border border-border bg-card p-6">
          <div className="skeleton h-4 w-40 mb-4" />
          <div className="skeleton h-3 w-full mt-2" />
          <div className="skeleton h-3 w-5/6 mt-2" />
          <div className="skeleton h-3 w-4/6 mt-2" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <div className="skeleton h-4 w-40 mb-4" />
          <div className="skeleton h-3 w-full mt-2" />
          <div className="skeleton h-3 w-3/4 mt-2" />
        </div>
      </div>
    </div>
  );
}

function DashboardContent({ data }: { data: NonNullable<ReturnType<typeof useDashboard>["data"]> }) {
  const recoverableCount = data.recoverable.value;

  return (
    <>
      {/* KPI Grid */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title={t.kpis.activeMembers}
          value={data.active_members.value.toLocaleString("es-MX")}
          icon={Users}
          tone="neutral"
          delta={deltaText(data.active_members)}
          hint={data.active_members.delta_pct !== null ? t.kpis.vsLastPeriod : undefined}
        />
        <StatCard
          title={t.kpis.incomeMonth}
          value={fmtMoney(data.income_month.value)}
          icon={CircleDollarSign}
          tone="success"
          delta={deltaText(data.income_month)}
          hint={data.income_month.delta_pct !== null ? t.kpis.vsLastPeriod : undefined}
        />
        <StatCard
          title={t.kpis.expiringWeek}
          value={data.expiring_week.value.toLocaleString("es-MX")}
          icon={CalendarClock}
          tone={data.expiring_week.value > 0 ? "warning" : "neutral"}
          delta={deltaText(data.expiring_week)}
          hint={data.expiring_week.delta_pct !== null ? t.kpis.vsLastPeriod : undefined}
        />
        <StatCard
          title={t.kpis.recoverable}
          value={recoverableCount.toLocaleString("es-MX")}
          icon={Activity}
          tone={recoverableCount > 0 ? "danger" : "neutral"}
          delta={deltaText(data.recoverable)}
          hint={data.recoverable.delta_pct !== null ? t.kpis.vsLastPeriod : undefined}
        />
      </div>

      {/* Income chart */}
      <SectionCard title={t.income30d.title} description="Ingresos diarios — últimos 30 días">
        {data.income_30d.length === 0 ? (
          <p className="text-sm text-muted-foreground py-10 text-center">{t.income30d.empty}</p>
        ) : (
          <div className="h-64 -mx-2">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={data.income_30d} margin={{ top: 5, right: 8, bottom: 0, left: 0 }}>
                <defs>
                  <linearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="0%" stopColor="hsl(var(--chart-1))" stopOpacity={0.25} />
                    <stop offset="100%" stopColor="hsl(var(--chart-1))" stopOpacity={0} />
                  </linearGradient>
                </defs>
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
                  width={70}
                  stroke="hsl(var(--muted-foreground))"
                  tickLine={false}
                  axisLine={false}
                />
                <Tooltip
                  formatter={(v: number) => [fmtMoney(v), "Ingreso"]}
                  labelFormatter={(v) => fmtDate(v as string)}
                  contentStyle={{
                    borderRadius: 8,
                    fontSize: 12,
                    backgroundColor: "hsl(var(--popover))",
                    border: "1px solid hsl(var(--border))",
                    color: "hsl(var(--popover-foreground))",
                  }}
                  labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
                />
                <Area
                  type="monotone"
                  dataKey="total"
                  stroke="hsl(var(--chart-1))"
                  strokeWidth={2}
                  fill="url(#incFill)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        )}
      </SectionCard>

      {/* 2-column grid: attention + payments */}
      <div className="grid gap-4 lg:grid-cols-3">
        <div className="lg:col-span-2">
          <RecentPaymentsCard items={data.recent_payments} />
        </div>
        <AttentionCard summary={data.attention_summary} />
      </div>
    </>
  );
}

interface DeltaKpi {
  value: number;
  delta: number | null;
  delta_pct: number | null;
}

function deltaText(kpi: DeltaKpi): React.ReactNode {
  if (kpi.delta_pct === null && kpi.delta === null) return null;
  const pct = kpi.delta_pct;
  const trend = pct === null || Math.abs(pct) < 0.01 ? "flat" : pct > 0 ? "up" : "down";
  const Icon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;
  const text =
    pct !== null
      ? `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`
      : `${kpi.delta! > 0 ? "+" : ""}${kpi.delta}`;
  return (
    <span className="inline-flex items-center gap-0.5">
      <Icon className="h-3 w-3" strokeWidth={2.5} />
      {text}
    </span>
  );
}

interface AttentionSummary {
  expiring_soon: number;
  expired_recoverable: number;
  inactive_involuntary: number;
  low_stock: number;
  pending_balance: number;
  birthdays_today: number;
}

function AttentionCard({ summary }: { summary: AttentionSummary }) {
  const items: { label: string; count: number; tone: "warning" | "danger" | "accent" | "neutral" }[] = [
    { label: "Por vencer pronto", count: summary.expiring_soon, tone: "warning" },
    { label: "Vencidos por recuperar", count: summary.expired_recoverable, tone: "danger" },
    { label: "Sin venir 21+ días", count: summary.inactive_involuntary, tone: "neutral" },
    { label: "Stock bajo", count: summary.low_stock, tone: "warning" },
    { label: "Saldos pendientes", count: summary.pending_balance, tone: "warning" },
    { label: "Cumpleañeros hoy", count: summary.birthdays_today, tone: "accent" },
  ].filter((i) => i.count > 0);

  // Soft pills — disciplina semantica consistente con Badge.
  const toneClass = {
    warning: "bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
    danger: "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-100",
    accent: "bg-brick-100 text-brick-500 dark:bg-brick-500/20 dark:text-brick-300",
    neutral: "bg-paper-200 text-ink-500 dark:bg-ink-700 dark:text-ink-300",
  };

  return (
    <SectionCard
      title={t.attention.title}
      action={
        <Link
          to="/attention-required"
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          {t.attention.seeAll}
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      }
      flush
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">{t.attention.none}</p>
      ) : (
        <ul className="divide-y divide-border">
          {items.map((it, idx) => (
            <li key={idx}>
              <Link
                to="/attention-required"
                className="flex items-center justify-between gap-3 px-6 py-3.5 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <span
                    className={cn(
                      "inline-flex items-center justify-center h-8 w-8 rounded-md tabular text-sm font-semibold shrink-0",
                      toneClass[it.tone]
                    )}
                  >
                    {it.count}
                  </span>
                  <span className="text-sm text-foreground truncate">{it.label}</span>
                </div>
                <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
              </Link>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}

interface RecentPayment {
  id: string;
  member_name: string;
  amount: number;
  payment_method: string | null;
  payment_date: string;
  concept: string;
}

function RecentPaymentsCard({ items }: { items: RecentPayment[] }) {
  return (
    <SectionCard
      title={t.recentPayments.title}
      action={
        <Link
          to="/reports"
          className="text-xs font-medium text-primary hover:underline inline-flex items-center gap-1"
        >
          Ver todo
          <ArrowUpRight className="h-3 w-3" />
        </Link>
      }
      flush
    >
      {items.length === 0 ? (
        <p className="text-sm text-muted-foreground py-10 text-center">
          {t.recentPayments.empty}
        </p>
      ) : (
        <ul className="divide-y divide-border">
          {items.slice(0, 8).map((p) => (
            <li
              key={p.id}
              className="flex items-center justify-between gap-3 px-6 py-3.5"
            >
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <span className="text-sm font-semibold text-foreground truncate">
                    {p.member_name}
                  </span>
                  <span className="hidden sm:inline-flex items-center rounded-md bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground tabular shrink-0">
                    {CONCEPT_LABEL[p.concept] ?? p.concept}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground mt-0.5 truncate">
                  <span>{p.payment_method ? PAYMENT_METHOD_LABEL[p.payment_method] : "—"}</span>
                  <span className="mx-1.5">·</span>
                  <span className="tabular">{fmtDate(p.payment_date)}</span>
                </div>
              </div>
              <span className="tabular text-sm font-bold text-foreground shrink-0">
                {p.amount < 0 ? (
                  <span className="text-destructive inline-flex items-center gap-1">
                    <TrendingDown className="h-3.5 w-3.5" />
                    {fmtMoney(p.amount)}
                  </span>
                ) : (
                  fmtMoney(p.amount)
                )}
              </span>
            </li>
          ))}
        </ul>
      )}
    </SectionCard>
  );
}
