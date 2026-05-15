import * as React from "react";
import { ArrowDown, ArrowUp, Minus } from "lucide-react";

export interface DeltaKpi {
  value: number;
  delta: number | null;
  delta_pct: number | null;
}

// deltaText renders the "+12% / -3 / —" chip used inside StatCard's `delta`
// slot. Centralized so DashboardPage and ReportsPage stay consistent. Prefers
// the percentage when `previous` was non-zero; otherwise falls back to the
// absolute delta. Returns null when both are nil (no signal yet).
export function deltaText(kpi: DeltaKpi): React.ReactNode {
  if (kpi.delta_pct === null && kpi.delta === null) return null;
  const pct = kpi.delta_pct;
  const trend = pct === null || Math.abs(pct) < 0.01 ? "flat" : pct > 0 ? "up" : "down";
  const Icon = trend === "up" ? ArrowUp : trend === "down" ? ArrowDown : Minus;
  const text =
    pct !== null
      ? `${pct > 0 ? "+" : ""}${pct.toFixed(0)}%`
      : `${kpi.delta! > 0 ? "+" : ""}${kpi.delta}`;
  return React.createElement(
    "span",
    { className: "inline-flex items-center gap-0.5" },
    React.createElement(Icon, { className: "h-3 w-3", strokeWidth: 2.5 }),
    text,
  );
}
