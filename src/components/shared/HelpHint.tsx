import { CircleHelp } from "lucide-react";
import { Link } from "react-router-dom";
import { cn } from "@/lib/utils";

// Ayuda en contexto: un enlace discreto junto al título de las pantallas de
// recepción que abre en Ayuda exactamente el tema de esa pantalla (la Ayuda
// funciona sin internet). Un solo patrón y una sola etiqueta en toda la app.

export type HelpTopic =
  | "buscar-socio"
  | "cobrar"
  | "entrada"
  | "caja"
  | "vender";

interface Props {
  topic: HelpTopic;
  /** Nombre de la tarea, para lectores de pantalla: «contar y cerrar caja». */
  task: string;
  className?: string;
}

export function HelpHint({ topic, task, className }: Props) {
  return (
    <Link
      to={`/help#${topic}`}
      aria-label={`Cómo funciona: ${task}`}
      title={`Ayuda: ${task}`}
      className={cn(
        "inline-flex min-h-11 items-center gap-1.5 rounded-md px-2 text-sm text-muted-foreground transition-colors hover:bg-muted hover:text-foreground",
        className,
      )}
    >
      <CircleHelp aria-hidden className="h-4 w-4" />
      Cómo funciona
    </Link>
  );
}
