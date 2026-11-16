import { CheckCircle2, CircleDashed, Clock3, XCircle } from "lucide-react";
import { cn } from "@/lib/utils";
import { vigenciaFrom, vigenciaText, type Vigencia, type VigenciaInput, type VigenciaTone } from "@/lib/vigencia";

// La insignia de vigencia es el objeto firma de Tinta: la misma forma en
// búsqueda, lista, ficha, cobro y entradas. Siempre lleva icono y palabra;
// el color sólo refuerza. Nunca usa el azul de marca (la marca no es estado).

const TONE: Record<VigenciaTone, { cls: string; Icon: typeof CheckCircle2 }> = {
  success: { cls: "border-success/35 bg-success-soft text-success-text", Icon: CheckCircle2 },
  warning: { cls: "border-warning/45 bg-warning-soft text-warning-foreground", Icon: Clock3 },
  destructive: { cls: "border-destructive/40 bg-destructive-soft text-destructive-text", Icon: XCircle },
  neutral: { cls: "border-border bg-muted text-muted-foreground", Icon: CircleDashed },
};

interface Props extends VigenciaInput {
  vigencia?: Vigencia;
  size?: "sm" | "md";
  /** Ocultar la precisión («hasta 3 dic») cuando la columna ya la muestra. */
  hideDetail?: boolean;
  className?: string;
}

export function VigenciaBadge({ vigencia, accessStatus, expiryDate, size = "sm", hideDetail, className }: Props) {
  const v = vigencia ?? vigenciaFrom({ accessStatus, expiryDate });
  const { cls, Icon } = TONE[v.tone];
  const showDetail = !hideDetail && !!v.detail;
  return (
    <span
      className={cn(
        "inline-flex max-w-full shrink-0 items-center gap-1.5 whitespace-nowrap rounded-full border font-medium leading-none tabular",
        size === "sm" ? "h-6 px-2 text-xs" : "h-8 px-3 text-sm",
        cls,
        className,
      )}
      title={vigenciaText(v)}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5 shrink-0" : "h-4 w-4 shrink-0"} aria-hidden strokeWidth={2.25} />
      <span className="font-semibold">{v.label}</span>
      {showDetail && (
        <>
          <span aria-hidden className="opacity-60">·</span>
          <span className="truncate">{v.detail}</span>
        </>
      )}
    </span>
  );
}
