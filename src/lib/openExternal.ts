import { open as tauriOpen } from "@tauri-apps/plugin-shell";

/**
 * Abre una URL en el navegador del sistema, con capas de respaldo (la primera
 * que funcione gana):
 *
 *  1. Tauri `shell.open` → navegador del sistema en el .app empacado.
 *  2. `window.open(_blank)` → nueva pestaña. Esto cubre el caso de correr en
 *     un navegador normal (`npm run dev` = Vite, SIN runtime de Tauri, donde el
 *     IPC de `shell.open` siempre falla) y sirve de red de seguridad si el
 *     shell.open del .app fallara.
 *
 * Devuelve `true` si alguna capa abrió la URL; `false` si todas fallaron, para
 * que el caller decida el último recurso (copiar el link al portapapeles, etc.).
 */
export async function openExternalUrl(url: string): Promise<boolean> {
  try {
    await tauriOpen(url);
    return true;
  } catch (err) {
    // En un navegador normal esto SIEMPRE falla (no hay backend de Tauri) — no
    // es un error real, caemos al siguiente respaldo.
    if (import.meta.env.DEV) {
      console.debug("[openUrl] tauri shell.open no disponible, uso window.open:", err);
    }
  }
  try {
    const w = window.open(url, "_blank", "noopener,noreferrer");
    if (w) return true;
  } catch (err) {
    console.error("[openUrl] window.open falló:", err);
  }
  return false;
}
