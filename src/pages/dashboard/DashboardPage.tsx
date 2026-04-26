import { Link } from "react-router-dom";
import { Loader2, ArrowDown, ArrowUp, Minus, ChevronRight } from "lucide-react";
import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDashboard } from "@/hooks/useReports";
import { fmtMoney } from "@/hooks/useBilling";
import { fmtDate } from "@/lib/dates";
import { dashboard as t } from "@/strings/dashboard";
import { cn } from "@/lib/utils";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

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
  const gym = useAuthStore((s) => s.gym);
  const dashboard = useDashboard();

  return (
    <div className="p-8 space-y-6 max-w-6xl">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight">
          {t.greeting(user?.full_name ?? null)}
        </h1>
        <p className="text-muted-foreground mt-1">{t.subtitle(gym?.name ?? null)}</p>
      </div>

      {dashboard.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {dashboard.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.error}</AlertDescription>
        </Alert>
      )}

      {dashboard.data && <DashboardContent data={dashboard.data} />}
    </div>
  );
}

function DashboardContent({ data }: { data: ReturnType<typeof useDashboard>["data"] & {} }) {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <KpiCard label={t.kpis.activeMembers} kpi={data.active_members} mode="number" />
        <KpiCard label={t.kpis.incomeMonth} kpi={data.income_month} mode="money" />
        <KpiCard label={t.kpis.expiringWeek} kpi={data.expiring_week} mode="number" />
        <KpiCard label={t.kpis.recoverable} kpi={data.recoverable} mode="number" />
      </div>

      <Card>
        <CardContent className="pt-6">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
            {t.income30d.title}
          </h2>
          {data.income_30d.length === 0 ? (
            <p className="text-sm text-muted-foreground py-8 text-center">{t.income30d.empty}</p>
          ) : (
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.income_30d}>
                  <defs>
                    <linearGradient id="incFill" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                      <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" vertical={false} />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => {
                      const d = parseISO(v);
                      return format(d, "d MMM", { locale: es });
                    }}
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
                  <Area
                    type="monotone"
                    dataKey="total"
                    stroke="hsl(var(--primary))"
                    strokeWidth={2}
                    fill="url(#incFill)"
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          )}
        </CardContent>
      </Card>

      <div className="grid gap-4 lg:grid-cols-2">
        <AttentionCard summary={data.attention_summary} />
        <RecentPaymentsCard items={data.recent_payments} />
      </div>

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" asChild>
          <Link to="/reports/cash-close">{t.cashToday.seeFullClose}</Link>
        </Button>
        <Button variant="outline" asChild>
          <Link to="/attention-required">{t.cashToday.seeExpiring}</Link>
        </Button>
      </div>
    </div>
  );
}

function KpiCard({
  label,
  kpi,
  mode,
}: {
  label: string;
  kpi: { value: number; delta: number | null; delta_pct: number | null };
  mode: "money" | "number";
}) {
  const value = mode === "money" ? fmtMoney(kpi.value) : kpi.value.toLocaleString("es-MX");
  const delta = kpi.delta_pct ?? kpi.delta;
  const trend =
    delta === null || Math.abs(delta) < 0.01 ? "flat" : delta > 0 ? "up" : "down";

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          {label}
        </p>
        <p className="mt-1 text-3xl font-bold tabular-nums">{value}</p>
        {delta !== null && (
          <p
            className={cn(
              "mt-2 flex items-center gap-1 text-xs font-medium",
              trend === "up" && "text-success",
              trend === "down" && "text-destructive",
              trend === "flat" && "text-muted-foreground"
            )}
          >
            {trend === "up" && <ArrowUp className="h-3 w-3" />}
            {trend === "down" && <ArrowDown className="h-3 w-3" />}
            {trend === "flat" && <Minus className="h-3 w-3" />}
            <span>
              {kpi.delta_pct !== null
                ? `${kpi.delta_pct > 0 ? "+" : ""}${kpi.delta_pct.toFixed(0)}%`
                : `${kpi.delta! > 0 ? "+" : ""}${kpi.delta}`}
            </span>
            <span className="text-muted-foreground">{t.kpis.vsLastPeriod}</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function AttentionCard({
  summary,
}: {
  summary: {
    expiring_soon: number;
    expired_recoverable: number;
    inactive_involuntary: number;
    low_stock: number;
    pending_balance: number;
    birthdays_today: number;
  };
}) {
  const items: { label: string; count: number }[] = [
    { label: t.attention.expiringSoon(summary.expiring_soon), count: summary.expiring_soon },
    {
      label: t.attention.expiredRecoverable(summary.expired_recoverable),
      count: summary.expired_recoverable,
    },
    {
      label: t.attention.inactiveInvoluntary(summary.inactive_involuntary),
      count: summary.inactive_involuntary,
    },
    { label: t.attention.lowStock(summary.low_stock), count: summary.low_stock },
    { label: t.attention.pendingBalance(summary.pending_balance), count: summary.pending_balance },
    { label: t.attention.birthdaysToday(summary.birthdays_today), count: summary.birthdays_today },
  ].filter((i) => i.count > 0);

  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            {t.attention.title}
          </h2>
          <Link to="/attention-required" className="text-xs text-primary hover:underline">
            {t.attention.seeAll}
          </Link>
        </div>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t.attention.none}</p>
        ) : (
          <ul className="space-y-1">
            {items.map((it, idx) => (
              <li key={idx}>
                <Link
                  to="/attention-required"
                  className="flex items-center justify-between rounded-md px-3 py-2 hover:bg-muted/40 transition-colors"
                >
                  <span className="text-sm">{it.label}</span>
                  <ChevronRight className="h-4 w-4 text-muted-foreground" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </CardContent>
    </Card>
  );
}

function RecentPaymentsCard({
  items,
}: {
  items: {
    id: string;
    member_name: string;
    amount: number;
    payment_method: string | null;
    payment_date: string;
    concept: string;
  }[];
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
          {t.recentPayments.title}
        </h2>
        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground py-6 text-center">{t.recentPayments.empty}</p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>{t.recentPayments.columns.member}</TableHead>
                <TableHead className="hidden md:table-cell">
                  {t.recentPayments.columns.concept}
                </TableHead>
                <TableHead className="text-right">{t.recentPayments.columns.amount}</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.slice(0, 6).map((p) => (
                <TableRow key={p.id}>
                  <TableCell className="font-medium">
                    <div>{p.member_name}</div>
                    <div className="text-xs text-muted-foreground">
                      {p.payment_method ? PAYMENT_METHOD_LABEL[p.payment_method] : "—"} ·{" "}
                      {fmtDate(p.payment_date)}
                    </div>
                  </TableCell>
                  <TableCell className="hidden md:table-cell text-sm text-muted-foreground">
                    {CONCEPT_LABEL[p.concept] ?? p.concept}
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
  );
}
