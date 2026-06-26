import * as React from "react";
import type { LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";

/**
 * KPI card — disciplina semántica estricta del spec terracota.
 *
 * tone selecciona el tinte del ícono pequeño (32×32) Y el color de la
 * tendencia opcional. NO afecta el número grande, que siempre va en
 * ink-900 / sans-serif tabular (Fraunces queda fuera de KPI numbers).
 */
export type StatTone = "neutral" | "accent" | "success" | "warning" | "danger";

interface StatCardProps {
  /** Label arriba — uppercase, tracking-wider, ink-400. */
  title: string;
  /** Número grande — sans-serif tabular, NO Fraunces. */
  value: string | number;
  /** Línea bajo el número (ej. "vs mes pasado"). */
  hint?: React.ReactNode;
  /** Tendencia coloreada (ej. "+12%"). El color sigue al `tone`. */
  delta?: React.ReactNode;
  /**
   * Tinte del ícono pequeño + tendencia. Disciplina:
   *   neutral → conteos de personas (Socios, Activos)
   *   accent  → KPIs destacados / promocionales (brick)
   *   success → ingresos, sincronizado, pagado (moss)
   *   warning → por vencer, saldo pendiente (ámbar dorado)
   *   danger  → vencidos, errores explícitos (rojo profundo)
   */
  tone?: StatTone;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
}

// Bg + texto del ícono — mismo hue, bg en variante "100" muy clara.
// Dark mode: bg pasa a opacity 20% del color sólido y texto a "100"
// (claro suficiente para contrastar sobre dark surface).
const TONE_ICON: Record<StatTone, string> = {
  neutral:
    "bg-paper-200 text-ink-700 dark:bg-ink-700 dark:text-paper-200",
  accent:
    "bg-brick-100 text-brick-500 dark:bg-brick-500/20 dark:text-brick-300",
  success:
    "bg-moss-100 text-moss-500 dark:bg-moss-500/20 dark:text-moss-100",
  warning:
    "bg-warning-100 text-warning-500 dark:bg-warning-500/20 dark:text-warning-100",
  danger:
    "bg-danger-100 text-danger-500 dark:bg-danger-500/20 dark:text-danger-100",
};

// Tendencia — un shade más oscuro que el ícono para legibilidad sobre
// fondo blanco del card en light. En dark: levanta al "100" / shade
// claro para que la tendencia sea legible sobre dark card.
const TONE_DELTA: Record<StatTone, string> = {
  neutral: "text-ink-500 dark:text-ink-300",
  accent: "text-brick-600 dark:text-brick-300",
  success: "text-moss-700 dark:text-moss-100",
  warning: "text-warning-700 dark:text-warning-100",
  danger: "text-danger-500 dark:text-danger-100",
};

export function StatCard({
  title,
  value,
  hint,
  delta,
  tone = "neutral",
  icon: Icon,
  onClick,
  className,
}: StatCardProps) {
  const interactive = !!onClick;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        // Container per spec: card blanco sobre paper-50, borde paper-300,
        // radius xl, padding generoso, sombra suave estilo landing.
        "rounded-xl border border-paper-300 bg-card p-5 sm:p-6 shadow-app transition-all",
        interactive &&
          "cursor-pointer hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      {/* Header row — label uppercase + ícono 32×32 a la derecha. */}
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-400 dark:text-ink-300 uppercase tracking-wider leading-tight pt-1">
          {title}
        </p>
        {Icon && (
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              TONE_ICON[tone]
            )}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
        )}
      </div>

      {/* Número central — sans-serif (NO Fraunces), tabular, ink-900 en
          light, paper-50 en dark. truncate + title como red de seguridad
          para gyms con ingresos extremos.
          Font scaling sigue al ancho REAL del card, no al viewport:
          en sm-md el grid es 2 cols (cards anchas) → text-3xl;
          en lg+ el grid se aprieta a 5 cols (cards ~140-240px útil) →
          escalamos abajo y subimos gradualmente con el breakpoint.
          Antes saltaba a text-4xl en xl y "$225,000.00" se truncaba en
          la mayoría de laptops. */}
      <p
        title={typeof value === "string" || typeof value === "number" ? String(value) : undefined}
        className="mt-3 text-2xl sm:text-3xl lg:text-xl xl:text-2xl 2xl:text-3xl font-bold tabular text-ink-900 dark:text-paper-50 leading-none truncate"
        style={{ letterSpacing: "-0.02em" }}
      >
        {value}
      </p>

      {/* Tendencia + hint debajo. */}
      {(delta || hint) && (
        <div className="mt-3 flex items-center gap-1.5 text-xs">
          {delta && (
            <span className={cn("font-semibold tabular", TONE_DELTA[tone])}>
              {delta}
            </span>
          )}
          {hint && <span className="text-ink-400 dark:text-ink-300">{hint}</span>}
        </div>
      )}
    </div>
  );
}

// Fila de un StatListCard: etiqueta a la izquierda, valor (tabular) a la
// derecha, con un chip opcional (ej. margen %) pegado al valor.
export interface StatListRow {
  label: string;
  value: React.ReactNode;
  chip?: React.ReactNode;
}

interface StatListCardProps {
  title: string;
  rows: StatListRow[];
  hint?: React.ReactNode;
  tone?: StatTone;
  icon?: LucideIcon;
  onClick?: () => void;
  className?: string;
}

/**
 * Variante de StatCard para mostrar DOS o más cifras relacionadas en un solo
 * card (ej. "Stock crítico" = bajos + agotados, "Ganancia" = del mes +
 * potencial) — para no multiplicar cards de una sola cifra. Comparte el shell
 * y el sistema de tonos con StatCard.
 */
export function StatListCard({
  title,
  rows,
  hint,
  tone = "neutral",
  icon: Icon,
  onClick,
  className,
}: StatListCardProps) {
  const interactive = !!onClick;
  return (
    <div
      role={interactive ? "button" : undefined}
      tabIndex={interactive ? 0 : undefined}
      onClick={onClick}
      onKeyDown={(e) => {
        if (interactive && (e.key === "Enter" || e.key === " ")) {
          e.preventDefault();
          onClick?.();
        }
      }}
      className={cn(
        "rounded-xl border border-paper-300 bg-card p-5 sm:p-6 shadow-app transition-all",
        interactive &&
          "cursor-pointer hover:border-ink-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <p className="text-xs font-medium text-ink-400 dark:text-ink-300 uppercase tracking-wider leading-tight pt-1">
          {title}
        </p>
        {Icon && (
          <div
            className={cn(
              "flex h-8 w-8 shrink-0 items-center justify-center rounded-lg",
              TONE_ICON[tone]
            )}
            aria-hidden="true"
          >
            <Icon className="h-4 w-4" strokeWidth={2} />
          </div>
        )}
      </div>

      <div className="mt-3 space-y-1.5">
        {rows.map((r, i) => (
          <div key={i} className="flex items-baseline justify-between gap-2">
            <span className="text-xs text-ink-400 dark:text-ink-300">
              {r.label}
            </span>
            <span className="flex items-baseline gap-1.5 min-w-0">
              <span
                className="text-lg font-bold tabular text-ink-900 dark:text-paper-50 leading-none truncate"
                style={{ letterSpacing: "-0.02em" }}
                title={typeof r.value === "string" ? r.value : undefined}
              >
                {r.value}
              </span>
              {r.chip && (
                <span className={cn("text-xs font-semibold tabular", TONE_DELTA[tone])}>
                  {r.chip}
                </span>
              )}
            </span>
          </div>
        ))}
      </div>

      {hint && (
        <div className="mt-3 text-xs text-ink-400 dark:text-ink-300">{hint}</div>
      )}
    </div>
  );
}
