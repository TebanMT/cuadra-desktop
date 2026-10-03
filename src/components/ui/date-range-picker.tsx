import { validateDateFields } from "@/lib/date-input";
import { useId, useState } from "react";
import { addDays, differenceInCalendarDays, startOfMonth } from "date-fns";
import { CalendarRange } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { DateInput } from "@/components/ui/date-input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtDate, fmtIso, parseDate, todayIso } from "@/lib/dates";

interface Props {
  from?: string;
  to?: string;
  onChange: (from: string, to: string) => void;
  max?: string;
  maxDays?: number;
  align?: "start" | "end";
  shortcuts?: boolean;
  label?: string;
  active?: boolean;
  clearable?: boolean;
}

export function DateRangePicker({ from = "", to = "", onChange, max = todayIso(), maxDays,
  align = "start", shortcuts = true, label = "Personalizado", active = false, clearable = false }: Props) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [start, setStart] = useState(from);
  const [end, setEnd] = useState(to);
  const [startValid, setStartValid] = useState(true);
  const [endValid, setEndValid] = useState(true);
  const [calendarRevision, setCalendarRevision] = useState(0);
  const [month, setMonth] = useState(() => startOfMonth(parseDate(from) ?? parseDate(max)!));
  const first = parseDate(start);
  const last = parseDate(end);
  const days = first && last ? differenceInCalendarDays(last, first) + 1 : 0;
  const error = first && last && days <= 0 ? "La fecha final debe ser igual o posterior a la inicial."
    : maxDays && days > maxDays ? `Elige un periodo de hasta ${maxDays} días.` : "";
  const canApply = !!first && !!last && days > 0 && !error && startValid && endValid && end <= max;
  function apply(nextFrom: string, nextTo: string) {
    onChange(nextFrom, nextTo);
    setOpen(false);
  }

  return <Popover open={open} onOpenChange={next => {
    if (next) { setStart(from); setEnd(to); setStartValid(true); setEndValid(true); setMonth(startOfMonth(parseDate(from) ?? parseDate(max)!)); }
    setOpen(next);
  }}>
    <PopoverTrigger asChild>
      <Button type="button" variant={active ? "default" : "outline"} className="h-11 max-w-full whitespace-normal text-left">
        <CalendarRange aria-hidden="true" />{from && to ? `${fmtDate(from)} — ${fmtDate(to)}` : label}
      </Button>
    </PopoverTrigger>
    <PopoverContent onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); } }} align={align} aria-label="Elegir periodo" collisionPadding={2}
      className="!animate-none w-auto max-w-[calc(100vw-4px)] p-0.5 max-h-[var(--radix-popover-content-available-height)] flex flex-col overflow-hidden">
      <div data-date-scope className="flex min-h-0 flex-col">
        <div className="min-h-0 overflow-y-auto">
        {shortcuts && <div className="grid grid-cols-3 gap-1 border-b p-1 mb-2">
          {[{ label: "Hoy", start: max }, { label: "7 días", start: fmtIso(addDays(parseDate(max)!, -6)) }, { label: "Este mes", start: fmtIso(startOfMonth(parseDate(max)!)) }].map(preset =>
            <Button type="button" key={preset.label} variant="ghost" className="h-11 px-2" onClick={() => apply(preset.start, max)}>{preset.label}</Button>)}
        </div>}
        <div className="grid grid-cols-2 gap-2 px-2 pt-1 pb-3 w-[308px]">
          <div><Label htmlFor={`${id}-from`}>Desde</Label><DateInput key={`from-${calendarRevision}`} id={`${id}-from`} calendar={false} value={start} max={max} onValueChange={setStart} onValidityChange={setStartValid} /></div>
          <div><Label htmlFor={`${id}-to`}>Hasta</Label><DateInput key={`to-${calendarRevision}`} id={`${id}-to`} calendar={false} value={end} max={max} onValueChange={setEnd} onValidityChange={setEndValid} /></div>
        </div>
        <Calendar mode="range" month={month} onMonthChange={setMonth}
          startMonth={new Date(1900, 0, 1)} endMonth={parseDate(max)!} disabled={{ after: parseDate(max)! }}
          selected={first ? { from: first, to: last ?? undefined } : undefined}
          onSelect={(_range, day, modifiers) => {
            if (modifiers.disabled) return;
            setCalendarRevision(revision => revision + 1);
            const iso = fmtIso(day);
            if (!start || end || iso < start) { setStart(iso); setEnd(""); }
            else setEnd(iso);
          }} />
        {error && <p role="alert" className="px-2 pt-2 text-sm text-destructive w-[308px]">{error}</p>}
        {clearable && <Button type="button" variant="ghost" className="h-11 w-full mt-1" onClick={() => apply("", "")}>Todas las fechas</Button>}
        </div>
        <div className="flex shrink-0 justify-end gap-2 border-t mt-2 p-2">
          <Button type="button" variant="ghost" className="h-11" onClick={() => setOpen(false)}>Cancelar</Button>
          <Button type="button" className="h-11" disabled={!canApply} onClick={event => { if (validateDateFields(event)) apply(start, end); }}>Aplicar</Button>
        </div>
      </div>
    </PopoverContent>
  </Popover>;
}
