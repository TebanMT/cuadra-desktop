import { useCallback } from "react";
import { useLocation } from "react-router-dom";
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
import { useCheckinFeedbackSettings } from "@/hooks/useGym";
import {
  emitCheckinResult,
  useCheckinResultRelay,
} from "@/hooks/useCheckinResultRelay";
import {
  CHECKIN_FLOAT_WINDOW_LABEL,
  KIOSK_WINDOW_LABEL,
} from "@/lib/windowLabels";
import type { CheckinEvent } from "@/hooks/useCheckin";
import { playCheckinTone } from "@/lib/audio";

// GlobalCheckinScanner — mantiene el biometric loop activo en la main
// window. Cuando el operador apoya la huella, el resultado del checkin
// sale como toast, sin importar en qué pantalla esté.
//
// Cómo evita conflictos con enrollment: el flujo de registro de huella
// usa useBiometricClaim() del BiometricStreamProvider, que pausa el
// stream global durante el enroll. Cuando termina, libera el claim y
// este scanner vuelve a recibir samples automáticamente. No hay que
// detectar la ruta — la coordinación vive en el provider.
//
// Cómo convive con las otras ventanas (verificado en gym piloto,
// 6-jul-2026): el Lite Client entrega cada sample a la ventana cuyo
// documento tiene EL FOCO — no multiplexa. Con la flotante o el kiosko
// abiertos, la main sigue procesando los check-ins mientras el operador
// trabaje en ella (que es casi siempre), y EMITE cada resultado vía
// useCheckinResultRelay para que la superficie del socio (flotante /
// kiosko) lo pinte y suene. A la inversa, cuando otra ventana procesa
// (porque tuvo el foco), aquí pintamos su relay como toast SIN tono (la
// otra ventana ya sonó en las mismas bocinas) y sin tocar el BE.
//
// Dentro de la MISMA ventana main, /checkin es dueña del loop: CheckinPage
// monta su propio useBiometricCheckinLoop, y el provider multiplexa
// samples a TODOS los subscribers de la ventana — si este scanner no se
// apagara ahí, cada huella en /checkin registraría dos check-ins (el BE
// no dedupea re-checkins inmediatos).
//
// Montado una sola vez en DashboardLayout (encima del <Outlet>), así
// sobrevive a la navegación entre pantallas.
export function GlobalCheckinScanner() {
  const bio = useBiometricStatus();
  const readerConnected = useReaderConnected();
  const location = useLocation();
  const floatOpen = useWindowPresence(CHECKIN_FLOAT_WINDOW_LABEL);
  const kioskOpen = useWindowPresence(KIOSK_WINDOW_LABEL);

  const available = !!bio.data?.available && readerConnected === true;
  // Volumen del tono — "Volumen del kiosko" en Ajustes → Perfil del gym;
  // el mismo knob gobierna todas las superficies de check-in.
  const { volume } = useCheckinFeedbackSettings();
  const onCheckinRoute = location.pathname === "/checkin";
  // Con una superficie dedicada al socio abierta, el tono lo pone ella
  // (vía relay) — la main sólo toastea. Sin flotante ni kiosko, la main es
  // el único feedback y conserva su tono.
  const dedicatedSurfaceOpen = floatOpen || kioskOpen;

  const toastCheckinResult = useCallback(
    (ev: CheckinEvent, withTone: boolean) => {
      const fb = eventToFeedback(ev);
      const tone = feedbackTone(fb.kind);
      const memberName = fb.memberName ?? "Socio";
      const detail = feedbackDetail(fb) || undefined;
      switch (tone) {
        case "success":
          if (withTone) playCheckinTone("success", volume);
          toast.success(`✓ ${memberName} ingresó`, { description: detail });
          break;
        case "warning":
          if (withTone) playCheckinTone("warning", volume);
          toast.warning(`⚠ ${memberName} ingresó`, { description: detail });
          break;
        case "denied":
          if (withTone) playCheckinTone("denied", volume);
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
    [volume],
  );

  const toastNoMatch = useCallback((withTone: boolean) => {
    if (withTone) playCheckinTone("denied", volume);
    toast.error("No reconocimos la huella", {
      description: "Vuelve a apoyar o usa el número de socio.",
    });
  }, [volume]);

  // Memoizamos los handlers para no re-suscribir el loop en cada render
  // (caro: el provider trata cada cambio de subscriber como vida nueva).
  const onCheckin = useCallback(
    (ev: CheckinEvent) => {
      toastCheckinResult(ev, !dedicatedSurfaceOpen);
      void emitCheckinResult({ kind: "checkin", event: ev });
    },
    [toastCheckinResult, dedicatedSurfaceOpen],
  );
  const onNoMatch = useCallback(() => {
    toastNoMatch(!dedicatedSurfaceOpen);
    void emitCheckinResult({ kind: "no_match" });
  }, [toastNoMatch, dedicatedSurfaceOpen]);

  useBiometricCheckinLoop({
    enabled: available && !onCheckinRoute,
    onCheckin,
    onNoMatch,
    // Sin onAttempt / onError visibles — un toast por cada lectura sería
    // ruidoso; sólo los resultados terminales (allowed/denied/no-match).
  });

  // Toast espejo de lo que otra ventana procesó — sin POST y sin tono. El
  // relay filtra los eventos emitidos por esta misma ventana (echo), así
  // que lo que CheckinPage emite en /checkin no se duplica aquí.
  const onRelayedCheckin = useCallback(
    (ev: CheckinEvent) => toastCheckinResult(ev, false),
    [toastCheckinResult],
  );
  const onRelayedNoMatch = useCallback(() => toastNoMatch(false), [toastNoMatch]);

  useCheckinResultRelay({
    onCheckin: onRelayedCheckin,
    onNoMatch: onRelayedNoMatch,
  });

  // Componente sin output visual — todo viaja por Sonner.
  return null;
}
