import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

// Pills tipo "soft" — bg tint + text del mismo hue. Disciplina semántica
// estricta:
//   success     → "Activo" / "Vigente" / "Pagado" (moss verde)
//   warning     → "Por vencer" / "Saldo pendiente" (ámbar dorado)
//   destructive → "Vencido" / Errores (rojo profundo)
//   secondary   → "Inactivo" / "Pausado" / "Sin plan" (NEUTRAL, NO rojo)
//   outline     → mismo estilo neutral con borde explícito
//   default     → CTA (terracota, brick-500)
//
// Dark mode: los `*-100` del light se vuelven opacity 20% del color
// (`bg-moss-500/20`) y el texto se levanta al `*-100` (que en dark luce
// como mint/yellow/pink claro suficiente para contraste).
const badgeVariants = cva(
  "inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors",
  {
    variants: {
      variant: {
        default: "bg-primary text-primary-foreground",
        secondary:
          "bg-paper-200 text-ink-500 dark:bg-ink-700 dark:text-ink-300",
        destructive:
          "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-100",
        success:
          "bg-moss-100 text-moss-700 dark:bg-moss-500/20 dark:text-moss-100",
        warning:
          "bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
        outline:
          "bg-paper-200 text-ink-500 border border-paper-300 dark:bg-ink-700 dark:text-ink-300 dark:border-ink-500",
      },
    },
    defaultVariants: { variant: "default" },
  }
);

export interface BadgeProps
  extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> {}

export function Badge({ className, variant, ...props }: BadgeProps) {
  return <div className={cn(badgeVariants({ variant }), className)} {...props} />;
}
