/**
 * BiometricStreamProvider — owner único del stream del lector dentro de
 * UNA ventana Tauri, y coordinador entre ventanas vía eventos Tauri.
 *
 * Problema que resuelve (Bug 3 del piloto):
 *
 *   Pre-Provider, cada componente que necesitaba huella montaba su propio
 *   `startCaptureStream` o `captureOnePng`. Eso causaba dos bugs:
 *
 *   1. Navegar fuera de KioskPage desmontaba el efecto y mataba el stream.
 *      El operador volvía a /kiosk y la lectura no arrancaba.
 *   2. El enroll modal (en la ventana main) llamaba a `captureOnePng` que
 *      hace `resetWebSdkSession()` + `reader.startAcquisition()`. El
 *      DigitalPersona Lite Client sólo acepta UNA acquisition activa por
 *      proceso del agente — la del enroll derribaba el WebSocket del
 *      kiosko (que vive en su propia WebviewWindow), dejándolo "vivo en
 *      React pero sordo al hardware".
 *
 * Modelo:
 *
 *   - Por ventana hay UN Provider y UN stream. Los componentes consumen
 *     vía `useBiometricSubscription({ onCheckin, onNoMatch, ... })` que
 *     registra handlers — el provider los multiplexea. El stream corre
 *     mientras haya al menos un suscriptor o la ventana sea la del
 *     kiosko (que siempre debe estar escuchando).
 *
 *   - Para enroll, los hooks llaman `useBiometricClaim()` que devuelve
 *     `claim()` async. `claim()` pausa el stream local, emite un evento
 *     Tauri global, y devuelve un `release()` que reanuda + emite
 *     release. Las demás ventanas escuchan los eventos y pausan/reanudan
 *     en consecuencia.
 *
 *   - Mount tardío: una ventana que abre mientras hay un claim activo en
 *     otra ventana emite `biometric:query` al montar; el holder responde
 *     `biometric:claim:state` y la nueva ventana se entera. Backup
 *     defensivo: `tauri://window-destroyed` libera claims huérfanos
 *     cuando la ventana del holder se cierra sin emitir release.
 *
 * Cuando NO estamos en Tauri (vite dev en navegador, vitest), la
 * coordinación entre ventanas se omite silenciosamente — la lógica
 * intra-ventana (subscribers + claim local) sigue funcionando para que
 * los tests + dev local sean válidos.
 */
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import {
  startCaptureStream,
  BiometricError,
  type BiometricErrorCode,
  type CaptureStream,
} from "./biometric";
import { isTauri } from "./utils";
import { CHECKIN_FLOAT_WINDOW_LABEL, KIOSK_WINDOW_LABEL } from "./windowLabels";

// Stream state machine. `running` = stream activo en HW. `paused` = el
// stream estaba running pero se soltó por un claim de enroll (local o
// remoto). `idle` = nadie quiere stream (sin subs y no es kiosko).
export type StreamStatus =
  | "idle"
  | "starting"
  | "running"
  | "paused_by_enroll"
  | "error";

export interface BiometricSubscriber {
  // Cada subscriber recibe el PNG + la quality del SDK por cada dedazo.
  // Los handlers son optional — un consumer puede sólo querer saber
  // device-status sin samples.
  onSample?(png: Uint8Array, sdkQuality: number): void;
  onDeviceConnected?(): void;
  onDeviceDisconnected?(): void;
  onError?(code: BiometricErrorCode): void;
}

interface BiometricStreamContextValue {
  status: StreamStatus;
  // Registra handlers. Mientras el subscriber esté vivo, el provider
  // cuenta su voto para mantener el stream encendido (siempre que no
  // haya enroll activo). El returned fn desuscribe.
  subscribe(s: BiometricSubscriber): () => void;
  // Adquiere el lector para uso exclusivo (enroll). Devuelve un release
  // async que el caller DEBE llamar al terminar — un `finally` típico.
  // Pausa el stream local + notifica a las otras ventanas vía Tauri.
  claim(): Promise<() => Promise<void>>;
}

const Ctx = createContext<BiometricStreamContextValue | null>(null);

// Eventos Tauri para coordinación entre ventanas. Naming espejo de las
// constantes para que un grep encuentre origen + listeners.
const EVT_CLAIM_ACQUIRE = "biometric:claim:acquire";
const EVT_CLAIM_RELEASE = "biometric:claim:release";
const EVT_CLAIM_QUERY = "biometric:claim:query";
const EVT_CLAIM_STATE = "biometric:claim:state";

interface ClaimEventPayload {
  holder: string; // window label
}

interface StateEventPayload {
  holders: string[]; // window labels que actualmente tienen claim
}

// Backoff de retry cuando startCaptureStream falla — el lector puede
// estar transitoriamente ocupado (otra app, reset reciente) o desconectado.
// Sin backoff entraríamos en un loop de start/fail/start que satura el
// Lite Client y oculta el error real.
const RETRY_BACKOFF_MS = 2_000;
// Cuánto esperamos respuestas al query inicial. 250ms es suficiente para
// que la otra ventana procese el evento si está mounted y el Tauri event
// bus está vivo; más allá es ruido para mount-time.
const QUERY_REPLY_WINDOW_MS = 250;

interface ProviderProps {
  children: ReactNode;
  // alwaysOn=true mantiene el stream encendido aunque no haya subscribers
  // (caso de las ventanas kiosko y check-in flotante: es su razón de
  // existir). Si no se pasa, se deriva por label: "kiosk" y
  // "checkin-float" son alwaysOn.
  alwaysOn?: boolean;
  // testing seam — saltar el startCaptureStream real cuando vitest
  // monta el provider en jsdom. Tests pueden simular samples llamando
  // al subscriber.onSample directamente.
  disableStream?: boolean;
}

// Determina el label de la ventana actual. En navegador / tests no hay
// concepto; usamos "main" como default y seguimos funcionando.
async function currentWindowLabel(): Promise<string> {
  if (!isTauri()) return "main";
  try {
    const { getCurrentWebviewWindow } = await import("@tauri-apps/api/webviewWindow");
    return getCurrentWebviewWindow().label;
  } catch {
    return "main";
  }
}

export function BiometricStreamProvider({
  children,
  alwaysOn,
  disableStream = false,
}: ProviderProps) {
  // Subscribers: mantenemos refs estables — los handlers cambian con cada
  // render del consumer y no queremos re-arrancar el stream por eso.
  const subscribersRef = useRef<Set<BiometricSubscriber>>(new Set());
  const [subCount, setSubCount] = useState(0);

  // Claims activos: nuestro propio counter (puede haber múltiples si por
  // alguna razón hay claims anidados) + set de holders remotos por label.
  // Mantenemos un ref espejo del counter local para que el listener Tauri
  // pueda leer el valor actual sin re-registrarse en cada cambio.
  const [localClaimCount, setLocalClaimCount] = useState(0);
  const localClaimCountRef = useRef(0);
  useEffect(() => {
    localClaimCountRef.current = localClaimCount;
  }, [localClaimCount]);
  const remoteHoldersRef = useRef<Set<string>>(new Set());
  const [remoteHolderCount, setRemoteHolderCount] = useState(0);

  // Label de esta ventana — resuelto async una vez. Antes de resolverse
  // usamos "main" como tentativo (que es lo más probable en dev y nunca
  // colisiona con el label del kiosko).
  const myLabelRef = useRef<string>("main");
  const [resolvedAlwaysOn, setResolvedAlwaysOn] = useState<boolean | undefined>(alwaysOn);
  const [labelReady, setLabelReady] = useState(false);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const label = await currentWindowLabel();
      if (cancelled) return;
      myLabelRef.current = label;
      // Heurística por defecto: las ventanas cuya razón de existir es leer
      // huellas (kiosko y check-in flotante) siempre tienen el stream
      // encendido. El override por prop sigue mandando.
      if (alwaysOn === undefined) {
        setResolvedAlwaysOn(
          label === KIOSK_WINDOW_LABEL || label === CHECKIN_FLOAT_WINDOW_LABEL,
        );
      }
      setLabelReady(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [alwaysOn]);

  // ── derived state ───────────────────────────────────────────────────
  const wantStream =
    (subCount > 0 || resolvedAlwaysOn === true) &&
    localClaimCount === 0 &&
    remoteHolderCount === 0;

  const [status, setStatus] = useState<StreamStatus>("idle");

  // ── stream lifecycle ────────────────────────────────────────────────
  useEffect(() => {
    if (disableStream || !labelReady) return;
    if (!wantStream) {
      // Cuando paramos por claim, marcamos paused_by_enroll. Cuando paramos
      // por falta de subs, marcamos idle. Misma señal de "stream off" para
      // el caller pero diagnóstico distinto.
      setStatus(
        localClaimCount > 0 || remoteHolderCount > 0 ? "paused_by_enroll" : "idle",
      );
      return;
    }
    let cancelled = false;
    let stream: CaptureStream | null = null;
    let retryTimer: number | undefined;

    const startOnce = async () => {
      if (cancelled) return;
      setStatus("starting");
      try {
        stream = await startCaptureStream({
          onSample: (png, q) => {
            // Snapshot del set: que un handler se desuscriba durante la
            // iteración no rompe el for-of.
            for (const s of [...subscribersRef.current]) {
              try {
                s.onSample?.(png, q);
              } catch {
                // un handler que tira no debe romper a los demás.
              }
            }
          },
          onDeviceConnected: () => {
            for (const s of [...subscribersRef.current]) s.onDeviceConnected?.();
          },
          onDeviceDisconnected: () => {
            for (const s of [...subscribersRef.current]) s.onDeviceDisconnected?.();
          },
          onError: (err) => {
            for (const s of [...subscribersRef.current]) s.onError?.(err.code);
          },
        });
        if (cancelled) {
          await stream.stop().catch(() => undefined);
          return;
        }
        setStatus("running");
      } catch (err) {
        if (cancelled) return;
        setStatus("error");
        const code: BiometricErrorCode =
          err instanceof BiometricError ? err.code : "sdk_error";
        for (const s of [...subscribersRef.current]) s.onError?.(code);
        // Backoff antes de reintentar. Si el lector está desconectado el
        // siguiente intento también va a fallar y va a re-tirar el error;
        // el subscriber ya sabe y muestra banner — no es una catástrofe.
        retryTimer = window.setTimeout(() => {
          if (!cancelled) startOnce();
        }, RETRY_BACKOFF_MS);
      }
    };
    startOnce();

    return () => {
      cancelled = true;
      if (retryTimer) window.clearTimeout(retryTimer);
      stream?.stop().catch(() => undefined);
    };
  }, [wantStream, disableStream, labelReady, localClaimCount, remoteHolderCount]);

  // ── Tauri event coordination ────────────────────────────────────────
  // Listen para claims/releases de OTRAS ventanas y para queries que las
  // otras ventanas mandan al montar. Sin Tauri (vite dev / tests) este
  // bloque es no-op y la coordinación queda intra-ventana.
  useEffect(() => {
    if (!isTauri() || !labelReady) return;
    const cleanups: Array<() => void> = [];
    let cancelled = false;

    (async () => {
      const { listen, emit } = await import("@tauri-apps/api/event");

      const onClaimAcquire = await listen<ClaimEventPayload>(
        EVT_CLAIM_ACQUIRE,
        (e) => {
          const holder = e.payload?.holder;
          // Ignoramos nuestros propios eventos (Tauri los emite de vuelta
          // al emisor también) — la cuenta local ya maneja eso.
          if (!holder || holder === myLabelRef.current) return;
          remoteHoldersRef.current.add(holder);
          setRemoteHolderCount(remoteHoldersRef.current.size);
        },
      );
      cleanups.push(onClaimAcquire);

      const onClaimRelease = await listen<ClaimEventPayload>(
        EVT_CLAIM_RELEASE,
        (e) => {
          const holder = e.payload?.holder;
          if (!holder || holder === myLabelRef.current) return;
          if (remoteHoldersRef.current.delete(holder)) {
            setRemoteHolderCount(remoteHoldersRef.current.size);
          }
        },
      );
      cleanups.push(onClaimRelease);

      // Respondemos a queries de otras ventanas reportando si NOSOTROS
      // tenemos un claim local activo. Si no, no respondemos — silencio
      // = no holding. Leemos localClaimCount vía ref para que el listener
      // capture siempre el valor actual sin re-registrarse en cada cambio.
      const onClaimQuery = await listen<{ from?: string }>(EVT_CLAIM_QUERY, () => {
        if (localClaimCountRef.current > 0) {
          emit(EVT_CLAIM_STATE, { holders: [myLabelRef.current] } satisfies StateEventPayload).catch(
            () => undefined,
          );
        }
      });
      cleanups.push(onClaimQuery);

      const onClaimState = await listen<StateEventPayload>(EVT_CLAIM_STATE, (e) => {
        const holders = e.payload?.holders ?? [];
        let changed = false;
        for (const h of holders) {
          if (h === myLabelRef.current) continue;
          if (!remoteHoldersRef.current.has(h)) {
            remoteHoldersRef.current.add(h);
            changed = true;
          }
        }
        if (changed) setRemoteHolderCount(remoteHoldersRef.current.size);
      });
      cleanups.push(onClaimState);

      // Backup defensivo: si una ventana se cierra sin emitir release
      // (crash, force-quit), liberamos sus claims al recibir el evento
      // de destrucción. Sin esto el stream de las otras ventanas se
      // queda paused para siempre.
      const onWindowDestroyed = await listen<string | { label?: string }>(
        "tauri://window-destroyed",
        (e) => {
          const label =
            typeof e.payload === "string"
              ? e.payload
              : (e.payload?.label ?? undefined);
          if (!label) return;
          if (remoteHoldersRef.current.delete(label)) {
            setRemoteHolderCount(remoteHoldersRef.current.size);
          }
        },
      );
      cleanups.push(onWindowDestroyed);

      // En focus, re-querry el state. Si nos perdimos un evento mientras
      // la ventana estaba en background (Tauri events normalmente
      // entregan pero no garantizan), el focus es un buen punto de
      // resync barato.
      const onFocus = await listen("tauri://focus", () => {
        emit(EVT_CLAIM_QUERY, { from: myLabelRef.current }).catch(() => undefined);
      });
      cleanups.push(onFocus);

      // Query inicial al montar: pedimos a las demás ventanas que reporten
      // sus claims activos. Si nadie responde dentro del window, asumimos
      // "no hay claims" — eventually consistent.
      emit(EVT_CLAIM_QUERY, { from: myLabelRef.current }).catch(() => undefined);
      const t = window.setTimeout(() => {
        // No-op: el state ya quedó actualizado por los onClaimState que
        // hayan llegado en la ventana de 250ms. Este timer existe solo
        // para que el caller pueda razonar "post-mount el state está
        // sincronizado" si extendemos la API más adelante.
        if (cancelled) return;
      }, QUERY_REPLY_WINDOW_MS);
      cleanups.push(() => window.clearTimeout(t));
    })();

    return () => {
      cancelled = true;
      cleanups.forEach((c) => {
        try {
          c();
        } catch {
          // best effort
        }
      });
    };
    // El listener Tauri es estable — lee localClaimCount vía ref. Sólo
    // re-registramos cuando el label se resuelve, no por cambios de
    // claim local.
  }, [labelReady]);

  // ── API expuesta vía contexto ──────────────────────────────────────
  const subscribe = useCallback((s: BiometricSubscriber) => {
    subscribersRef.current.add(s);
    setSubCount(subscribersRef.current.size);
    return () => {
      subscribersRef.current.delete(s);
      setSubCount(subscribersRef.current.size);
    };
  }, []);

  const claim = useCallback(async () => {
    setLocalClaimCount((n) => n + 1);
    if (isTauri()) {
      try {
        const { emit } = await import("@tauri-apps/api/event");
        await emit(EVT_CLAIM_ACQUIRE, {
          holder: myLabelRef.current,
        } satisfies ClaimEventPayload);
      } catch {
        // Si el emit falla, las otras ventanas no se enteran y van a
        // pelearse por el lector. Es un fallo grave pero no debemos
        // romper el caller — el enroll local sigue funcionando y como
        // mucho la kiosko da un error transitorio.
      }
    }
    let released = false;
    return async () => {
      if (released) return;
      released = true;
      setLocalClaimCount((n) => Math.max(0, n - 1));
      if (isTauri()) {
        try {
          const { emit } = await import("@tauri-apps/api/event");
          await emit(EVT_CLAIM_RELEASE, {
            holder: myLabelRef.current,
          } satisfies ClaimEventPayload);
        } catch {
          // Idem: si el emit falla, eventually la otra ventana descubre
          // (tauri://focus → query) y se recupera.
        }
      }
    };
  }, []);

  const value = useMemo<BiometricStreamContextValue>(
    () => ({ status, subscribe, claim }),
    [status, subscribe, claim],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

/**
 * useBiometricSubscription — registra handlers contra el provider. El
 * stream arranca/se mantiene mientras este hook esté montado (siempre que
 * no haya enroll activo en ninguna ventana). El `enabled` permite condicionar
 * la suscripción sin desmontar el componente — útil cuando el matcher del
 * sidecar aún no está available.
 */
export function useBiometricSubscription(
  handlers: BiometricSubscriber & { enabled?: boolean },
): { status: StreamStatus } {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useBiometricSubscription debe usarse dentro de <BiometricStreamProvider />",
    );
  }
  // Ref pattern: los handlers cambian a cada render del consumer; no
  // queremos re-suscribirnos por eso. El subscriber registrado es estable
  // y delega a los handlers actuales vía ref.
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (handlers.enabled === false) return;
    const subscriber: BiometricSubscriber = {
      onSample: (png, q) => handlersRef.current.onSample?.(png, q),
      onDeviceConnected: () => handlersRef.current.onDeviceConnected?.(),
      onDeviceDisconnected: () => handlersRef.current.onDeviceDisconnected?.(),
      onError: (code) => handlersRef.current.onError?.(code),
    };
    return ctx.subscribe(subscriber);
  }, [ctx, handlers.enabled]);

  return { status: ctx.status };
}

/**
 * useBiometricClaim — devuelve un `claim()` async. El caller llama claim,
 * recibe un `release` async que DEBE invocar en `finally`. Patrón:
 *
 *     const claim = useBiometricClaim();
 *     const release = await claim();
 *     try { await captureOnePng(...); } finally { await release(); }
 */
export function useBiometricClaim(): () => Promise<() => Promise<void>> {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useBiometricClaim debe usarse dentro de <BiometricStreamProvider />",
    );
  }
  return ctx.claim;
}

/**
 * useBiometricStreamStatus — solo lectura del estado para componentes que
 * quieren reflejar "stream activo / pausado" en UI (banner, indicator).
 * No suscribe ni claim-ea.
 */
export function useBiometricStreamStatus(): StreamStatus {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useBiometricStreamStatus debe usarse dentro de <BiometricStreamProvider />",
    );
  }
  return ctx.status;
}
