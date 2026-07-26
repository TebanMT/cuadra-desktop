/**
 * BiometricEventsProvider — la conexión SSE a /api/v1/biometric/events de
 * ESTA ventana, y nada más.
 *
 * Contraste deliberado con el viejo BiometricStreamProvider: aquél existía
 * para coordinar QUIÉN captura (claims entre ventanas, ruteo-por-foco del
 * Lite Client, watchdogs del WebSocket del agente). Con tinta-bio el sidecar
 * es dueño único del lector y ESTE provider sólo escucha: cada ventana abre
 * su propio stream SSE y recibe TODOS los eventos. No hay claims, no hay
 * pausas, no hay nada que negociar entre ventanas — las reglas anti-doble-
 * feedback viven en las superficies (quién pone el tono), no en el transporte.
 *
 * Ciclo de vida: la conexión existe mientras haya sesión iniciada. Ligarla
 * al user_id del auth store hace que logout→login cierre y reabra el stream
 * por construcción — la clase de bug "canal zombie tras relogin" del stack
 * viejo no tiene dónde vivir.
 *
 * Estado que mantiene:
 *   - `live`: el stream está abierto (para dots/diagnóstico).
 *   - `enrolling`: hay sesión de enroll activa en el sidecar (cualquier
 *     ventana) — la flotante lo usa para su estado "Registrando huella…".
 *   - Query cache de /biometric/status: el snapshot `status` del connect y
 *     los eventos reader_* lo actualizan al instante; el poll de
 *     useBiometricStatus queda de resync de fondo.
 *   - Al reconectar tras una caída invalida ["checkins"]: los resultados que
 *     llegaron mientras el stream estuvo muerto ya están en el sidecar y el
 *     refetch los trae (recientes, conteo del día).
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
import { useQueryClient } from "@tanstack/react-query";
import {
  connectBiometricEvents,
  type BioEventWire,
  type BiometricStatusSnapshot,
} from "./biometricEvents";
import { useAuthStore } from "@/stores/useAuthStore";

// Query key del status biométrico — vive aquí (y no en useBiometric.ts)
// porque el provider escribe el cache y el hook sólo lo lee; así el import
// va en una sola dirección.
export const BIOMETRIC_STATUS_KEY = ["biometric", "status"] as const;

export interface BiometricStatus {
  device_id?: string;
  vendor?: string;
  model?: string;
  connected: boolean;
  available: boolean;
  enrolling?: boolean;
}

type BioEventHandler = (evt: BioEventWire) => void;

interface BiometricEventsContextValue {
  live: boolean;
  enrolling: boolean;
  subscribe(handler: BioEventHandler): () => void;
}

const Ctx = createContext<BiometricEventsContextValue | null>(null);

interface ProviderProps {
  children: ReactNode;
  // testing seam — vitest monta el provider sin abrir conexión real; los
  // tests inyectan eventos mockeando connectBiometricEvents.
  disableConnection?: boolean;
}

export function BiometricEventsProvider({
  children,
  disableConnection = false,
}: ProviderProps) {
  const qc = useQueryClient();
  const subscribersRef = useRef<Set<BioEventHandler>>(new Set());
  const [live, setLive] = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  // true tras la primera caída — al reabrir toca resync de checkins.
  const droppedRef = useRef(false);

  // La conexión sigue a la sesión: sin login no hay token que mandar (el
  // endpoint es autenticado); logout→login la recicla por dependencia.
  const userId = useAuthStore((s) => s.user?.user_id ?? null);

  useEffect(() => {
    if (disableConnection || !userId) {
      setLive(false);
      return;
    }

    const applyStatus = (snapshot: BiometricStatusSnapshot) => {
      setEnrolling(snapshot.enrolling === true);
      qc.setQueryData<BiometricStatus>(BIOMETRIC_STATUS_KEY, {
        device_id: snapshot.device_id,
        vendor: snapshot.vendor,
        model: snapshot.model,
        connected: snapshot.connected,
        available: snapshot.available,
        enrolling: snapshot.enrolling,
      });
    };

    const conn = connectBiometricEvents({
      onOpen: () => {
        setLive(true);
        if (droppedRef.current) {
          droppedRef.current = false;
          // Lo ocurrido durante la caída ya está en el sidecar; refetch.
          qc.invalidateQueries({ queryKey: ["checkins"] });
        }
      },
      onDown: () => {
        droppedRef.current = true;
        setLive(false);
      },
      onStatus: applyStatus,
      onEvent: (evt) => {
        // Estado derivado ANTES del fan-out, para que un subscriber que lea
        // el contexto en su handler vea el estado ya actualizado.
        switch (evt.type) {
          case "reader_connected":
          case "reader_disconnected": {
            const connected = evt.type === "reader_connected";
            qc.setQueryData<BiometricStatus>(BIOMETRIC_STATUS_KEY, (prev) => ({
              ...prev,
              // Available = helper vivo + lector conectado (hub.Available);
              // el evento reader_* implica helper vivo, así que van juntos.
              connected,
              available: connected,
            }));
            break;
          }
          case "enroll_started":
            setEnrolling(true);
            break;
          case "enroll_completed":
          case "enroll_failed":
            setEnrolling(false);
            break;
        }
        for (const handler of [...subscribersRef.current]) {
          try {
            handler(evt);
          } catch {
            // un handler que truena no debe tumbar a los demás.
          }
        }
      },
    });

    return () => {
      conn.close();
      setLive(false);
    };
  }, [disableConnection, userId, qc]);

  const subscribe = useCallback((handler: BioEventHandler) => {
    subscribersRef.current.add(handler);
    return () => {
      subscribersRef.current.delete(handler);
    };
  }, []);

  const value = useMemo<BiometricEventsContextValue>(
    () => ({ live, enrolling, subscribe }),
    [live, enrolling, subscribe],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

function useBiometricEventsCtx(): BiometricEventsContextValue {
  const ctx = useContext(Ctx);
  if (!ctx) {
    throw new Error(
      "useBiometricEvents debe usarse dentro de <BiometricEventsProvider />",
    );
  }
  return ctx;
}

/**
 * useBiometricEvents — registra un handler para TODOS los BioEventWire de
 * esta ventana. `enabled: false` silencia sin desmontar (p.ej. el scanner
 * global se calla en /checkin). Los handlers van por ref: cambiar el
 * callback en cada render no re-suscribe.
 */
export function useBiometricEvents(
  handler: BioEventHandler,
  opts: { enabled?: boolean } = {},
): void {
  const ctx = useBiometricEventsCtx();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;
  const enabled = opts.enabled !== false;

  useEffect(() => {
    if (!enabled) return;
    return ctx.subscribe((evt) => handlerRef.current(evt));
  }, [ctx, enabled]);
}

/** useBiometricLive — ¿está abierto el stream SSE de esta ventana? */
export function useBiometricLive(): boolean {
  return useBiometricEventsCtx().live;
}

/**
 * useBiometricEnrolling — ¿hay sesión de enroll activa en el sidecar? Es
 * global al gym (una sola sesión), no de esta ventana.
 */
export function useBiometricEnrolling(): boolean {
  return useBiometricEventsCtx().enrolling;
}
