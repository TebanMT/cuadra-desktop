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
      {PRESETS.map((preset) => (
        <button
          key={preset.key}
          type="button"
          aria-pressed={value.period === preset.key}
          className={cn(
            "h-11 rounded-md px-3 text-sm font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            value.period === preset.key
              ? "bg-primary text-primary-foreground"
              : "text-muted-foreground hover:bg-muted hover:text-foreground",
          )}
          onClick={() => onChange({ period: preset.key })}
        >
          {preset.label}
        </button>
      ))}
      <Select
        value={
          ["week", "3_months", "year"].includes(value.period)
            ? value.period
            : ""
        }
        onValueChange={(period) => onChange({ period: period as ReportPeriod })}
      >
        <SelectTrigger
          aria-label="Más períodos"
          className="h-11 w-auto min-w-0 px-2"
        >
          <SelectValue placeholder="Más períodos" />
        </SelectTrigger>
        <SelectContent>
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
