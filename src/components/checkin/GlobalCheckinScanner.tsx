import { useCallback } from "react";
import { toast } from "sonner";
import {
  useBiometricCheckinLoop,
  useBiometricStatus,
  useReaderConnected,
} from "@/hooks/useBiometric";
import { eventToFeedback } from "@/components/checkin/CheckinFeedback";
import { useWindowPresence } from "@/hooks/useWindowPresence";
import { CHECKIN_FLOAT_WINDOW_LABEL } from "@/lib/windowLabels";
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
// Cómo convive con la ventana flotante de check-in: mientras exista la
// ventana "checkin-float", este scanner se SILENCIA (suppressed) sin
// desuscribirse — la flotante postea el check-in y muestra el resultado;
// si la main también posteara/toasteara, cada huella registraría y sonaría
// doble. Al cerrarse la flotante, la presencia cae y este scanner retoma
// solo. Ver el porqué completo en useBiometricCheckinLoop.suppressed.
//
// Montado una sola vez en DashboardLayout (encima del <Outlet>), así
// sobrevive a la navegación entre pantallas.
export function GlobalCheckinScanner() {
  const bio = useBiometricStatus();
  const readerConnected = useReaderConnected();
  const floatOpen = useWindowPresence(CHECKIN_FLOAT_WINDOW_LABEL);

  const available = !!bio.data?.available && readerConnected === true;

  // Memoizamos los handlers para no re-suscribir el loop en cada render
  // (caro: el provider trata cada cambio de subscriber como vida nueva).
  const onCheckin = useCallback((ev: CheckinEvent) => {
    const fb = eventToFeedback(ev);
    const memberName = ev.member?.full_name ?? "Socio";
    switch (fb.kind) {
      case "allowed_active":
      case "allowed_active_with_balance":
      case "allowed_override":
        playCheckinTone("success");
        toast.success(`✓ ${memberName} ingresó`, {
          description: fb.detail,
        });
        break;
      case "allowed_expiring_soon":
        playCheckinTone("warning");
        toast.warning(`⚠ ${memberName} ingresó`, {
          description: fb.detail ?? "Está por vencer la membresía.",
        });
        break;
      case "denied_expired":
      case "denied_inactive":
      case "denied_no_membership":
      case "denied_lost":
        playCheckinTone("denied");
        toast.error(`✗ ${memberName} no puede entrar`, {
          description: fb.detail ?? "Acceso denegado.",
        });
        break;
      default:
        // estados idle/processing no aplican aquí — el loop sólo emite
        // onCheckin tras un resultado real del BE.
        break;
    }
  }, []);

  const onNoMatch = useCallback(() => {
    playCheckinTone("denied");
    toast.error("No reconocimos la huella", {
      description: "Vuelve a apoyar o usa el número de socio.",
    });
  }, []);

  useBiometricCheckinLoop({
    enabled: available,
    suppressed: floatOpen,
    onCheckin,
    onNoMatch,
    // Sin onAttempt / onError visibles — un toast por cada lectura sería
    // ruidoso; sólo los resultados terminales (allowed/denied/no-match).
  });

  // Componente sin output visual — todo viaja por Sonner.
  return null;
}
