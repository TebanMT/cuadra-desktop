import { useEffect, useState } from "react";
import { isTauri } from "@/lib/utils";

// useWindowPresence — ¿existe ahora mismo una WebviewWindow con este label?
//
// Lo usan dos superficies:
//   - GlobalCheckinScanner y CheckinPage (main): con kiosko o flotante
//     abiertos, el tono del resultado lo pone esa superficie y la main
//     sólo pinta (anti doble-feedback).
//   - TopBar: deshabilitar el launcher del kiosko cuando la flotante está
//     abierta y viceversa (exclusión mutua).
//
// Mecánica: poll de getByLabel como fuente de verdad + listeners de
// tauri://window-created / window-destroyed para reaccionar rápido. El poll
// existe porque los eventos de lifecycle no están garantizados si esta
// ventana estaba en background cuando se emitieron; con el poll, un evento
// perdido se corrige solo en ≤ pollMs en lugar de dejar estado colgado.
//
// Fuera de Tauri (vite dev / vitest) devuelve siempre false — no hay
// concepto de multi-ventana coordinable ahí.
const DEFAULT_POLL_MS = 1_500;

// El payload de window-created/destroyed varía entre string y objeto según
// la versión del runtime — mismo manejo defensivo que el provider.
function labelFromPayload(payload: unknown): string | undefined {
  if (typeof payload === "string") return payload;
  if (payload && typeof payload === "object") {
    const l = (payload as { label?: unknown }).label;
    if (typeof l === "string") return l;
  }
  return undefined;
}

export function useWindowPresence(label: string, pollMs = DEFAULT_POLL_MS): boolean {
  const [present, setPresent] = useState(false);

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    const cleanups: Array<() => void> = [];

    (async () => {
      const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
      const { listen } = await import("@tauri-apps/api/event");

      const probe = async () => {
        try {
          const win = await WebviewWindow.getByLabel(label);
          if (!cancelled) setPresent(!!win);
        } catch {
          // IPC transitorio — el siguiente tick del poll corrige.
        }
      };

      await probe();
      if (cancelled) return;

      const interval = window.setInterval(probe, pollMs);
      cleanups.push(() => window.clearInterval(interval));

      const onCreated = await listen("tauri://window-created", (e) => {
        if (labelFromPayload(e.payload) === label) setPresent(true);
      });
      cleanups.push(onCreated);

      const onDestroyed = await listen("tauri://window-destroyed", (e) => {
        if (labelFromPayload(e.payload) === label) setPresent(false);
      });
      cleanups.push(onDestroyed);
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((c) => {
        try {
          c();
        } catch {
          // best effort
        }
      });
    };
  }, [label, pollMs]);

  return present;
}
