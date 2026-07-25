// Gestión de la ventana del kiosko. El kiosko corre en una segunda
// WebviewWindow de Tauri para que la recepción siga usable en paralelo
// (cobrar, registrar socios) mientras la pantalla appliance vive en otro
// monitor o ventana aparte. Todas las funciones son no-op fuera de Tauri
// (devtools en navegador) — el fallback ahí es navegar a /kiosk.

import { toast } from "sonner";
import { isTauri } from "./utils";
import { CHECKIN_FLOAT_WINDOW_LABEL, KIOSK_WINDOW_LABEL } from "./windowLabels";
import { checkin as t } from "@/strings/checkin";

export { KIOSK_WINDOW_LABEL };

async function getModule() {
  const mod = await import("@tauri-apps/api/webviewWindow");
  return mod;
}

export type OpenKioskWindowResult = "created" | "focused" | "blocked_by_float";

export async function openKioskWindow(): Promise<OpenKioskWindowResult> {
  if (!isTauri()) {
    // Fuera de Tauri (vite dev en navegador): abrir el kiosko en una
    // pestaña nueva con un nombre fijo — repetir el click solo enfoca
    // la pestaña existente en vez de duplicar. Aproxima el comportamiento
    // de Tauri sin necesidad de correr `tauri dev`.
    window.open("/kiosk", KIOSK_WINDOW_LABEL);
    return "created";
  }
  const { WebviewWindow } = await getModule();

  // Exclusión con el check-in flotante: ambos modos corren stream biométrico
  // alwaysOn y postean check-ins — a la vez duplicarían registro y feedback.
  // Ver floatWindow.ts para el guard en la otra dirección.
  const float = await WebviewWindow.getByLabel(CHECKIN_FLOAT_WINDOW_LABEL);
  if (float) {
    toast.warning(t.float.kioskBlockedByFloat);
    return "blocked_by_float";
  }

  const existing = await WebviewWindow.getByLabel(KIOSK_WINDOW_LABEL);
  if (existing) {
    // unminimize ANTES de show/focus: en Tauri v2 show() NO des-minimiza
    // y setFocus() tampoco restaura una ventana minimizada — una kiosko
    // que Windows minimizó/escondió quedaba "abierta" pero irrecuperable
    // (el launcher decía que ya estaba abierta y nada aparecía). Los tres
    // son no-op si la ventana ya está visible. Caso de campo: jul-2026,
    // kiosko que "se abrió y cerró de inmediato" al abrirlo por primera
    // vez y ya no se podía traer de vuelta.
    await existing.unminimize().catch(() => undefined);
    await existing.show();
    await existing.setFocus();
    return "focused";
  }
  // Ventana del kiosko: maximizada pero NO fullscreen — así respeta la
  // barra del OS (taskbar Windows / dock+menu macOS) y el operador puede
  // minimizar/cerrar con la X estándar. Decoraciones ON siempre. Resizable
  // ON para que el operador pueda moverla a un segundo monitor o ajustar
  // tamaño según el espacio del mostrador. Nada de modo "appliance
  // bloqueado" hasta que tengamos un caso de uso real que lo justifique.
  const win = new WebviewWindow(KIOSK_WINDOW_LABEL, {
    url: "/kiosk",
    title: "Tinta · Kiosko",
    fullscreen: false,
    maximized: true,
    resizable: true,
    decorations: true,
    skipTaskbar: false,
    alwaysOnTop: false,
    focus: true,
  });
  // La creación es async y sus fallos NO tiran excepción — llegan por el
  // evento tauri://error (p.ej. label duplicado en una carrera de doble
  // click, o el webview que no pudo crearse). Sin listener el fallo era
  // invisible: ni ventana ni mensaje.
  void win.once("tauri://error", () => {
    toast.error(t.float.kioskOpenError);
  });
  return "created";
}

export async function closeKioskWindow(): Promise<void> {
  if (!isTauri()) return;
  const { WebviewWindow } = await getModule();
  const win = await WebviewWindow.getByLabel(KIOSK_WINDOW_LABEL);
  if (win) await win.close();
}

export async function isKioskWindowOpen(): Promise<boolean> {
  if (!isTauri()) return false;
  const { WebviewWindow } = await getModule();
  const win = await WebviewWindow.getByLabel(KIOSK_WINDOW_LABEL);
  return !!win;
}

// Identifica si el código corre dentro de la ventana del kiosko. Sirve
// para decisiones de UI/lifecycle que dependen de "qué ventana soy":
// p.ej. en exit, cerrar la ventana si es la kiosk, navegar si es la main.
export async function isCurrentWindowKiosk(): Promise<boolean> {
  if (!isTauri()) return false;
  const { getCurrentWebviewWindow } = await getModule();
  return getCurrentWebviewWindow().label === KIOSK_WINDOW_LABEL;
}

export async function closeCurrentWindow(): Promise<void> {
  if (!isTauri()) return;
  const { getCurrentWebviewWindow } = await getModule();
  await getCurrentWebviewWindow().close();
}
