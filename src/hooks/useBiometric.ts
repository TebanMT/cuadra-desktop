import { useCallback, useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  BIOMETRIC_STATUS_KEY,
  useBiometricEnrolling,
  useBiometricEvents,
  type BiometricStatus,
} from "@/lib/biometricEventsProvider";
import type { EnrollFailCode } from "@/lib/biometricEvents";
import type { CheckinEvent } from "./useCheckin";

// Post-inversión tinta-bio: el sidecar es dueño del lector (helper
// tinta-bio.exe) y este módulo sólo consume su API:
//
//   - GET  /api/v1/biometric/status        → snapshot {connected, available}
//   - GET  /api/v1/biometric/events        → SSE (vía biometricEventsProvider)
//   - POST /api/v1/biometric/enroll/start  → sesión de enroll
//   - POST /api/v1/biometric/enroll/cancel
//
// Ya no hay captura en el FE: ni SDK de DigitalPersona, ni POSTs de imagen.

export { BIOMETRIC_STATUS_KEY };
export type { BiometricStatus };

// useBiometricStatus — poll de resync del snapshot. `connected` ahora SÍ es
// el lector físico (helper vivo + lector abierto) y `available` es el gate
// operativo (misma condición hoy). Las transiciones llegan al instante por
// SSE (el provider escribe este mismo query cache); el poll cubre ventanas
// sin stream vivo y cualquier evento perdido.
export function useBiometricStatus(enabled = true) {
  return useQuery<BiometricStatus>({
    queryKey: BIOMETRIC_STATUS_KEY,
    queryFn: () => api.get<BiometricStatus>("/api/v1/biometric/status"),
    refetchInterval: 5_000,
    refetchIntervalInBackground: true,
    enabled,
    staleTime: 4_000,
  });
}

// "Esta PC ya tuvo lector alguna vez" — persiste en localStorage para que
// los avisos de lector desconectado sólo aparezcan donde son accionables.
// Sin esta marca, un gym que opera por número (sin lector) viviría con un
// badge ámbar permanente en el TopBar; con ella, el aviso sólo sale cuando
// el lector que SIEMPRE ha estado deja de responder (cable suelto, puerto
// muerto) — incluso tras reiniciar la app.
const READER_SEEN_KEY = "tinta.bio.reader_seen";

function readerWasSeen(): boolean {
  try {
    return window.localStorage.getItem(READER_SEEN_KEY) === "1";
  } catch {
    return false;
  }
}

/**
 * useReaderMissing — true cuando toca avisar "lector de huella
 * desconectado": el sidecar reporta que no hay lector Y esta PC sí ha
 * tenido uno. Fuente única del badge del TopBar y las pills de
 * check-in/kiosko.
 */
export function useReaderMissing(): boolean {
  const bio = useBiometricStatus();
  const connected = bio.data?.connected === true;
  useEffect(() => {
    if (!connected) return;
    try {
      window.localStorage.setItem(READER_SEEN_KEY, "1");
    } catch {
      // localStorage bloqueado — el aviso simplemente no se gatea.
    }
  }, [connected]);
  return bio.data != null && !connected && readerWasSeen();
}

// ---------------------------------------------------------------------------
// Feed de check-in — antes "loop" (captura → POST multipart), hoy sólo
// traducción de eventos SSE a callbacks de UI.
// ---------------------------------------------------------------------------

interface UseBiometricCheckinFeedOptions {
  // enabled silencia el feed sin desmontar — p.ej. el scanner global se
  // calla en /checkin porque ahí CheckinPage pinta (anti doble-feedback
  // dentro de la MISMA ventana; entre ventanas cada superficie decide).
  enabled?: boolean;
  onAttempt?(): void;
  // onCheckin: el sidecar identificó al socio y registró el check-in. El
  // evento es el mismo wire CheckinEvent de los endpoints.
  onCheckin(event: CheckinEvent): void;
  // onNoMatch: hubo dedazo pero nadie coincidió (UC-029) — sin row en BD;
  // la superficie muestra "no reconocimos la huella" sin tocar recientes.
  onNoMatch?(): void;
  // onSampleRejected: dedazo de mala calidad — feedback "vuelve a apoyar".
  onSampleRejected?(): void;
  // onError: fallo operacional (helper caído a media identificación, etc.).
  onError?(message?: string): void;
}

/**
 * useBiometricCheckinFeed — suscribe la superficie al flujo de check-in del
 * sidecar. TODAS las ventanas reciben TODOS los eventos (SSE broadcast);
 * quién pinta y quién suena es decisión de cada superficie, no del feed.
 */
export function useBiometricCheckinFeed(opts: UseBiometricCheckinFeedOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // Con una sesión de enroll activa el helper sigue emitiendo
  // sample_rejected, pero esos dedazos son del enroll en recepción — las
  // superficies de check-in no deben reaccionar.
  const enrolling = useBiometricEnrolling();
  const enrollingRef = useRef(enrolling);
  enrollingRef.current = enrolling;

  useBiometricEvents(
    (evt) => {
      switch (evt.type) {
        case "checkin_attempt_started":
          optsRef.current.onAttempt?.();
          break;
        case "checkin_result":
          if (evt.checkin) optsRef.current.onCheckin(evt.checkin);
          break;
        case "checkin_no_match":
          optsRef.current.onNoMatch?.();
          break;
        case "checkin_error":
          optsRef.current.onError?.(evt.message);
          break;
        case "sample_rejected":
          if (!enrollingRef.current) optsRef.current.onSampleRejected?.();
          break;
      }
    },
    { enabled: opts.enabled !== false },
  );
}

// ---------------------------------------------------------------------------
// Enroll — sesión del sidecar (3 dedazos acumulados allá); aquí sólo el
// start/cancel HTTP y el progreso que llega por SSE.
// ---------------------------------------------------------------------------

export interface CollisionMember {
  id: string;
  name: string;
}

export type ProgressError =
  | "reader"
  | "capture"
  | "timeout"
  | "collision"
  | "generic";

// State machine que pintan el modal y el stage inline de MemberCreatePage.
// Mismo shape que el flujo viejo a propósito:
//   waiting   → sesión abierta, esperando el siguiente dedazo
//   capturing → dedazos completos, el sidecar combina y persiste
export interface FingerprintProgress {
  status: "idle" | "waiting" | "capturing" | "success" | "failed";
  captures_done: number;
  captures_total: number;
  error?: ProgressError;
  collisionMember?: CollisionMember;
}

interface UseRegisterFingerprintOptions {
  onSuccess?(): void;
  onError?(code: ProgressError): void;
}

// El sidecar manda required_samples en el 202; este default sólo pinta los
// dots antes de que la respuesta llegue.
const DEFAULT_REQUIRED_SAMPLES = 3;

const IDLE_PROGRESS: FingerprintProgress = {
  status: "idle",
  captures_done: 0,
  captures_total: DEFAULT_REQUIRED_SAMPLES,
};

interface EnrollStartResponse {
  session_id: string;
  member_id: string;
  expires_at: string;
  required_samples: number;
}

function mapEnrollFailCode(code: string | undefined): ProgressError {
  switch (code as EnrollFailCode | undefined) {
    case "fingerprint_collision":
      return "collision";
    case "timeout":
      return "timeout";
    case "enrollment_invalid":
      return "capture";
    default:
      return "generic";
  }
}

function mapStartError(err: unknown): ProgressError {
  if (err instanceof ApiError) {
    if (
      err.status === 503 ||
      err.code === "biometric_unavailable" ||
      err.code === "reader_unavailable"
    ) {
      return "reader";
    }
  }
  return "generic";
}

export function useRegisterFingerprint(
  memberId: string,
  opts: UseRegisterFingerprintOptions = {},
) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<FingerprintProgress>(IDLE_PROGRESS);
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // session_id de NUESTRA sesión. La adopción tolera la carrera POST-vs-SSE:
  // el enroll_started puede llegar antes de que el 202 resuelva.
  const sessionRef = useRef<string | null>(null);
  const startInFlightRef = useRef(false);

  useBiometricEvents((evt) => {
    const enroll = evt.enroll;
    if (!enroll) return;
    if (sessionRef.current === null) {
      // El sidecar sólo permite UNA sesión a la vez: si nuestro start está
      // en vuelo, el enroll_started que llegue es nuestro.
      if (startInFlightRef.current && evt.type === "enroll_started") {
        sessionRef.current = enroll.session_id;
      } else {
        return; // sesión ajena (u obsoleta tras nuestro cancel)
      }
    }
    if (enroll.session_id !== sessionRef.current) return;

    switch (evt.type) {
      case "enroll_started":
      case "enroll_progress":
        setProgress({
          status: enroll.captured >= enroll.required ? "capturing" : "waiting",
          captures_done: enroll.captured,
          captures_total: enroll.required,
        });
        break;
      case "enroll_completed":
        sessionRef.current = null;
        setProgress({
          status: "success",
          captures_done: enroll.required,
          captures_total: enroll.required,
        });
        qc.invalidateQueries({ queryKey: ["members"] });
        optsRef.current.onSuccess?.();
        break;
      case "enroll_failed": {
        sessionRef.current = null;
        if (evt.code === "cancelled") {
          // Cancel propio (cerrar el modal) — no es un error que pintar.
          setProgress(IDLE_PROGRESS);
          return;
        }
        const mapped = mapEnrollFailCode(evt.code);
        setProgress({
          status: "failed",
          captures_done: enroll.captured,
          captures_total: enroll.required,
          error: mapped,
          collisionMember:
            mapped === "collision" &&
            enroll.existing_member_id &&
            enroll.existing_member_name
              ? {
                  id: enroll.existing_member_id,
                  name: enroll.existing_member_name,
                }
              : undefined,
        });
        optsRef.current.onError?.(mapped);
        break;
      }
    }
  });

  const cancel = useCallback(() => {
    startInFlightRef.current = false;
    if (sessionRef.current !== null) {
      sessionRef.current = null;
      // Fire-and-forget: si el POST se pierde, la sesión expira sola a los
      // 60s del lado del sidecar.
      void api
        .post("/api/v1/biometric/enroll/cancel", undefined, { retry: 0 })
        .catch(() => undefined);
    }
  }, []);

  const reset = useCallback(() => {
    cancel();
    setProgress(IDLE_PROGRESS);
  }, [cancel]);

  const start = useCallback(async () => {
    if (startInFlightRef.current || sessionRef.current !== null) return;
    startInFlightRef.current = true;
    setProgress({
      status: "waiting",
      captures_done: 0,
      captures_total: DEFAULT_REQUIRED_SAMPLES,
    });

    const startOnce = () =>
      api.post<EnrollStartResponse>(
        "/api/v1/biometric/enroll/start",
        { member_id: memberId, consent_accepted: true },
        { retry: 0 },
      );

    try {
      let res: EnrollStartResponse;
      try {
        res = await startOnce();
      } catch (err) {
        // 409 = quedó una sesión huérfana (modal que murió sin cancelar, u
        // otro operador a medias). La cancelamos y reintentamos UNA vez —
        // la acción más reciente del operador gana.
        if (err instanceof ApiError && err.status === 409) {
          await api
            .post("/api/v1/biometric/enroll/cancel", undefined, { retry: 0 })
            .catch(() => undefined);
          res = await startOnce();
        } else {
          throw err;
        }
      }
      if (!startInFlightRef.current) {
        // cancel()/reset() llegó mientras el POST volaba — la sesión recién
        // abierta sobra; se cancela para no dejarla huérfana 60s.
        void api
          .post("/api/v1/biometric/enroll/cancel", undefined, { retry: 0 })
          .catch(() => undefined);
        return;
      }
      if (sessionRef.current === null) sessionRef.current = res.session_id;
      setProgress((p) => ({
        ...p,
        captures_total: res.required_samples || DEFAULT_REQUIRED_SAMPLES,
      }));
    } catch (err) {
      if (!startInFlightRef.current) return;
      const mapped = mapStartError(err);
      setProgress({
        status: "failed",
        captures_done: 0,
        captures_total: DEFAULT_REQUIRED_SAMPLES,
        error: mapped,
      });
      optsRef.current.onError?.(mapped);
    } finally {
      startInFlightRef.current = false;
    }
  }, [memberId]);

  // Desmontar la superficie de enroll cancela la sesión del sidecar — sin
  // esto, un modal cerrado a la brava dejaría el check-in pausado hasta el
  // timeout de 60s.
  useEffect(() => () => cancel(), [cancel]);

  return { progress, start, cancel, reset };
}
