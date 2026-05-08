import * as React from "react";
import { cn } from "@/lib/utils";

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Petzul-style page header: title + subtitle on the left, primary actions
 * on the right. No KPIs in the header — those live in StatCards directly
 * inside the page body.
 */
export function PageHeader({ title, subtitle, actions }: PageHeaderProps) {
  return (
    <div className="flex items-start justify-between gap-4 flex-wrap">
      <div className="space-y-1 min-w-0">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {title}
        </h1>
        {subtitle && (
          <div className="text-sm text-muted-foreground">{subtitle}</div>
        )}
      </div>
      {actions && <div className="flex items-center gap-2 flex-wrap">{actions}</div>}
    </div>
  );
}

interface SectionCardProps {
  children: React.ReactNode;
  className?: string;
  title?: React.ReactNode;
  description?: React.ReactNode;
  action?: React.ReactNode;
  /** When true, content is rendered without padding (use for tables / lists). */
  flush?: boolean;
}

/** Petzul-style Card with optional CardHeader area. */
export function SectionCard({
  children,
  className,
  title,
  description,
  action,
  flush = false,
}: SectionCardProps) {
  return (
    <section
      className={cn(
        "rounded-xl border border-border bg-card text-card-foreground shadow-sm",
        className
      )}
    >
      {(title || action) && (
        <header className="flex items-start justify-between gap-3 px-6 pt-5 pb-4">
          <div>
            {title && (
              <h2 className="text-base font-semibold text-foreground tracking-tight leading-none">
                {title}
              </h2>
            )}
            {description && (
              <p className="text-sm text-muted-foreground mt-1">{description}</p>
            )}
          </div>
          {action && <div className="flex items-center gap-2">{action}</div>}
        </header>
      )}
      <div className={cn(!flush && "px-6 pb-6", title || action ? "" : "pt-6")}>
        {children}
      </div>
    </section>
  );
}

interface FilterPillProps {
  active: boolean;
  label: string;
  count?: number;
  onClick(): void;
}

/** Tab-style segment used as filter (Petzul tabs). */
export function FilterPill({ active, label, count, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-2 h-9 px-3.5 rounded-md text-sm font-medium transition-colors shrink-0",
        active
          ? "bg-foreground text-background"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            "tabular text-xs",
            active ? "text-background/80" : "text-muted-foreground"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

interface EmptyStateProps {
  icon?: React.ReactNode;
  title: string;
  hint?: string;
  action?: React.ReactNode;
}

/**
 * Empty state — espacio respirado, heading en Fraunces (uno de los pocos
 * lugares donde la app usa display serif), subtítulo semantic
 * muted-foreground con max-w para que el copy no se estire en pantallas
 * anchas.
 *
 * Icon container: paper-200 en light, ink-700 lift en dark. Icon es
 * opcional; sin él, el heading queda solo (variante austera para empty
 * states dentro de widgets pequeños).
 */
export function EmptyState({ icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 sm:py-16 px-6 text-center">
      {icon && (
        <div className="h-14 w-14 rounded-full bg-paper-200 dark:bg-ink-700 flex items-center justify-center mb-5 text-ink-400 dark:text-ink-300">
          {icon}
        </div>
      )}
      <h3 className="font-display text-2xl font-semibold text-foreground leading-tight">
        {title}
      </h3>
      {hint && (
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
          {hint}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Plain table built to Petzul style (thead bg-muted/40, divide-y body). */
export function DataTable({ children, className }: { children: React.ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-x-auto", className)}>
      <table className="w-full">{children}</table>
    </div>
  );
}

export function DataTableHead({ children }: { children: React.ReactNode }) {
  return (
    <thead className="border-b border-border bg-muted/40">
      <tr>{children}</tr>
    </thead>
  );
}

export function DataTableTh({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return (
    <th
      scope="col"
      className={cn(
        "px-5 py-3 text-left text-[11px] font-semibold uppercase tracking-[0.06em] text-muted-foreground",
        className
      )}
    >
      {children}
    </th>
  );
}

export function DataTableBody({ children }: { children: React.ReactNode }) {
  return <tbody className="divide-y divide-border">{children}</tbody>;
}

export function DataTableRow({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-muted/50",
        className
      )}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  children,
  className,
}: {
  children?: React.ReactNode;
  className?: string;
}) {
  return <td className={cn("px-5 py-3 text-sm", className)}>{children}</td>;
}
