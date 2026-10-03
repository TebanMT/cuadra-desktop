import { useMemo } from "react";
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
import { fmtMoney } from "@/hooks/useBilling";
import { useMoneyVisibility, MASKED_MONEY } from "@/hooks/useMoneyVisibility";
import { fmtDate, fmtDayMonth } from "@/lib/dates";
import { reports as t } from "@/strings/reports";

// ---------------------------------------------------------------------------
// Preset único de charts — plan Reports-improve fase 0.4/fase 2 (mismo
// sistema que cuadra-dashboard, adaptado al ojo de dinero del desktop).
// TODA gráfica de reportes importa su config de aquí. Reglas:
//   - líneas 2px sin dots; gridlines SOLO horizontales, 0.5px
//   - 2-3 ticks por eje, sin axis/tick lines
//   - sin leyenda en serie única; leyenda sólo en multi-serie
//   - tooltip consistente; márgenes fijos
// Semántica de color FIJA: UN acento (chart-1) para dinero-que-entra;
// chart-2 para conteos; rojo RESERVADO a egresos/devoluciones/alerta.
// El texto SIEMPRE va en tokens de texto, nunca en el color de la serie.
// ---------------------------------------------------------------------------

export const CHART_COLORS = {
  money: "hsl(var(--chart-1))",
  count: "hsl(var(--chart-2))",
  danger: "hsl(var(--destructive))",
} as const;

export const CHART_MARGINS = { top: 6, right: 8, bottom: 0, left: 0 } as const;

export const TOOLTIP_STYLE = {
  borderRadius: 8,
  fontSize: 12,
  backgroundColor: "hsl(var(--popover))",
  border: "1px solid hsl(var(--border))",
  color: "hsl(var(--popover-foreground))",
} as const;

export const GRID_PROPS = {
  stroke: "hsl(var(--border))",
  strokeWidth: 0.5,
  vertical: false,
} as const;

export const X_AXIS_PROPS = {
  fontSize: 11,
  stroke: "hsl(var(--muted-foreground))",
  tickLine: false,
  axisLine: false,
  minTickGap: 48,
  interval: "preserveStartEnd",
} as const;

export const Y_AXIS_PROPS = {
  fontSize: 11,
  stroke: "hsl(var(--muted-foreground))",
  tickLine: false,
  axisLine: false,
  tickCount: 3,
} as const;

export const fmtMoneyTick = (v: number) => fmtMoney(v).replace(/\.00$/, "");
export const fmtDateTick = (v: string) => fmtDayMonth(v);

// ---------------------------------------------------------------------------
// IncomeExpensesChart — dual serie (ingresos vs egresos por día). Multi-serie
// → lleva leyenda. Respeta el ojo de dinero (money.hidden) en eje y tooltip.
// Click en un punto de ingresos abre el drill-down del día.
// ---------------------------------------------------------------------------

export function IncomeExpensesChart({
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

  return (
    <ResponsiveContainer width="100%" height="100%">
      <LineChart data={merged} margin={CHART_MARGINS}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...X_AXIS_PROPS} tickFormatter={fmtDateTick} />
        <YAxis
          {...Y_AXIS_PROPS}
          width={56}
          tickFormatter={(v: number) => (money.hidden ? MASKED_MONEY : fmtMoneyTick(v))}
        />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ stroke: "hsl(var(--border))" }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          formatter={(v: number, name: string) => [
            money.fmt(v),
            name === "income" ? t.charts.legendIncome : t.charts.legendExpenses,
          ]}
          labelFormatter={(v) => fmtDate(v as string)}
        />
        <Legend
          iconType="line"
          wrapperStyle={{ fontSize: 11 }}
          formatter={(name) =>
            name === "income" ? t.charts.legendIncome : t.charts.legendExpenses
          }
        />
        <Line
          type="monotone"
          dataKey="income"
          stroke={CHART_COLORS.money}
          strokeWidth={2}
          dot={false}
          activeDot={{
            r: 5,
            fill: CHART_COLORS.money,
            cursor: "pointer",
            // recharts tipa el primer arg como DotProps, pero en runtime
            // el dot activo recibe también `payload` (el data point).
            onClick: (props) => {
              const { payload } = props as unknown as { payload?: { date?: string } };
              if (payload?.date) onDayClick(payload.date.slice(0, 10));
            },
          }}
        />
        <Line
          type="monotone"
          dataKey="expenses"
          stroke={CHART_COLORS.danger}
          strokeWidth={2}
          dot={false}
          activeDot={{ r: 5, fill: CHART_COLORS.danger }}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

export function CountBarChart({
  data,
  color = CHART_COLORS.count,
  onDayClick,
}: {
  data: { date: string; count: number }[];
  color?: string;
  onDayClick?: (day: string) => void;
}) {
  return (
    <ResponsiveContainer width="100%" height="100%">
      <BarChart data={data} margin={CHART_MARGINS}>
        <CartesianGrid {...GRID_PROPS} />
        <XAxis dataKey="date" {...X_AXIS_PROPS} tickFormatter={fmtDateTick} />
        <YAxis {...Y_AXIS_PROPS} width={32} allowDecimals={false} />
        <Tooltip
          contentStyle={TOOLTIP_STYLE}
          cursor={{ fill: "hsl(var(--muted) / 0.5)" }}
          labelStyle={{ color: "hsl(var(--foreground))", fontWeight: 600 }}
          labelFormatter={(v) => fmtDate(v as string)}
        />
        <Bar
          dataKey="count"
          fill={color}
          radius={[3, 3, 0, 0]}
          cursor={onDayClick ? "pointer" : undefined}
          onClick={
            onDayClick
              ? (d: { payload?: { date?: string } }) => {
                  const date = d.payload?.date;
                  if (date) onDayClick(String(date).slice(0, 10));
                }
              : undefined
          }
        />
      </BarChart>
    </ResponsiveContainer>
  );
}
