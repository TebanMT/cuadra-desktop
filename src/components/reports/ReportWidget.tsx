import * as React from "react";
import { cn } from "@/lib/utils";

// ---------------------------------------------------------------------------
// ReportWidget + WidgetGrid — plan Reports-improve fase 0.2/0.3, adoptado por
// el desktop en fase 2 (mismo sistema que cuadra-dashboard).
//
// Todo reporte es "meter contenido a un widget": título 13px a la izquierda,
// dato-resumen a la derecha, slot de contenido de ALTURA FIJA con estados
// por tarjeta (skeleton del mismo tamaño, vacío, error) — la página nunca
// brinca. Grid 2 columnas → 1 en móvil, alturas uniformes por construcción.
// ---------------------------------------------------------------------------

/** Altura estándar del contenido de un widget (~224px). */
export const WIDGET_CONTENT_H = "h-56";

interface ReportWidgetProps {
  title: string;
  /** Dato-resumen del header, alineado a la derecha ("total: 31"). */
  summary?: React.ReactNode;
  loading?: boolean;
  error?: boolean;
  empty?: boolean;
  emptyText?: string;
  errorText?: string;
  /** Listas más largas que la tarjeta scrollean dentro del slot. */
  scroll?: boolean;
  className?: string;
  children?: React.ReactNode;
}

export function ReportWidget({
  title,
  summary,
  loading,
  error,
  empty,
  emptyText = "Sin datos en este período.",
  errorText = "No pudimos cargar esta tarjeta.",
  scroll,
  className,
  children,
}: ReportWidgetProps) {
  let body: React.ReactNode;
  if (loading) {
    body = <div className="h-full w-full rounded-lg bg-muted animate-pulse" />;
  } else if (error) {
    body = (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground text-center px-4">
          {errorText}
        </p>
      </div>
    );
  } else if (empty) {
    body = (
      <div className="flex h-full items-center justify-center">
        <p className="text-sm text-muted-foreground text-center px-4">
          {emptyText}
        </p>
      </div>
    );
  } else {
    body = children;
  }

  return (
    <section
      className={cn(
        "min-w-0 rounded-xl border border-border bg-card shadow-sm",
        className,
      )}
    >
      <header className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2 px-4 sm:px-5 pt-4 pb-2.5">
        <h3 className="text-[13px] font-semibold text-foreground leading-snug">
          {title}
        </h3>
        {summary != null && (
          <span className="text-xs text-muted-foreground tabular leading-snug">
            {summary}
          </span>
        )}
      </header>
      <div
        className={cn(
          "min-w-0 px-4 sm:px-5 pb-4",
          scroll && !loading && !error && !empty
            ? "max-h-[32rem] overflow-auto"
            : `${WIDGET_CONTENT_H} overflow-hidden`,
        )}
      >
        {body}
      </div>
    </section>
  );
}

export function WidgetGrid({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("grid gap-4 md:grid-cols-2", className)}>{children}</div>
  );
}

// ---------------------------------------------------------------------------
// BreakdownList — el patrón "label + monto + barra de proporción" que
// comparten Métodos de pago / Gastos por categoría. Las barras usan el
// acento (o el rojo para egresos); el texto va en tokens de texto.
// ---------------------------------------------------------------------------

export interface BreakdownRow {
  key: string;
  label: string;
  value: number;
}

export function BreakdownList({
  rows,
  total,
  fmtValue,
  barClassName = "bg-primary",
  className,
}: {
  rows: BreakdownRow[];
  /** Base del porcentaje. Default: suma de los rows. */
  total?: number;
  fmtValue: (v: number) => string;
  /** Color de la barra — bg-primary (default) o bg-destructive/70 (egresos). */
  barClassName?: string;
  className?: string;
}) {
  const base = total ?? rows.reduce((sum, r) => sum + r.value, 0);
  return (
    <ul className={cn("space-y-3", className)}>
      {rows.map((r) => {
        const pct = base > 0 ? (r.value / base) * 100 : 0;
        return (
          <li key={r.key}>
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-2">
              <span className="text-sm text-foreground truncate">
                {r.label}
              </span>
              <span className="tabular text-sm font-semibold text-foreground shrink-0">
                {fmtValue(r.value)}
                <span className="ml-1.5 text-xs font-normal text-muted-foreground">
                  {pct.toFixed(0)}%
                </span>
              </span>
            </div>
            <div className="mt-1.5 h-1.5 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  "h-full rounded-full transition-all",
                  barClassName,
                )}
                style={{ width: `${pct}%` }}
              />
            </div>
          </li>
        );
      })}
    </ul>
  );
}
