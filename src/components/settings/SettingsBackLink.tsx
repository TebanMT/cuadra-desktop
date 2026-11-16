import { Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";
import { settings as t } from "@/strings/settings";

// Regreso único para las subpáginas de Configuración. Vive arriba del
// título, siempre en el mismo lugar, para que nadie dependa de la barra
// lateral ni del botón «atrás» del sistema para volver al índice.
export function SettingsBackLink({ className }: { className?: string }) {
  return (
    <Link
      to="/settings"
      className={cn(
        "-ml-1 inline-flex min-h-11 items-center gap-1.5 rounded-md px-1 text-sm font-medium text-muted-foreground transition-colors hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        className,
      )}
    >
      <ArrowLeft aria-hidden="true" className="h-4 w-4" />
      {t.index.back}
    </Link>
  );
}
