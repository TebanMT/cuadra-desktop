import { useEffect, useState } from "react";
import { isTauri } from "@/lib/utils";
import { isKioskWindowOpen } from "@/lib/kioskWindow";

// Devuelve si la ventana del kiosko está actualmente abierta. Se sondea
// al montar, cada vez que la ventana actual recibe foco (cubre el caso
// "operador cerró kiosko y volvió a la main"), y cuando otra ventana se
// crea (`tauri://window-created`). Fuera de Tauri retorna siempre false.
export function useKioskWindowOpen(): boolean {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;

    async function refresh() {
      const present = await isKioskWindowOpen();
      if (!cancelled) setOpen(present);
    }
    refresh();

    let unlistenCreated: (() => void) | undefined;
    let unlistenFocus: (() => void) | undefined;

    (async () => {
      const { listen } = await import("@tauri-apps/api/event");
      unlistenCreated = await listen("tauri://window-created", () => {
        refresh();
      });
      unlistenFocus = await listen("tauri://focus", () => {
        refresh();
      });
    })();

    return () => {
      cancelled = true;
      unlistenCreated?.();
      unlistenFocus?.();
    };
  }, []);

  return open;
}
