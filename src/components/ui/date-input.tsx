import { useEffect, useId, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from "react";
import { addDays, startOfMonth } from "date-fns";
import { CalendarDays } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { fmtIso, parseDate, todayIso } from "@/lib/dates";
import { dateInputError, displayDateInput, formatDateTyping, parseDateInput } from "@/lib/date-input";
import { cn } from "@/lib/utils";

interface DateInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, "type" | "value" | "defaultValue" | "onChange" | "min" | "max"> {
  value: string;
  onValueChange: (iso: string) => void;
  min?: string;
  max?: string;
  context?: "date" | "recent" | "birthdate";
  calendar?: boolean;
  /** Supplied by the screen when its business day differs from the device's. */
  today?: string;
  onValidityChange?: (valid: boolean) => void;
}

export function DateInput({ value, onValueChange, min, max, context = "date", calendar = true, today = todayIso(),
  onValidityChange, className, disabled, readOnly, id, onBlur, onKeyDown, ...props }: DateInputProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;
  const errorId = `${inputId}-date-error`;
  const inputRef = useRef<HTMLInputElement>(null);
  const calendarRef = useRef<HTMLDivElement>(null);
  const [text, setText] = useState(() => displayDateInput(value));
  const [touched, setTouched] = useState(false);
  const [open, setOpen] = useState(false);
  const [month, setMonth] = useState(() => startOfMonth(parseDate(value) ?? parseDate(today)!));
  const upper = max ?? (context === "birthdate" ? today : undefined);
  const error = dateInputError(text, min, upper);
  const selected = parseDate(parseDateInput(text) ?? "") ?? undefined;

  useEffect(() => { setText(displayDateInput(value)); setTouched(false); }, [value]);
  useLayoutEffect(() => {
    inputRef.current?.setCustomValidity(error);
    onValidityChange?.(!error);
  }, [error, onValidityChange]);
  useEffect(() => { if (disabled || readOnly) setOpen(false); }, [disabled, readOnly]);
  useEffect(() => {
    if (!open) return;
    // Move focus into the calendar for both the button and ArrowDown.
    const frame = requestAnimationFrame(() => {
      calendarRef.current?.querySelector<HTMLButtonElement>(".rdp-day_button[tabindex='0']")?.focus();
    });
    return () => cancelAnimationFrame(frame);
  }, [open]);

  function closeCalendar() {
    setOpen(false);
    inputRef.current?.focus();
  }

  function choose(iso: string) {
    if (inputRef.current?.matches(":disabled") || readOnly || dateInputError(iso, min, upper)) return;
    setText(displayDateInput(iso));
    setTouched(false);
    onValueChange(iso);
    closeCalendar();
  }

  const start = parseDate(min) ?? new Date(Math.min(1900, selected?.getFullYear() ?? 1900), 0, 1);
  const end = parseDate(upper) ?? new Date(Math.max(new Date().getFullYear() + 20, selected?.getFullYear() ?? 0), 11, 31);
  return <div className={cn("min-w-0 w-full", className)}>
    <Popover open={open} onOpenChange={next => {
      if (next && (inputRef.current?.matches(":disabled") || readOnly)) return;
      if (next) setMonth(startOfMonth(selected ?? parseDate(today)!));
      setOpen(next);
    }}>
      <div className="relative">
        <Input {...props} id={inputId} ref={inputRef} type="text" inputMode="numeric" autoComplete="off"
          placeholder="DD/MM/AAAA" value={text} disabled={disabled} readOnly={readOnly}
          data-date-input="" className={cn("h-11 min-w-0 tabular-nums", calendar && "pr-12")}
          aria-invalid={!!error || props["aria-invalid"]}
          aria-describedby={[props["aria-describedby"], touched && error ? errorId : ""].filter(Boolean).join(" ") || undefined}
          onChange={event => {
            const next = formatDateTyping(event.target.value);
            setText(next);
            const iso = parseDateInput(next);
            if (iso !== null && !dateInputError(next, min, upper)) onValueChange(iso);
          }}
          onInvalid={() => setTouched(true)}
          onBlur={event => {
            setTouched(true);
            const iso = parseDateInput(text);
            if (iso !== null && !error) setText(displayDateInput(iso));
            onBlur?.(event);
          }}
          onKeyDown={event => {
            if (event.key === "ArrowDown" && calendar && !readOnly) { event.preventDefault(); setMonth(startOfMonth(selected ?? parseDate(today)!)); setOpen(true); }
            if (event.key === "Enter" && error) { event.preventDefault(); setTouched(true); inputRef.current?.reportValidity(); }
            if (event.key === "Escape" && open) { event.preventDefault(); event.stopPropagation(); closeCalendar(); }
            onKeyDown?.(event);
          }} />
        {calendar && <PopoverTrigger asChild>
          <Button type="button" variant="ghost" disabled={disabled || readOnly}
            className="absolute right-0 top-0 h-11 w-11 rounded-l-none p-0"
            aria-label={props["aria-label"] ? `Abrir calendario: ${props["aria-label"]}` : "Abrir calendario"}>
            <CalendarDays className="h-5 w-5" aria-hidden="true" />
          </Button>
        </PopoverTrigger>}
      </div>
      <PopoverContent ref={calendarRef} aria-label="Elegir fecha" onOpenAutoFocus={event => event.preventDefault()}
        onEscapeKeyDown={event => { event.preventDefault(); closeCalendar(); }}
        onKeyDown={event => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); closeCalendar(); } }}
        onCloseAutoFocus={event => event.preventDefault()}
        className="!animate-none w-auto max-w-[calc(100vw-4px)] p-0.5 max-h-[var(--radix-popover-content-available-height)] overflow-y-auto" collisionPadding={2}>
        {context === "recent" && <div className="flex gap-2 border-b p-2 mb-1">
          {[{ label: "Hoy", day: today }, { label: "Ayer", day: fmtIso(addDays(parseDate(today)!, -1)) }].map(({ label, day }) =>
            <Button key={label} type="button" variant="outline" className="h-11 flex-1" disabled={!!dateInputError(day, min, upper)} onClick={() => choose(day)}>{label}</Button>)}
        </div>}
        <Calendar mode="single" required autoFocus today={parseDate(today)!} selected={selected} month={month} onMonthChange={setMonth}
          startMonth={start} endMonth={end} reverseYears={context === "birthdate"}
          disabled={[...(min ? [{ before: parseDate(min)! }] : []), ...(upper ? [{ after: parseDate(upper)! }] : [])]}
          onSelect={date => { if (date) choose(fmtIso(date)); }} />
      </PopoverContent>
    </Popover>
    {touched && error && <p id={errorId} role="alert" className="mt-1 text-sm text-destructive">{error}</p>}
  </div>;
}
