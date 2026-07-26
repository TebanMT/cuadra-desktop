import { useCallback } from "react";
import { useLocation } from "react-router-dom";
import { toast } from "sonner";
import { useBiometricCheckinFeed } from "@/hooks/useBiometric";
import {
  eventToFeedback,
  feedbackDetail,
  feedbackTone,
} from "@/components/checkin/CheckinFeedback";
import { useWindowPresence } from "@/hooks/useWindowPresence";
import { useCheckinFeedbackSettings } from "@/hooks/useGym";
import {
  CHECKIN_FLOAT_WINDOW_LABEL,
  KIOSK_WINDOW_LABEL,
} from "@/lib/windowLabels";
import type { CheckinEvent } from "@/hooks/useCheckin";
import { playCheckinTone } from "@/lib/audio";

// GlobalCheckinScanner — el feedback de check-in por huella de la ventana
// main. Cada resultado que el sidecar identifica llega por SSE a TODAS las
// ventanas; aquí sale como toast, sin importar en qué pantalla esté el
// operador.
//
// Reglas anti-doble-feedback (las superficies deciden, el transporte no):
//   - En /checkin se apaga: CheckinPage pinta el resultado en grande en la
//     MISMA ventana — un toast encima sería doble.
//   - Con una superficie dedicada al socio abierta (kiosko o flotante), el
//     TONO lo pone ella; aquí sólo toastea. Sin superficie dedicada, la
//     main es el único feedback y conserva su tono.
//
// Montado una sola vez en DashboardLayout (encima del <Outlet>), así
// sobrevive a la navegación entre pantallas.
export function GlobalCheckinScanner() {
  const location = useLocation();
  const floatOpen = useWindowPresence(CHECKIN_FLOAT_WINDOW_LABEL);
  const kioskOpen = useWindowPresence(KIOSK_WINDOW_LABEL);

  // Volumen del tono — "Volumen del kiosko" en Ajustes → Perfil del gym;
  // el mismo knob gobierna todas las superficies de check-in.
  const { volume } = useCheckinFeedbackSettings();
  const onCheckinRoute = location.pathname === "/checkin";
  const dedicatedSurfaceOpen = floatOpen || kioskOpen;

  const onCheckin = useCallback(
    (ev: CheckinEvent) => {
      const fb = eventToFeedback(ev);
      const tone = feedbackTone(fb.kind);
      const memberName = fb.memberName ?? "Socio";
      const detail = feedbackDetail(fb) || undefined;
      const withTone = !dedicatedSurfaceOpen;
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
          // neutral = idle/processing — no llegan aquí: el feed sólo emite
          // resultados terminales en checkin_result.
          break;
      }
    },
    [volume, dedicatedSurfaceOpen],
  );

  const onNoMatch = useCallback(() => {
    if (!dedicatedSurfaceOpen) playCheckinTone("denied", volume);
    toast.error("No reconocimos la huella", {
      description: "Vuelve a apoyar o usa el número de socio.",
    });
  }, [volume, dedicatedSurfaceOpen]);

  useBiometricCheckinFeed({
    enabled: !onCheckinRoute,
    onCheckin,
    onNoMatch,
    // Sin onAttempt / onSampleRejected / onError visibles — un toast por
    // cada lectura sería ruidoso; sólo resultados terminales.
  });

  // Componente sin output visual — todo viaja por Sonner.
  return null;
}
