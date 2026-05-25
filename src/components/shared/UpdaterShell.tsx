// UpdaterShell — monta el auto-update loop + el modal bloqueante de
// "schema upgrade required" en el árbol post-login. Vive dentro de
// ProtectedRoute para que no corra antes de tener sidecar (el check
// inicial necesita conectividad — si todo el ciclo arranca pre-login
// y el sidecar está caído, el primer fetch falla y el hook se queda
// en error state).
//
// Ojo: usa el hook useUpdater (no es lazy). Eso significa que sólo hay
// UN poll de check vivo por sesión, no múltiples.

import { useEffect, useState } from "react";
import { Outlet } from "react-router-dom";
import { AlertCircle, X } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { useUpdater } from "@/hooks/useUpdater";
import {
  clearRollbackMarker,
  readRollbackMarker,
  type RollbackMarker,
} from "@/lib/updater";

export function UpdaterShell() {
  // useUpdater corre check al boot + cada 6h y maneja el toast discreto.
  // El return da acceso al installNow() que invocamos desde el modal.
  const updater = useUpdater();
  // useSyncStatus se monta también en la SyncIndicator del header — react-query
  // dedupea por key, así que esto NO duplica polls. Sólo nos suscribimos al
  // mismo cache para reaccionar al estado schema_upgrade_required.
  const sync = useSyncStatus();
  const schemaStale = sync.data?.state === "schema_upgrade_required";

  // Banner de auto-rollback: si la corrida anterior crasheó 2x y disparó
  // rollback, lo mostramos hasta que el dueño lo cierre. Una sola lectura
  // por sesión — clearRollbackMarker lo borra del disco al dismissar.
  const [rollback, setRollback] = useState<RollbackMarker | null>(null);
  useEffect(() => {
    let cancelled = false;
    void readRollbackMarker().then((m) => {
      if (!cancelled) setRollback(m);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <>
      {rollback && (
        <div className="border-b border-amber-500/40 bg-amber-50 text-amber-900 dark:bg-amber-950 dark:text-amber-100">
          <div className="max-w-7xl mx-auto px-4 py-2 flex items-start gap-3 text-sm">
            <AlertCircle className="h-4 w-4 mt-0.5 shrink-0" />
            <div className="flex-1 min-w-0">
              <strong className="font-semibold">
                Tinta detectó fallas al arrancar.
              </strong>{" "}
              {rollback.rolled_back
                ? "Volvimos automáticamente a la versión anterior. Si sigue con problemas, llama a soporte."
                : "No pudimos reinstalar la versión anterior por nuestra cuenta. Llama a soporte para que te la envíen."}
            </div>
            <button
              aria-label="Cerrar aviso"
              className="shrink-0 rounded p-1 hover:bg-amber-200/60 dark:hover:bg-amber-900/60"
              onClick={() => {
                void clearRollbackMarker();
                setRollback(null);
              }}
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
      )}
      <AlertDialog open={schemaStale}>
        <AlertDialogContent
          // Sin botón de cerrar — es bloqueante. La única salida es
          // aplicar el update.
          onEscapeKeyDown={(e) => e.preventDefault()}
        >
          <AlertDialogHeader>
            <AlertDialogTitle>Tu versión de Tinta ya no es compatible</AlertDialogTitle>
            <AlertDialogDescription>
              La nube actualizó la forma en que Tinta sincroniza datos. Hace
              falta que actualices el programa para seguir trabajando. La
              actualización tarda un par de minutos.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction
              disabled={updater.installing}
              onClick={() => {
                if (updater.available) {
                  void updater.installNow();
                } else {
                  // No hay update visible todavía — forzamos un check.
                  // El siguiente render verá `available` y el botón
                  // queda listo. Pasa raras veces (race entre sidecar
                  // que ya recibió 426 y release.yml todavía sin
                  // publicar al manifest); el operador puede tocar
                  // el botón otra vez.
                  void updater.triggerCheck();
                }
              }}
            >
              {updater.installing ? "Instalando…" : "Actualizar ahora"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <Outlet />
    </>
  );
}
