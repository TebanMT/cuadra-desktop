import { useEffect } from "react";
import { Delete } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { checkin as t } from "@/strings/checkin";

const KEYS: Array<string | "back" | "submit"> = [
  "1", "2", "3",
  "4", "5", "6",
  "7", "8", "9",
  "back", "0", "submit",
];

interface Props {
  value: string;
  onChange(next: string): void;
  onSubmit(): void;
  disabled?: boolean;
  size?: "md" | "lg";
  enableKeyboard?: boolean;
  /** aria-label de los dígitos. Default: "Número de socio" (check-in). El
   * flujo de PIN del operador (ProfilePage) pasa el suyo — el componente es
   * un teclado numérico genérico. */
  ariaLabel?: string;
}

// NOTA (ADR-010): el teclado asume un número de socio de 4 dígitos — el rango
// inicial [1000,9999] y el caso real del 100% de los gyms de barrio (target:
// 30–150 socios). El "bump" de dígitos sólo ocurre al ~50% de consumo del
// espacio (≈4,500 socios), fuera de ese mercado. Para gyms que lleguen ahí, el
// check-in por número de 5+ dígitos queda pendiente (usar huella o búsqueda
// manual mientras tanto). Hacerlo variable aquí degradaría el auto-submit del
// kiosko (KioskPage auto-envía al llegar a 4 dígitos) para el 99% de los casos.
export function NumberPad({ value, onChange, onSubmit, disabled, size = "md", enableKeyboard = true, ariaLabel }: Props) {
  useEffect(() => {
    if (!enableKeyboard) return;
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
      }
      if (disabled) return;
      if (/^[0-9]$/.test(e.key)) {
        e.preventDefault();
        if (value.length < 4) onChange(value + e.key);
        return;
      }
      if (e.key === "Backspace") {
        e.preventDefault();
        onChange(value.slice(0, -1));
        return;
      }
      if (e.key === "Enter") {
        e.preventDefault();
        if (value.length === 4) onSubmit();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [value, onChange, onSubmit, disabled, enableKeyboard]);

  function handleKey(k: string | "back" | "submit") {
    if (disabled) return;
    if (k === "back") {
      onChange(value.slice(0, -1));
      return;
    }
    if (k === "submit") {
      if (value.length === 4) onSubmit();
      return;
    }
    if (value.length < 4) onChange(value + k);
  }

  const dotSize = size === "lg" ? "h-5 w-5" : "h-4 w-4";
  const slotSize = size === "lg" ? "h-16 w-12 text-3xl" : "h-12 w-9 text-2xl";
  const btnSize = size === "lg" ? "h-20 text-3xl" : "h-16 text-2xl";

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3" aria-label={ariaLabel ?? t.numberPad.ariaLabel}>
        {[0, 1, 2, 3].map((i) => {
          const filled = i < value.length;
          return (
            <div
              key={i}
              className={cn(
                "rounded-md border-2 flex items-center justify-center font-bold tabular-nums",
                slotSize,
                filled ? "border-primary bg-primary/10 text-primary" : "border-border bg-background"
              )}
            >
              {filled ? <span className={cn("rounded-full bg-primary", dotSize)} /> : ""}
            </div>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-3 max-w-md mx-auto">
        {KEYS.map((k) => {
          if (k === "back") {
            return (
              <Button
                key="back"
                type="button"
                variant="outline"
                className={cn(btnSize)}
                onClick={() => handleKey("back")}
                disabled={disabled || value.length === 0}
                aria-label={t.numberPad.backspace}
              >
                <Delete className="h-6 w-6" />
              </Button>
            );
          }
          if (k === "submit") {
            return (
              <Button
                key="submit"
                type="button"
                className={cn(btnSize)}
                onClick={() => handleKey("submit")}
                disabled={disabled || value.length !== 4}
              >
                {t.numberPad.submit}
              </Button>
            );
          }
          return (
            <Button
              key={k}
              type="button"
              variant="outline"
              className={cn(btnSize, "font-semibold tabular-nums")}
              onClick={() => handleKey(k)}
              disabled={disabled}
            >
              {k}
            </Button>
          );
        })}
      </div>
    </div>
  );
}
