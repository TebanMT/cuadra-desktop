// Cliente SSE de GET /api/v1/biometric/events — el contrato post-inversión
// tinta-bio: el sidecar es dueño único del lector (spawnea tinta-bio.exe y
// habla NDJSON con él); el FE NUNCA captura ni postea imágenes, sólo escucha
// eventos y pinta. Fuente de verdad del wire: biometric_controller.go +
// biometric_events.go en cuadra-core.
//
// Por qué fetch + ReadableStream y no EventSource: el endpoint corre detrás
// del AuthMiddleware normal (Bearer) y EventSource no puede mandar headers.
// El sidecar además espera X-Local-Token como todo request local.
//
// El cliente es autónomo: reconecta con backoff exponencial, refresca el
// access token en 401, y trae watchdog de heartbeat (el server manda un
// comentario ": hb" cada 15s — si pasan HEARTBEAT_DEAD_MS sin UN byte, el
// stream está muerto aunque el socket diga lo contrario, y se redialea).
// La lección del Lite Client aplica igual aquí: un canal "vivo pero sordo"
// sin watchdog es un lector muerto hasta reiniciar la app.

import { getAuthedRequestContext, refreshAccessToken } from "./api";
import type { CheckinEvent } from "@/hooks/useCheckin";

// ---------------------------------------------------------------------------
// Tipos del wire (espejo de bioEventWire / biometricStatusResp del sidecar)
// ---------------------------------------------------------------------------

export type BioEventType =
  | "reader_connected"
  | "reader_disconnected"
  | "sample_rejected"
  | "checkin_attempt_started"
  | "checkin_result"
  | "checkin_no_match"
  | "checkin_error"
  | "enroll_started"
  | "enroll_progress"
  | "enroll_completed"
  | "enroll_failed";

// Códigos de enroll_failed (BioEventWire.code) — espejo de biometric_events.go.
export type EnrollFailCode =
  | "timeout"
  | "cancelled"
  | "fingerprint_collision"
  | "enrollment_invalid"
  | "engine_error"
  | "internal";

export interface BioReaderWire {
  name?: string;
  serial?: string;
}

export interface BioEnrollWire {
  session_id: string;
  member_id: string;
  captured: number;
  required: number;
  expires_at?: string;
  // Sólo en enroll_completed.
  fingerprint_ids?: string[];
  // Contrato fingerprint_collision (en enroll_failed).
  existing_member_id?: string;
  existing_member_name?: string;
}

export interface BioEventWire {
  type: BioEventType;
  timestamp: string;
  // Español operator-facing (errores / no-match).
  message?: string;
  // Variantes machine-readable (códigos de sample_rejected, EnrollFailCode).
  code?: string;
  // Calidad categórica del helper (DP_QUALITY_*).
  quality?: string;
  reader?: BioReaderWire;
  // Mismo wire CheckinEvent que los endpoints de checkins.
  checkin?: CheckinEvent;
  enroll?: BioEnrollWire;
}

// Snapshot que el server manda como evento `status` al abrir el stream —
// mismo shape que GET /api/v1/biometric/status. `connected` ahora SÍ es el
// lector físico (helper vivo + lector abierto); `available` = listo para
// operar (misma condición hoy, pero es el gate semántico del FE).
export interface BiometricStatusSnapshot {
  device_id?: string;
  vendor?: string;
  model?: string;
  connected: boolean;
  available: boolean;
  enrolling?: boolean;
}

// ---------------------------------------------------------------------------
// Parser SSE incremental
// ---------------------------------------------------------------------------

// El server escribe frames simples: "event: <tipo>\ndata: <json>\n\n" y
// heartbeats ": hb\n\n". El parser es incremental porque los chunks del
// ReadableStream cortan donde quieren. data multilinea no existe en este
// contrato pero se concatena igual (spec SSE) por robustez.
export interface SseFrame {
  event: string;
  data: string;
}

export function createSseParser(onFrame: (frame: SseFrame) => void) {
  let buffer = "";

  function processBlock(block: string) {
    let event = "message";
    const dataLines: string[] = [];
    for (const rawLine of block.split("\n")) {
      const line = rawLine.endsWith("\r") ? rawLine.slice(0, -1) : rawLine;
      if (line.startsWith(":")) continue; // comentario (heartbeat)
      if (line.startsWith("event:")) event = line.slice(6).trim();
      else if (line.startsWith("data:")) dataLines.push(line.slice(5).trimStart());
    }
    if (dataLines.length > 0) onFrame({ event, data: dataLines.join("\n") });
  }

  return {
    push(chunk: string) {
      buffer += chunk;
      // Un frame termina en línea en blanco. Soportamos \n\n y \r\n\r\n.
      for (;;) {
        const lf = buffer.indexOf("\n\n");
        const crlf = buffer.indexOf("\r\n\r\n");
        let cut: number;
        let sepLen: number;
        if (lf === -1 && crlf === -1) return;
        if (crlf !== -1 && (lf === -1 || crlf < lf)) {
          cut = crlf;
          sepLen = 4;
        } else {
          cut = lf;
          sepLen = 2;
        }
        const block = buffer.slice(0, cut);
        buffer = buffer.slice(cut + sepLen);
        if (block.trim().length > 0) processBlock(block);
      }
    },
    reset() {
      buffer = "";
    },
  };
}

// ---------------------------------------------------------------------------
// Conexión
// ---------------------------------------------------------------------------

export interface BiometricEventsHandlers {
  // Snapshot al (re)conectar — el FE arranca sincronizado sin esperar el
  // primer evento real.
  onStatus?(snapshot: BiometricStatusSnapshot): void;
  onEvent?(evt: BioEventWire): void;
  // El stream quedó abierto (headers 200 recibidos).
  onOpen?(): void;
  // El stream se cayó; el cliente reintenta solo con backoff. Sirve para
  // pintar "reconectando" si alguna superficie lo quiere.
  onDown?(): void;
}

export interface BiometricEventsConnection {
  close(): void;
}

const BACKOFF_MS = [1_000, 2_000, 4_000, 8_000, 15_000];
// El server manda ": hb" cada 15s. 45s sin un byte = canal muerto aunque el
// socket no haya cerrado — redial.
const HEARTBEAT_DEAD_MS = 45_000;
const WATCHDOG_TICK_MS = 10_000;

export function connectBiometricEvents(
  handlers: BiometricEventsHandlers,
): BiometricEventsConnection {
  let closed = false;
  let attempt = 0;
  let ctrl: AbortController | null = null;
  let retryTimer: number | undefined;
  let watchdogTimer: number | undefined;
  let lastActivity = Date.now();

  const parser = createSseParser((frame) => {
    if (closed) return;
    try {
      const payload = JSON.parse(frame.data) as unknown;
      if (frame.event === "status") {
        handlers.onStatus?.(payload as BiometricStatusSnapshot);
      } else {
        handlers.onEvent?.(payload as BioEventWire);
      }
    } catch {
      // data corrupta: se descarta el frame, el stream sigue.
    }
  });

  function scheduleRetry() {
    if (closed) return;
    handlers.onDown?.();
    const delay = BACKOFF_MS[Math.min(attempt, BACKOFF_MS.length - 1)];
    attempt++;
    retryTimer = window.setTimeout(() => void run(), delay);
  }

  function stopWatchdog() {
    if (watchdogTimer !== undefined) {
      window.clearInterval(watchdogTimer);
      watchdogTimer = undefined;
    }
  }

  async function run(): Promise<void> {
    if (closed) return;
    parser.reset();
    ctrl = new AbortController();
    const thisCtrl = ctrl;
    try {
      const { baseUrl, headers } = await getAuthedRequestContext();
      const res = await fetch(`${baseUrl}/api/v1/biometric/events`, {
        headers: { ...headers, Accept: "text/event-stream" },
        signal: thisCtrl.signal,
      });

      if (res.status === 401) {
        // Token vencido — refrescamos UNA vez y caemos al backoff normal si
        // sigue fallando (p.ej. sidecar a medio arrancar).
        await refreshAccessToken();
        scheduleRetry();
        return;
      }
      if (!res.ok || !res.body) {
        scheduleRetry();
        return;
      }

      lastActivity = Date.now();
      handlers.onOpen?.();

      // Watchdog: si el server deja de mandar (ni heartbeats), abortamos el
      // fetch — el catch de abajo agenda el redial.
      stopWatchdog();
      watchdogTimer = window.setInterval(() => {
        if (Date.now() - lastActivity > HEARTBEAT_DEAD_MS) {
          thisCtrl.abort();
        }
      }, WATCHDOG_TICK_MS);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      for (;;) {
        const { done, value } = await reader.read();
        if (closed) return;
        if (done) break;
        // El backoff se resetea al PRIMER byte, no al 200: un server que
        // acepta y cierra en seco debe seguir subiendo el backoff. La
        // conexión sana manda el snapshot `status` de inmediato.
        attempt = 0;
        lastActivity = Date.now();
        parser.push(decoder.decode(value, { stream: true }));
      }
      // Stream terminado del lado del server (restart del sidecar) — redial.
      stopWatchdog();
      scheduleRetry();
    } catch {
      if (closed) return;
      stopWatchdog();
      scheduleRetry();
    }
  }

  void run();

  return {
    close() {
      closed = true;
      stopWatchdog();
      if (retryTimer !== undefined) window.clearTimeout(retryTimer);
      ctrl?.abort();
    },
  };
}
