// AboutTintaPage — "Sobre Tinta" en Ajustes (ADR-005 §2.8).
//
// Muestra la versión instalada, cuándo se hizo el último check de updates,
// notas del cambio si hay update disponible, y un botón "Buscar
// actualizaciones" para override manual. Tono tuteo mexicano.
//
// Accesible para operador y dueño — el operador también necesita ver la
// versión cuando llama a soporte.

import { Loader2, RefreshCw, Info } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useUpdater } from "@/hooks/useUpdater";

function formatDate(d: Date | null): string {
  if (!d) return "—";
  return new Intl.DateTimeFormat("es-MX", {
    dateStyle: "long",
    timeStyle: "short",
  }).format(d);
}

export default function AboutTintaPage() {
  const updater = useUpdater();

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <header className="space-y-1">
        <h1 className="text-3xl font-bold text-foreground" style={{ letterSpacing: "-0.02em" }}>
          Sobre Tinta
        </h1>
        <p className="text-sm text-muted-foreground">
          Versión instalada y actualizaciones del programa.
        </p>
      </header>

      <section className="rounded-xl border border-border bg-card p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-sm text-muted-foreground">Versión instalada</div>
            <div className="text-2xl font-semibold mt-0.5">{updater.currentVersion}</div>
          </div>
          <span className="inline-flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary">
            <Info className="h-5 w-5" />
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
          <div>
            <div className="text-muted-foreground">Último chequeo</div>
            <div className="mt-0.5">{formatDate(updater.lastCheck)}</div>
          </div>
          <div>
            <div className="text-muted-foreground">Estado</div>
            <div className="mt-0.5">
              {updater.available
                ? `Hay una actualización lista (${updater.available.version}).`
                : "Estás en la última versión."}
            </div>
          </div>
        </div>

        {updater.available?.notes && (
          <div>
            <div className="text-sm text-muted-foreground mb-1">Qué cambia en esta versión</div>
            <div className="text-sm whitespace-pre-line rounded-md border border-border/50 bg-muted/30 p-3">
              {updater.available.notes}
            </div>
          </div>
        )}

        <div className="flex flex-wrap gap-2 pt-2">
          <Button
            variant="outline"
            disabled={updater.checking}
            onClick={() => {
              void updater.triggerCheck();
            }}
          >
            {updater.checking ? (
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
            ) : (
              <RefreshCw className="h-4 w-4 mr-2" />
            )}
            Buscar actualizaciones
          </Button>
          {updater.available && (
            <Button
              disabled={updater.installing}
              onClick={() => {
                void updater.installNow();
              }}
            >
              {updater.installing ? (
                <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              ) : null}
              {updater.installing ? "Instalando…" : "Instalar ahora"}
            </Button>
          )}
        </div>
      </section>

      <section className="text-xs text-muted-foreground space-y-1">
        <p>
          Tinta se actualiza sola en segundo plano. La próxima vez que cierres y
          vuelvas a abrir el programa, se instala lo nuevo.
        </p>
        <p>
          Si algo no funciona después de una actualización, Tinta vuelve sola a
          la versión anterior. No tienes que hacer nada.
        </p>
      </section>
    </div>
  );
}
