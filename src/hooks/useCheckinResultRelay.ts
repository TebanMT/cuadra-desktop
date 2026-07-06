import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/utils";
import type { CheckinEvent } from "@/hooks/useCheckin";

// Relay de resultados de check-in por huella ENTRE ventanas, vía evento
// Tauri. Generaliza el viejo relay kiosko→main a un bus con `source`.
//
// Por qué existe — el hallazgo del gym piloto (6-jul-2026): el
// DigitalPersona Lite Client entrega cada sample a la ventana cuyo
// documento tiene EL FOCO, aunque varias ventanas tengan acquisitions
// vivas. No multiplexa ni gana "la última acquisition": enruta por foco.
// Consecuencias:
//
//   1. No hay riesgo de doble-POST entre ventanas (sólo una recibe el
//      sample) — por eso ya no existe la supresión del scanner de main.
//   2. La ventana que procesa el check-in casi nunca es la superficie que
//      el socio está mirando: el operador trabaja en la main (enfocada),
//      así que la main procesa — y la flotante/kiosko quedarían ciegos.
//      El relay cierra ese hueco: quien procesa EMITE el resultado y las
//      superficies de display lo pintan.
//
// Quién emite: GlobalCheckinScanner (main), el loop de huella de
// CheckinPage (main, /checkin) y KioskPage (ventana kiosk). La flotante NO
// emite: vive en la pantalla del operador y su resultado ya es visible ahí.
//
// Quién escucha: la flotante y el kiosko (pintan + tono — son la superficie
// del socio), y el GlobalCheckinScanner (toast espejo SIN tono para el
// operador). Tauri entrega los eventos también al emisor, así que el
// listener FILTRA por source ≠ label propio — sin ese filtro, la main se
// toastearía sus propios resultados dos veces.
//
// Naming espejo de los eventos del biometricStreamProvider
// ("biometric:claim:*") para que un grep encuentre origen + listeners.
export const EVT_CHECKIN_RESULT = "checkin:result";

export type CheckinResultRelayPayload =
  | { source: string; kind: "checkin"; event: CheckinEvent }
  | { source: string; kind: "no_match" };

export type CheckinResultEmission =
  | { kind: "checkin"; event: CheckinEvent }
  | { kind: "no_match" };

// Label de la ventana actual — mismo fallback "main" que el provider usa
// fuera de Tauri (vite dev / vitest).
async function currentWindowLabel(): Promise<string> {
  if (!isTauri()) return "main";
  try {
    const { getCurrentWebviewWindow } = await import(
      "@tauri-apps/api/webviewWindow"
    );
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
}

// Fire-and-forget desde quien procesó el check-in. Best effort: perder un
// relay no rompe nada — el check-in ya quedó registrado por el emisor.
export async function emitCheckinResult(
  emission: CheckinResultEmission,
): Promise<void> {
  if (!isTauri()) return;
  try {
    const source = await currentWindowLabel();
    const { emit } = await import("@tauri-apps/api/event");
    await emit(EVT_CHECKIN_RESULT, {
      ...emission,
      source,
    } satisfies CheckinResultRelayPayload);
  } catch {
    // Sin bus de eventos no hay relay; el emisor sigue operando solo.
  }
}

interface UseCheckinResultRelayOptions {
  onCheckin(event: CheckinEvent): void;
  onNoMatch(): void;
}

// Escucha SIEMPRE mientras el consumer esté montado — sin gate por
// presencia de otras ventanas: si nadie emite, no pasa nada, y así el
// display no depende del timing del poll de useWindowPresence. Los eventos
// cuyo source es la ventana propia se descartan (echo de Tauri).
export function useCheckinResultRelay(opts: UseCheckinResultRelayOptions): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const myLabel = await currentWindowLabel();
        const { listen } = await import("@tauri-apps/api/event");
        const un = await listen<CheckinResultRelayPayload>(
          EVT_CHECKIN_RESULT,
          (e) => {
            const p = e.payload;
            if (!p || typeof p !== "object") return;
            if (p.source === myLabel) return; // echo propio
            if (p.kind === "checkin" && p.event) {
              optsRef.current.onCheckin(p.event);
            } else if (p.kind === "no_match") {
              optsRef.current.onNoMatch();
            }
          },
        );
        if (cancelled) un();
        else unlisten = un;
      } catch {
        // Sin bus de eventos no hay relay — cada ventana sigue mostrando
        // sólo lo que ella misma procese.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
