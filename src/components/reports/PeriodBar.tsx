import { DateRangePicker } from "@/components/ui/date-range-picker";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import type { ReportPeriod } from "@/hooks/useReports";

export interface ReportRange {
  period: ReportPeriod;
  from?: string;
  to?: string;
}
export const MAX_CUSTOM_DAYS = 366;
const PRESETS: { key: ReportPeriod; label: string }[] = [
  { key: "today", label: "Hoy" },
  { key: "month", label: "Este mes" },
  { key: "last_month", label: "Mes pasado" },
];

export function PeriodBar({
  value,
  onChange,
  align = "start",
  className,
}: {
  value: ReportRange;
  onChange: (next: ReportRange) => void;
  align?: "start" | "end";
  className?: string;
}) {
  return (
    <div className={cn("flex flex-wrap items-center gap-1", className)}>
      <Select value={value.period === "custom" ? "" : value.period} onValueChange={period => onChange({ period: period as ReportPeriod })}>
        <SelectTrigger aria-label="Período del reporte" className="h-11 w-[180px]">
          <SelectValue placeholder="Período personalizado" />
        </SelectTrigger>
        <SelectContent>
          {PRESETS.map(preset => <SelectItem key={preset.key} value={preset.key}>{preset.label}</SelectItem>)}
          <SelectItem value="week">Últimos 7 días</SelectItem>
          <SelectItem value="3_months">Últimos 3 meses</SelectItem>
          <SelectItem value="year">Últimos 12 meses</SelectItem>
        </SelectContent>
      </Select>
      <DateRangePicker
        from={value.period === "custom" ? value.from : undefined}
        to={value.period === "custom" ? value.to : undefined}
        active={value.period === "custom"}
        align={align}
        maxDays={MAX_CUSTOM_DAYS}
        shortcuts={false}
        onChange={(from, to) => onChange({ period: "custom", from, to })}
      />
    </div>
  );
}
