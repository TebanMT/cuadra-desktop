import { useEffect, useRef } from "react";
import { isTauri } from "@/lib/utils";
import type { CheckinEvent } from "@/hooks/useCheckin";

// Relay kiosko → main del resultado de cada check-in por huella.
//
// Por qué existe: con el kiosko abierto, el GlobalCheckinScanner de la
// main se SILENCIA (suppressed) para que una misma huella no registre dos
// check-ins cuando el Lite Client multiplexa los samples a ambas ventanas
// (el BE no dedupea re-checkins inmediatos). Pero suprimir mata también el
// toast — y ese toast es el único feedback que tiene el operador de quién
// entró cuando el kiosko vive en el segundo monitor viendo al socio.
// Decisión (jul-2026): conservar el toast SIN el POST — el kiosko, dueño
// del check-in, emite el resultado vía evento Tauri y la main lo pinta
// sin registrar nada y sin tono (el kiosko ya sonó en las mismas bocinas).
//
// Alcance v1: sólo resultados de huella. El flujo por número del kiosko
// nunca tuvo toast en la main — relayarlo sería feature nueva, no
// restauración. La flotante tampoco relaya: vive en la pantalla del
// operador y su resultado ya es visible; un toast encima sería redundante.
//
// Naming espejo de los eventos del biometricStreamProvider
// ("biometric:claim:*") para que un grep encuentre origen + listeners.
export const EVT_KIOSK_CHECKIN_RESULT = "checkin:kiosk:result";

export type KioskCheckinRelayPayload =
  | { kind: "checkin"; event: CheckinEvent }
  | { kind: "no_match" };

// Fire-and-forget desde el kiosko. Best effort: perder un toast del
// operador no rompe nada — el check-in ya quedó registrado por el kiosko.
export async function emitKioskCheckinResult(
  payload: KioskCheckinRelayPayload,
): Promise<void> {
  if (!isTauri()) return;
  try {
    const { emit } = await import("@tauri-apps/api/event");
    await emit(EVT_KIOSK_CHECKIN_RESULT, payload);
  } catch {
    // Sin bus de eventos no hay relay; el kiosko sigue operando solo.
  }
}

interface UseKioskCheckinRelayOptions {
  onCheckin(event: CheckinEvent): void;
  onNoMatch(): void;
}

// Escucha SIEMPRE mientras el consumer esté montado — sin gate por
// presencia del kiosko: si no hay kiosko nadie emite, y así un toast no
// depende del timing del poll de useWindowPresence. Tauri entrega los
// eventos también al emisor, pero emisor (KioskPage, fuera de
// DashboardLayout) y listener (GlobalCheckinScanner, dentro) nunca
// coexisten en la misma ventana — ver routes/index.tsx.
export function useKioskCheckinRelay(opts: UseKioskCheckinRelayOptions): void {
  const optsRef = useRef(opts);
  optsRef.current = opts;

  useEffect(() => {
    if (!isTauri()) return;
    let cancelled = false;
    let unlisten: (() => void) | undefined;

    (async () => {
      try {
        const { listen } = await import("@tauri-apps/api/event");
        const un = await listen<KioskCheckinRelayPayload>(
          EVT_KIOSK_CHECKIN_RESULT,
          (e) => {
            const p = e.payload;
            if (!p || typeof p !== "object") return;
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
        // Sin bus de eventos no hay relay — la supresión anti doble-POST
        // sigue intacta, sólo se pierde el toast espejo.
      }
    })();

    return () => {
      cancelled = true;
      unlisten?.();
    };
  }, []);
}
