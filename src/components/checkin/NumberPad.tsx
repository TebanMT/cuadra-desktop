import { useEffect, useRef } from "react";
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
  /** Oculta credenciales; los números de socio permanecen legibles. */
  masked?: boolean;
  /** Keeps all four rows visible in the compact reception window. */
  adaptive?: boolean;
}

// NOTA (ADR-010): el teclado asume un número de socio de 4 dígitos — el rango
// inicial [1000,9999] y el caso real del 100% de los gyms de barrio (target:
// 30–150 socios). El "bump" de dígitos sólo ocurre al ~50% de consumo del
// espacio (≈4,500 socios), fuera de ese mercado. Para gyms que lleguen ahí, el
// check-in por número de 5+ dígitos queda pendiente (usar huella o búsqueda
// manual mientras tanto). Hacerlo variable aquí degradaría el auto-submit del
// kiosko (KioskPage auto-envía al llegar a 4 dígitos) para el 99% de los casos.
export function NumberPad({ value, onChange, onSubmit, disabled, size = "md", enableKeyboard = true, ariaLabel, masked = false, adaptive = false }: Props) {
  const padRef = useRef<HTMLDivElement>(null);
  const label = ariaLabel ?? t.numberPad.ariaLabel;
  useEffect(() => {
    if (!enableKeyboard) return;
    function onKey(e: KeyboardEvent) {
      if (e.defaultPrevented || e.ctrlKey || e.metaKey || e.altKey || e.isComposing) return;
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || tag === "select" || target.isContentEditable) return;
      }
      // Un diálogo superpuesto conserva sus propios controles y atajos.
      const dialog = target?.closest('[role="dialog"], [role="alertdialog"]');
      if (dialog && dialog !== padRef.current?.closest('[role="dialog"], [role="alertdialog"]')) return;
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
        // Enter sobre un botón/enlace debe activar ese control, nunca enviar
        // el PIN por encima de Cancelar, Cerrar o Borrar.
        if (e.repeat || target?.closest('button, a[href], [role="button"], [role="link"], [role="menuitem"], [role="radio"], [role="checkbox"], summary')) return;
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
  const btnSize = adaptive ? "h-[clamp(44px,calc((100dvh-440px)/4),64px)] text-2xl" : size === "lg" ? "h-20 text-3xl" : "h-16 text-2xl";

  return (
    <div ref={padRef} className={adaptive ? "space-y-2" : "space-y-4"} role="group" aria-label={label}>
      <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
        {masked
          ? `${label}: ${value.length} de 4 dígitos introducidos`
          : `${label}: ${value ? value.split("").join(" ") : "sin dígitos"}. ${value.length} de 4 dígitos introducidos`}
      </p>
      <div className="flex justify-center gap-3" aria-hidden="true">
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
              {filled ? (masked ? <span className={cn("rounded-full bg-primary", dotSize)} /> : value[i]) : ""}
            </div>
          );
        })}
      </div>

      <div className={cn("grid grid-cols-3 max-w-md mx-auto", adaptive ? "gap-2" : "gap-3")}>
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
