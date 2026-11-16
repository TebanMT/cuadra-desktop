import * as React from "react";
import { cn } from "@/lib/utils";

/** Shared page origin. Narrow forms align with catalogs instead of recentering.
 * Embedded modules inherit their parent's gutters; workspaces use pane insets. */
export function PageContainer({ children, className, contentWidth = "full", embedded = false }: {
  children: React.ReactNode;
  className?: string;
  contentWidth?: "full" | "form" | "reading";
  embedded?: boolean;
}) {
  const content = <div className={cn("min-w-0", !embedded && contentWidth === "form" && "max-w-3xl", !embedded && contentWidth === "reading" && "max-w-4xl", className)}>{children}</div>;
  return embedded ? content : <div className="mx-auto w-full min-w-0 max-w-7xl p-6">{content}</div>;
}

interface PageHeaderProps {
  title: string;
  subtitle?: React.ReactNode;
  actions?: React.ReactNode;
}

/**
 * Page header: title + subtitle on the left, primary actions
 * on the right. Keep the title and contextual actions together.
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
  appearance?: "contained" | "plain";
}

/** Sections may use open composition or a contained surface. */
export function SectionCard({
  children,
  className,
  title,
  description,
  action,
  flush = false,
  appearance = "contained",
}: SectionCardProps) {
  return (
    <section
      className={cn(
        appearance === "plain" ? "text-foreground" : "rounded-xl border border-border bg-card text-card-foreground",
        className
      )}
    >
      {(title || action) && (
        <header className={cn("flex items-start justify-between gap-3 pb-4", appearance === "contained" && "px-6 pt-5")}>
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
      <div className={cn(appearance === "contained" && !flush && "px-6 pb-6", appearance === "contained" && !flush && !title && !action && "pt-6")}>
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

/** Named filter with a visible selection state. */
export function FilterPill({ active, label, count, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn(
        "inline-flex items-center gap-2 h-11 px-3.5 rounded-md text-sm font-medium transition-colors shrink-0",
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

/** Estado vacío con acción de recuperación cuando está disponible. */
export function EmptyState({ icon, title, hint, action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center justify-center py-14 sm:py-16 px-6 text-center">
      {icon && (
        <div className="h-14 w-14 rounded-full bg-paper-200 dark:bg-ink-700 flex items-center justify-center mb-5 text-ink-400 dark:text-ink-300">
          {icon}
        </div>
      )}
      <h2 className="font-display text-2xl text-foreground leading-tight">
        {title}
      </h2>
      {hint && (
        <p className="text-sm text-muted-foreground mt-2 max-w-md mx-auto leading-relaxed">
          {hint}
        </p>
      )}
      {action && <div className="mt-6">{action}</div>}
    </div>
  );
}

/** Table with separators and aligned operational data. */
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
        "px-5 py-3 text-left text-xs font-semibold text-muted-foreground",
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
  ...rest
}: React.ComponentPropsWithoutRef<"tr">) {
  return (
    <tr
      onClick={onClick}
      className={cn(
        "transition-colors",
        onClick && "cursor-pointer hover:bg-muted/50",
        className
      )}
      {...rest}
    >
      {children}
    </tr>
  );
}

export function DataTableCell({
  children,
  className,
  ...rest
}: React.ComponentPropsWithoutRef<"td">) {
  return (
    <td className={cn("px-5 py-3 text-sm", className)} {...rest}>
      {children}
    </td>
  );
}
