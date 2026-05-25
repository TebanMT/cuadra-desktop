// useUpdater — auto-update flow del operador no-técnico (ADR-005 §2.7).
//
// Comportamiento:
//   1. Al boot: check inmediato + cada 6h.
//   2. Si hay update disponible y la app lleva >24h corriendo, mostramos
//      un toast discreto. Si lleva <24h dejamos que el ciclo natural
//      cerrar/abrir aplique el update sin avisar.
//   3. Ajustes → "Sobre Tinta" expone `triggerCheck()` para que el dueño
//      fuerce la búsqueda manualmente.
//
// IMPORTANT: el modal bloqueante "Tu versión ya no es compatible" NO
// vive acá — lo dispara useSyncStatus cuando state == schema_upgrade_required.
// Lo hacemos así para que el modal aparezca aunque el updater esté
// pausado o caído (e.g. cloud release server offline pero sync sigue
// devolviendo 426).

import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { checkForUpdate, downloadAndInstall, type UpdateInfo } from "@/lib/updater";
import { getAppVersion } from "@/lib/tauri-bridge";

const CHECK_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6h
const TOAST_AFTER_UPTIME_MS = 24 * 60 * 60 * 1000; // 24h
const TOAST_DEDUPE_KEY = "tinta:updater:last-toast-version";

interface UpdaterState {
  currentVersion: string;
  lastCheck: Date | null;
  available: UpdateInfo | null;
  checking: boolean;
  installing: boolean;
  // bootedAt es del proceso (ref del hook) — no del binario. Sirve sólo
  // para decidir si la app "lleva >24h corriendo" en el laptop del gym.
  bootedAt: Date;
}

export function useUpdater() {
  const bootedAtRef = useRef(new Date());
  const [state, setState] = useState<UpdaterState>({
    currentVersion: "—",
    lastCheck: null,
    available: null,
    checking: false,
    installing: false,
    bootedAt: bootedAtRef.current,
  });

  // Carga la versión actual una sola vez.
  useEffect(() => {
    let mounted = true;
    void getAppVersion().then((v) => {
      if (mounted) setState((s) => ({ ...s, currentVersion: v }));
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Loop de check periódico. Se monta una vez al login y vive lo que dura
  // la sesión del SPA. NO depende de `state` para evitar re-arranques del
  // setInterval cuando cambia algo del estado.
  useEffect(() => {
    let cancelled = false;

    async function runCheck() {
      if (cancelled) return;
      setState((s) => ({ ...s, checking: true }));
      try {
        const current = await getAppVersion();
        const result = await checkForUpdate(current);
        if (cancelled) return;
        setState((s) => ({
          ...s,
          currentVersion: current,
          lastCheck: new Date(),
          available: result.available && result.info ? result.info : null,
          checking: false,
        }));

        if (result.available && result.info) {
          maybeShowToast(result.info, bootedAtRef.current);
        }
      } catch {
        if (!cancelled) setState((s) => ({ ...s, checking: false }));
      }
    }

    void runCheck();
    const id = window.setInterval(runCheck, CHECK_INTERVAL_MS);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, []);

  async function triggerCheck() {
    setState((s) => ({ ...s, checking: true }));
    try {
      const current = await getAppVersion();
      const result = await checkForUpdate(current);
      setState((s) => ({
        ...s,
        currentVersion: current,
        lastCheck: new Date(),
        available: result.available && result.info ? result.info : null,
        checking: false,
      }));
      if (!result.available) {
        toast.success("Ya tienes la última versión.", { id: "updater-check" });
      }
      return result;
    } catch (e) {
      setState((s) => ({ ...s, checking: false }));
      toast.error("No pudimos buscar actualizaciones.", { id: "updater-check" });
      throw e;
    }
  }

  // installNow descarga e instala el update, luego relanza la app. Usado
  // por el botón del modal de schema_upgrade_required y por el override
  // manual en Ajustes. El path silencioso de "se aplicará al cerrar"
  // NO llama acá — Tauri aplica el update al exit del proceso por sí
  // mismo cuando dialog:false + installMode:passive en tauri.conf.json.
  async function installNow() {
    if (!state.available) return;
    setState((s) => ({ ...s, installing: true }));
    const res = await downloadAndInstall(state.available.version, true);
    setState((s) => ({ ...s, installing: false }));
    if (!res.ok) {
      toast.error("No pudimos instalar la actualización. Intenta más tarde.", {
        id: "updater-install",
      });
    }
    return res;
  }

  return { ...state, triggerCheck, installNow };
}

// maybeShowToast dispara el toast discreto sólo si:
//   1. La app lleva >24h corriendo (uptime — ADR-005 §2.7).
//   2. No mostramos toast para esta misma versión antes (localStorage
//      dedupe key). Esto evita spamear si el check corre cada 6h por 4
//      días seguidos sin que el dueño cierre la app.
function maybeShowToast(info: UpdateInfo, bootedAt: Date) {
  const uptime = Date.now() - bootedAt.getTime();
  if (uptime < TOAST_AFTER_UPTIME_MS) return;
  if (typeof window === "undefined") return;
  const lastVersion = window.localStorage.getItem(TOAST_DEDUPE_KEY);
  if (lastVersion === info.version) return;
  window.localStorage.setItem(TOAST_DEDUPE_KEY, info.version);
  toast(`Hay una actualización lista (${info.version}).`, {
    description: "Se aplicará la próxima vez que cierres Tinta.",
    duration: 8000,
    id: "updater-toast",
  });
}
