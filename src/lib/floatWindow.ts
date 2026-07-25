// Gestión de la ventana flotante de check-in ("checkin-float"). Espejo del
// patrón de kioskWindow.ts: tercera WebviewWindow que carga la misma SPA en
// /checkin-float. A diferencia del kiosko (pantalla dedicada), la flotante
// es una mini-ventana always-on-top estilo mini-player para gyms con UNA
// sola PC y UNA pantalla: el socio ve el resultado de su huella mientras el
// operador sigue usando la ventana principal.
//
// Exclusión mutua con el kiosko: son modos para configuraciones físicas
// distintas, y ambos corren stream biométrico alwaysOn + postean check-ins
// — permitir los dos a la vez duplicaría registro y feedback. El guard es
// bidireccional (aquí y en openKioskWindow).
//
// Todas las funciones son no-op fuera de Tauri (vite dev en navegador);
// el fallback ahí es un popup con window.open.

import { toast } from "sonner";
import { isTauri } from "./utils";
import { CHECKIN_FLOAT_WINDOW_LABEL, KIOSK_WINDOW_LABEL } from "./windowLabels";
import { checkin as t } from "@/strings/checkin";

export { CHECKIN_FLOAT_WINDOW_LABEL };

// Tamaño compacto: suficiente para foto + nombre + estado legible desde el
// otro lado del mostrador, sin comerse la pantalla que el operador está
// usando. El min-size evita que un resize accidental la vuelva ilegible.
export const FLOAT_WINDOW_WIDTH = 340;
export const FLOAT_WINDOW_HEIGHT = 220;
export const FLOAT_WINDOW_MIN_WIDTH = 300;
export const FLOAT_WINDOW_MIN_HEIGHT = 190;

// Posición persistida entre sesiones. localStorage se comparte entre
// ventanas del mismo origin (mismo user-data dir del webview), así que la
// flotante escribe al moverse y la main lee al crearla.
const POSITION_KEY = `tinta.window-pos.${CHECKIN_FLOAT_WINDOW_LABEL}`;

export interface FloatWindowPosition {
  x: number;
  y: number;
}

export function saveFloatWindowPosition(pos: FloatWindowPosition): void {
  try {
    window.localStorage.setItem(POSITION_KEY, JSON.stringify(pos));
  } catch {
    // localStorage puede fallar en webviews restringidos — la posición es
    // nice-to-have, no vale romper nada por ella.
  }
}

export function loadFloatWindowPosition(): FloatWindowPosition | null {
  try {
    const raw = window.localStorage.getItem(POSITION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<FloatWindowPosition>;
    if (typeof parsed.x !== "number" || typeof parsed.y !== "number") return null;
    if (!Number.isFinite(parsed.x) || !Number.isFinite(parsed.y)) return null;
    return { x: parsed.x, y: parsed.y };
  } catch {
    return null;
  }
}

// Reencuadra una posición guardada dentro de la pantalla actual. Caso real:
// el gym cambió de monitor/resolución y la posición guardada quedó fuera de
// vista — una ventana sin decoraciones fuera de pantalla es irrecuperable
// para un operador no-técnico (no hay taskbar entry: skipTaskbar). Dejamos
// al menos un margen agarrable dentro del área visible.
export function clampToScreen(
  pos: FloatWindowPosition,
  screenWidth: number,
  screenHeight: number,
): FloatWindowPosition {
  const margin = 60; // mínimo de ventana que debe quedar visible/agarrable
  return {
    x: Math.min(Math.max(0, pos.x), Math.max(0, screenWidth - margin)),
    y: Math.min(Math.max(0, pos.y), Math.max(0, screenHeight - margin)),
  };
}

function restoredPosition(): FloatWindowPosition | null {
  const saved = loadFloatWindowPosition();
  if (!saved) return null;
  // window.screen es la pantalla de la ventana main — para el segmento
  // objetivo (una sola PC, una sola pantalla) es la misma donde vivirá la
  // flotante. Si el entorno no reporta dimensiones sanas, confiamos en la
  // posición guardada tal cual.
  const w = window.screen?.availWidth ?? 0;
  const h = window.screen?.availHeight ?? 0;
  if (w > 0 && h > 0) return clampToScreen(saved, w, h);
  return saved;
}

export type OpenFloatWindowResult = "created" | "focused" | "blocked_by_kiosk";

export async function openCheckinFloatWindow(): Promise<OpenFloatWindowResult> {
  if (!isTauri()) {
    // Fuera de Tauri: popup con nombre fijo — igual que el fallback del
    // kiosko, repetir el click enfoca el popup existente en vez de duplicar.
    window.open(
      "/checkin-float",
      CHECKIN_FLOAT_WINDOW_LABEL,
      `width=${FLOAT_WINDOW_WIDTH},height=${FLOAT_WINDOW_HEIGHT}`,
    );
    return "created";
  }
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");

  // Exclusión con el kiosko. El toast vive aquí (y no en cada caller) para
  // que el atajo de teclado y cualquier botón futuro expliquen el bloqueo
  // sin duplicar el mensaje.
  const kiosk = await WebviewWindow.getByLabel(KIOSK_WINDOW_LABEL);
  if (kiosk) {
    toast.warning(t.float.blockedByKiosk);
    return "blocked_by_kiosk";
  }

  const existing = await WebviewWindow.getByLabel(CHECKIN_FLOAT_WINDOW_LABEL);
  if (existing) {
    // unminimize antes de show/focus — show() no des-minimiza en Tauri v2
    // y una flotante minimizada quedaba "abierta" pero irrecuperable.
    // Mismo fix que openKioskWindow (caso de campo jul-2026).
    await existing.unminimize().catch(() => undefined);
    await existing.show();
    await existing.setFocus();
    return "focused";
  }

  const pos = restoredPosition();
  // Ventana flotante: sin decoraciones (el chrome propio vive en la página:
  // drag-region + botón de cerrar), siempre encima para que ningún modal o
  // ventana la tape justo cuando el socio apoya el dedo, y fuera del
  // taskbar — es una superficie de feedback, no una "app" más que alternar.
  // No se auto-abre al arrancar la app: opt-in por sesión (v1).
  const win = new WebviewWindow(CHECKIN_FLOAT_WINDOW_LABEL, {
    url: "/checkin-float",
    title: t.float.windowTitle,
    width: FLOAT_WINDOW_WIDTH,
    height: FLOAT_WINDOW_HEIGHT,
    minWidth: FLOAT_WINDOW_MIN_WIDTH,
    minHeight: FLOAT_WINDOW_MIN_HEIGHT,
    resizable: true,
    decorations: false,
    alwaysOnTop: true,
    skipTaskbar: true,
    focus: true,
    ...(pos ? { x: pos.x, y: pos.y } : {}),
  });
  // Fallos de creación llegan por tauri://error, no como excepción —
  // mismo manejo que openKioskWindow.
  void win.once("tauri://error", () => {
    toast.error(t.float.floatOpenError);
  });
  return "created";
}

export async function closeCheckinFloatWindow(): Promise<void> {
  if (!isTauri()) return;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const win = await WebviewWindow.getByLabel(CHECKIN_FLOAT_WINDOW_LABEL);
  if (win) await win.close();
}

export async function isCheckinFloatWindowOpen(): Promise<boolean> {
  if (!isTauri()) return false;
  const { WebviewWindow } = await import("@tauri-apps/api/webviewWindow");
  const win = await WebviewWindow.getByLabel(CHECKIN_FLOAT_WINDOW_LABEL);
  return !!win;
}
