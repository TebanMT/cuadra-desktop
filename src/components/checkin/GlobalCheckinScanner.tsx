import { useCallback } from "react";
import { toast } from "sonner";
import {
  useBiometricCheckinLoop,
  useBiometricStatus,
  useReaderConnected,
} from "@/hooks/useBiometric";
import {
  eventToFeedback,
  feedbackDetail,
  feedbackTone,
} from "@/components/checkin/CheckinFeedback";
import { useWindowPresence } from "@/hooks/useWindowPresence";
import { useKioskCheckinRelay } from "@/hooks/useKioskCheckinRelay";
import {
  CHECKIN_FLOAT_WINDOW_LABEL,
  KIOSK_WINDOW_LABEL,
} from "@/lib/windowLabels";
import type { CheckinEvent } from "@/hooks/useCheckin";
import { playCheckinTone } from "@/lib/audio";

// GlobalCheckinScanner — mantiene el biometric loop SIEMPRE activo en
// la main window. Cuando el operador apoya la huella, el resultado del
// checkin sale como toast, sin importar en qué pantalla esté.
//
// Cómo evita conflictos con enrollment: el flujo de registro de huella
// usa useBiometricClaim() del BiometricStreamProvider, que pausa el
// stream global durante el enroll. Cuando termina, libera el claim y
// este scanner vuelve a recibir samples automáticamente. No hay que
// detectar la ruta — la coordinación vive en el provider.
//
// Cómo convive con las ventanas de check-in dedicadas (kiosk y
// checkin-float): mientras exista cualquiera de las dos, este scanner se
// SILENCIA (suppressed) sin desuscribirse — la ventana dedicada postea el
// check-in y muestra el resultado; si la main también posteara, cada
// huella registraría DOS check-ins cuando el Lite Client multiplexa el
// sample a ambas ventanas (el BE no dedupea re-checkins inmediatos). Al
// cerrarse la ventana dedicada, la presencia cae y este scanner retoma
// solo. Ver el porqué completo en useBiometricCheckinLoop.suppressed.
//
// Matiz del kiosko: suele vivir en un segundo monitor viendo al socio,
// así que sin toast el operador queda ciego de quién entró (o de quién
// fue rechazado y hay que intervenir). Por eso el kiosko emite cada
// resultado vía evento Tauri (useKioskCheckinRelay) y aquí lo pintamos
// como toast SIN tono (el kiosko ya sonó en las mismas bocinas) y sin
// tocar el BE. La flotante NO relaya: vive en la pantalla del operador
// y su resultado ya es visible.
//
// Montado una sola vez en DashboardLayout (encima del <Outlet>), así
// sobrevive a la navegación entre pantallas.
export function GlobalCheckinScanner() {
  const bio = useBiometricStatus();
  const readerConnected = useReaderConnected();
  const floatOpen = useWindowPresence(CHECKIN_FLOAT_WINDOW_LABEL);
  const kioskOpen = useWindowPresence(KIOSK_WINDOW_LABEL);

  const available = !!bio.data?.available && readerConnected === true;

  // withTone=false para resultados relayados desde el kiosko: la main
  // sólo pinta el toast; el tono ya sonó allá (mismas bocinas). El texto
  // del detalle es el canónico de feedbackDetail — el operador debe leer
  // lo mismo que el socio ve en el kiosko.
  const toastCheckinResult = useCallback(
    (ev: CheckinEvent, withTone: boolean) => {
      const fb = eventToFeedback(ev);
      const tone = feedbackTone(fb.kind);
      const memberName = fb.memberName ?? "Socio";
      const detail = feedbackDetail(fb) || undefined;
      switch (tone) {
        case "success":
          if (withTone) playCheckinTone("success");
          toast.success(`✓ ${memberName} ingresó`, { description: detail });
          break;
        case "warning":
          if (withTone) playCheckinTone("warning");
          toast.warning(`⚠ ${memberName} ingresó`, { description: detail });
          break;
        case "denied":
          if (withTone) playCheckinTone("denied");
          toast.error(`✗ ${memberName} no puede entrar`, {
            description: detail ?? "Acceso denegado.",
          });
          break;
        default:
          // neutral = idle/processing — no llegan aquí: el loop y el relay
          // sólo emiten resultados terminales.
          break;
      }
    },
    [],
  );

  const toastNoMatch = useCallback((withTone: boolean) => {
    if (withTone) playCheckinTone("denied");
    toast.error("No reconocimos la huella", {
      description: "Vuelve a apoyar o usa el número de socio.",
    });
  }, []);

  // Memoizamos los handlers para no re-suscribir el loop en cada render
  // (caro: el provider trata cada cambio de subscriber como vida nueva).
  const onCheckin = useCallback(
    (ev: CheckinEvent) => toastCheckinResult(ev, true),
    [toastCheckinResult],
  );
  const onNoMatch = useCallback(() => toastNoMatch(true), [toastNoMatch]);

  useBiometricCheckinLoop({
    enabled: available,
    suppressed: floatOpen || kioskOpen,
    onCheckin,
    onNoMatch,
    // Sin onAttempt / onError visibles — un toast por cada lectura sería
    // ruidoso; sólo los resultados terminales (allowed/denied/no-match).
  });

  // Toast espejo de lo que el kiosko registró — sin POST y sin tono.
  const onRelayedCheckin = useCallback(
    (ev: CheckinEvent) => toastCheckinResult(ev, false),
    [toastCheckinResult],
  );
  const onRelayedNoMatch = useCallback(() => toastNoMatch(false), [toastNoMatch]);

  useKioskCheckinRelay({
    onCheckin: onRelayedCheckin,
    onNoMatch: onRelayedNoMatch,
  });

  // Componente sin output visual — todo viaja por Sonner.
  return null;
}
