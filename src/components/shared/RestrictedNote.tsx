import { Lock } from "lucide-react";
import { cn } from "@/lib/utils";
import { permissionTitle, type Permission } from "@/lib/permissions";

// Un solo patrón para decir «aquí ves menos porque te falta un permiso».
// Nombra el permiso exacto para que el operador sepa qué pedir y nunca deja
// un vacío que parezca error o un cero que parezca dato.

interface Props {
  permission: Permission;
  /** Qué ve la persona en lugar de lo restringido: «Ves solo los cobros de hoy, sin totales.» */
  children?: React.ReactNode;
  className?: string;
  /** "inline" para una línea bajo un control; "panel" para ocupar el lugar de una sección. */
  variant?: "inline" | "panel";
}

export function RestrictedNote({ permission, children, className, variant = "inline" }: Props) {
  const ask = (
    <>
      Requiere el permiso <span className="font-medium text-foreground">«{permissionTitle(permission)}»</span>. Pídeselo al dueño.
    </>
  );
  if (variant === "panel") {
    return (
      <div className={cn("flex items-start gap-3 rounded-lg border border-dashed p-4 text-sm text-muted-foreground", className)} role="note">
        <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden />
        <p className="leading-relaxed">
          {children ? <>{children} </> : null}
          {ask}
        </p>
      </div>
    );
  }
  return (
    <p className={cn("flex items-start gap-1.5 text-xs leading-relaxed text-muted-foreground", className)} role="note">
      <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden />
      <span>
        {children ? <>{children} </> : null}
        {ask}
      </span>
    </p>
  );
}
