// Thin wrapper around @digitalpersona/fingerprint per ADR-004-bis §2.
//
// The SDK is UMD-style: it attaches a `Fingerprint` namespace to window
// when its script tag runs. Vite's ESM imports won't expose those globals,
// so we lazy-load the SDK via dynamic <script> injection (the package's
// "browser" export gives us a URL Vite copies to dist/assets/).
//
// The wrapper owns ONE WebApi instance and exposes two flavors of capture:
//   - captureOnePng()      → single shot for the enroll modal.
//   - startCaptureStream() → continuous loop for the kiosk page.
//
// Errors are normalised to a small enum the hooks can map to UI strings:
//   "lite_client_unreachable" — Lite Client agent not installed or stopped.
//   "no_device"               — no scanner plugged in.
//   "timeout"                 — captureOne hit its deadline.
//   "sdk_error"               — anything else from the SDK.

// `?url` returns the asset URL Vite emits for the bundled SDK script.
// The package's exports field only exposes `.`, so import the package
// root — Vite resolves through the "browser" condition.
import fingerprintSdkUrl from "@digitalpersona/fingerprint?url";
import websdkUrl from "@digitalpersona/websdk?url";

export const ENROLL_QUALITY_FLOOR = 60;
export const CHECKIN_QUALITY_FLOOR = 40;

export type BiometricErrorCode =
  | "lite_client_unreachable"
  | "no_device"
  | "timeout"
  | "sdk_error";

export class BiometricError extends Error {
  constructor(public code: BiometricErrorCode, message: string) {
    super(message);
    this.name = "BiometricError";
  }
}

// Minimal subset of the SDK surface we touch — see
// node_modules/@digitalpersona/fingerprint/dist/fingerprint.sdk.d.ts for
// the full declaration. Declaring our own keeps the rest of the app free
// of the global `Fingerprint` namespace.
type SampleFormat = 5; // PngImage
interface SamplesAcquiredEvent {
  deviceUid: string;
  sampleFormat: SampleFormat;
  samples: string; // URL-safe base64 PNG
}
interface AcquisitionEvent {
  deviceUid: string;
}
interface ErrorEvent {
  deviceUid: string;
  error: number;
}
interface QualityReportedEvent {
  deviceUid: string;
  quality: number;
}
interface FingerprintReader {
  enumerateDevices(): Promise<string[]>;
  startAcquisition(fmt: SampleFormat, deviceUid?: string): Promise<void>;
  stopAcquisition(deviceUid?: string): Promise<void>;
  on(event: string, handler: (e: unknown) => void): FingerprintReader;
  off(event?: string, handler?: (e: unknown) => void): FingerprintReader;
  // El canal WebSocket subyacente al agente. El d.ts del SDK lo declara
  // private, pero existe en runtime y WebChannelClient expone disconnect()
  // público — lo usamos en resetWebSdkSession() para cerrar el socket de
  // verdad en lugar de abandonarlo abierto (ver comentario ahí).
  webChannel?: { disconnect(): void };
}
interface FingerprintNamespace {
  WebApi: new () => FingerprintReader;
  SampleFormat: { PngImage: SampleFormat };
  b64UrlTo64(s: string): string;
}

// @digitalpersona/websdk attaches its internal namespace to window as
// `WebSdkCore`. `configurator` is a page-life singleton; its connection
// fields (`m_port` etc.) are the stale-port cache we have to clear — see
// resetWebSdkSession(). Only the fields we touch are declared here.
interface WebSdkConfigurator {
  m_port?: number;
  m_host?: string;
  m_isSecure?: boolean;
  m_srp?: unknown;
}

declare global {
  interface Window {
    Fingerprint?: FingerprintNamespace;
    WebSdkCore?: { configurator?: WebSdkConfigurator };
  }
}

let sdkPromise: Promise<FingerprintNamespace> | null = null;
let readerInstance: FingerprintReader | null = null;

function loadScript(url: string): Promise<void> {
  return new Promise((resolve, reject) => {
    // Reuse an already-injected tag if the wrapper was reset mid-session
    // (vite HMR) — avoids reloading the WebSDK and re-creating the
    // singleton WebSocket to the Lite Client.
    const existing = document.querySelector<HTMLScriptElement>(
      `script[data-tinta-bio="${url}"]`,
    );
    if (existing) {
      if (existing.dataset.loaded === "true") return resolve();
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error(url)), { once: true });
      return;
    }
    const tag = document.createElement("script");
    tag.src = url;
    tag.async = false;
    tag.dataset.tintaBio = url;
    tag.addEventListener(
      "load",
      () => {
        tag.dataset.loaded = "true";
        resolve();
      },
      { once: true },
    );
    tag.addEventListener("error", () => reject(new Error(url)), { once: true });
    document.head.appendChild(tag);
  });
}

async function ensureSdk(): Promise<FingerprintNamespace> {
  if (sdkPromise) return sdkPromise;
  sdkPromise = (async () => {
    // Order matters: WebSdk (transport) must be on `window` before the
    // fingerprint SDK runs (it calls `new WebSdk.WebChannel(...)` at
    // construction time inside WebApi).
    await loadScript(websdkUrl);
    await loadScript(fingerprintSdkUrl);
    const ns = window.Fingerprint;
    if (!ns) {
      throw new BiometricError(
        "sdk_error",
        "Fingerprint SDK did not attach to window",
      );
    }
    return ns;
  })().catch((err) => {
    sdkPromise = null;
    throw err;
  });
  return sdkPromise;
}

async function getReader(): Promise<FingerprintReader> {
  const ns = await ensureSdk();
  if (!readerInstance) {
    readerInstance = new ns.WebApi();
  }
  return readerInstance;
}

// resetWebSdkSession tears down the current channel to the agent and drops
// the cached WebSDK connection state so the next getReader() re-bootstraps
// against the agent's live data port.
//
// SOLO se llama en caminos de FALLO (canal muerto, puerto stale). Antes se
// llamaba incondicionalmente al inicio de cada startCaptureStream /
// captureOnePng, y eso fabricaba sockets zombie: cada arranque abandonaba
// el WebSocket anterior ABIERTO (stop() sólo hace stopAcquisition, nunca
// cerraba el canal) y abría uno nuevo. El agente del Lite Client puede
// dejar la entrega de SamplesAcquired amarrada al socket viejo — la página
// queda "viva pero sorda": enumerate/startAcquisition responden OK por el
// canal nuevo pero los dedazos nunca llegan, sin ningún error. Se
// reproducía con logout→login (el único flujo que apaga y re-prende el
// stream de la ventana main) y sólo lo curaba reiniciar la app. Ver
// readyReader() para la política actual: un canal persistente por página,
// redial únicamente cuando el canario falla.
//
// The @digitalpersona/websdk Configurator caches the agent's *ephemeral*
// data port + SRP keys in two places: sessionStorage ("websdk" /
// "websdk.sessionId") AND its own in-memory fields. The Configurator is a
// page-life singleton (window.WebSdkCore.configurator) whose constructor
// reads sessionStorage exactly once; from then on its `ensureLoaded()`
// short-circuits whenever its in-memory `url`+`srp` are populated and
// never re-runs `/get_connection`.
//
// That port rotates — the Lite Client agent recycles it (agent restart,
// idle timeout, sleep/resume) — so a cached entry goes stale: the
// WebChannel keeps dialing a dead port and every call fails with
// "communication failure". Clearing *only* sessionStorage is not enough,
// because the singleton still holds the dead port in memory. We must also
// null the singleton's in-memory fields so `ensureLoaded()` re-runs the
// `/get_connection` bootstrap and the next capture session dials the live
// port.
function resetWebSdkSession(): void {
  try {
    // Cerrar el socket viejo DE VERDAD antes de soltar la referencia. Un
    // disconnect sobre un canal ya muerto es no-op; sobre uno vivo evita
    // que el agente lo siga considerando dueño de los eventos del lector.
    readerInstance?.webChannel?.disconnect();
  } catch {
    // best effort — el campo es privado del SDK y podría renombrarse.
  }
  try {
    window.sessionStorage.removeItem("websdk");
    window.sessionStorage.removeItem("websdk.sessionId");
  } catch {
    // sessionStorage can throw in locked-down webviews — best effort.
  }
  try {
    const cfg = window.WebSdkCore?.configurator;
    if (cfg) {
      // `url` getter returns null when m_port/m_host are unset, which makes
      // ensureLoaded() fall through to a fresh /get_connection.
      cfg.m_port = undefined;
      cfg.m_host = undefined;
      cfg.m_isSecure = undefined;
      cfg.m_srp = undefined;
    }
  } catch {
    // WebSDK not loaded yet, or fields renamed in a future version — best
    // effort. The sessionStorage clear above still helps on a fresh page.
  }
  readerInstance = null;
}

// readyReader devuelve el reader del canal persistente con el lector ya
// enumerado. El canal es UNO por página y vive mientras funcione — NO se
// re-bootstrapa en cada arranque de stream/captura (eso fabricaba zombies,
// ver resetWebSdkSession). enumerateDevices() actúa de canario sobre el
// canal existente: es un round-trip real al agente, así que un socket
// muerto o un puerto stale lo hacen fallar. Sólo entonces reseteamos
// (cerrando el socket viejo) y redialeamos UNA vez; si el redial también
// falla, el error clasificado sube al caller (el provider reintenta con
// backoff, el poll de isReaderConnected reintenta al siguiente tick).
async function readyReader(): Promise<{
  ns: FingerprintNamespace;
  reader: FingerprintReader;
  devices: string[];
}> {
  const ns = await ensureSdk();
  let reader = await getReader();
  let devices: string[];
  try {
    devices = await reader.enumerateDevices();
  } catch {
    resetWebSdkSession();
    reader = await getReader();
    devices = await reader.enumerateDevices().catch((e) => {
      throw classify(e);
    });
  }
  if (!devices || devices.length === 0) {
    // Canal sano, lector desenchufado — no hay nada que redialear.
    throw new BiometricError("no_device", "no scanner plugged in");
  }
  return { ns, reader, devices };
}

// Decode the SDK's sample payload into PNG bytes. `SamplesAcquired.samples`
// is a JSON-encoded array of base64url strings (one element per finger
// placement); element [0] is the PNG for our single-shot PngImage
// acquisition. The raw `samples` string is JSON — feeding it straight to
// atob() throws InvalidCharacterError, so it must be JSON.parsed first.
// See @digitalpersona/fingerprint docs/usage/index.adoc.
function decodeSample(ns: FingerprintNamespace, sample: string): Uint8Array<ArrayBuffer> {
  const parsed = JSON.parse(sample) as unknown;
  const b64url = Array.isArray(parsed) ? String(parsed[0]) : String(parsed);
  const std = ns.b64UrlTo64(b64url);
  const bin = atob(std);
  const out = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

// Map raw SDK / network failures to our error enum. The SDK throws
// generic `Error`s; we sniff the message for the well-known cases.
function classify(err: unknown): BiometricError {
  if (err instanceof BiometricError) return err;
  const msg = err instanceof Error ? err.message : String(err);
  if (/communication|websocket|connect/i.test(msg)) {
    return new BiometricError("lite_client_unreachable", msg);
  }
  // HRESULT 0x80070002 (-2147024894, ERROR_FILE_NOT_FOUND): el agente del
  // Lite Client respondió el /get_connection pero no encuentra una pieza
  // suya (servicio DpHost parado, instalación a medias, o runtime 4.x de
  // otro sistema — p.ej. HDLEON — en lugar del Lite Client 5.2 real). Sin
  // este mapeo caía a sdk_error y el operador veía un mensaje genérico en
  // vez del accionable "no detecto el lector".
  if (/-2147024894|0x80070002|no puede encontrar el archivo|cannot find the file/i.test(msg)) {
    return new BiometricError("lite_client_unreachable", msg);
  }
  if (/no device|enumerate/i.test(msg)) {
    return new BiometricError("no_device", msg);
  }
  return new BiometricError("sdk_error", msg);
}

interface CaptureOneOptions {
  timeoutMs?: number;
  signal?: AbortSignal;
}

/**
 * captureOnePng starts acquisition, waits for the next finger placement,
 * then stops and returns the PNG bytes. Intended for the enroll modal —
 * operator presses "start", we get one good capture, hand it to the BE.
 *
 * Throws BiometricError with a code the hook can map to a Spanish string.
 */
export async function captureOnePng(opts: CaptureOneOptions = {}): Promise<{ png: Uint8Array<ArrayBuffer>; sdkQuality: number }> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  // Canal persistente + canario con redial-en-fallo (cubre el puerto stale
  // entre capturas sin fabricar sockets zombie) — ver readyReader().
  const { ns, reader, devices } = await readyReader();

  return new Promise<{ png: Uint8Array<ArrayBuffer>; sdkQuality: number }>((resolve, reject) => {
    let lastQuality = 0;
    let settled = false;
    const finish = (value: { png: Uint8Array<ArrayBuffer>; sdkQuality: number } | BiometricError) => {
      if (settled) return;
      settled = true;
      reader.off("QualityReported", onQuality);
      reader.off("SamplesAcquired", onSamples);
      reader.off("ErrorOccurred", onError);
      reader.off("DeviceDisconnected", onDisconnect);
      reader.off("CommunicationFailed", onComm);
      clearTimeout(timer);
      reader.stopAcquisition().catch(() => {
        // Best effort — if we're already stopped, ignore.
      });
      if (value instanceof BiometricError) reject(value);
      else resolve(value);
    };

    const onQuality = (e: unknown) => {
      lastQuality = (e as QualityReportedEvent).quality ?? 0;
    };
    const onSamples = (e: unknown) => {
      try {
        const ev = e as SamplesAcquiredEvent;
        finish({ png: decodeSample(ns, ev.samples), sdkQuality: lastQuality });
      } catch (err) {
        finish(classify(err));
      }
    };
    const onError = (e: unknown) => {
      const ev = e as ErrorEvent;
      finish(new BiometricError("sdk_error", `reader error ${ev.error}`));
    };
    const onDisconnect = (_e: unknown) => {
      finish(new BiometricError("no_device", "device disconnected mid-capture"));
    };
    const onComm = () => {
      finish(new BiometricError("lite_client_unreachable", "comm failed"));
    };

    reader.on("QualityReported", onQuality);
    reader.on("SamplesAcquired", onSamples);
    reader.on("ErrorOccurred", onError);
    reader.on("DeviceDisconnected", onDisconnect);
    reader.on("CommunicationFailed", onComm);

    const timer = setTimeout(
      () => finish(new BiometricError("timeout", "capture timed out")),
      timeoutMs,
    );

    if (opts.signal) {
      const sig = opts.signal;
      const abort = () =>
        finish(new BiometricError("sdk_error", "aborted by caller"));
      if (sig.aborted) abort();
      else sig.addEventListener("abort", abort, { once: true });
    }

    // Pass the real device UID from enumerateDevices(). The SDK's
    // all-zeros "default device" GUID is rejected with E_INVALIDARG
    // (0x80070057) by the U.are.U Legacy driver.
    reader.startAcquisition(ns.SampleFormat.PngImage, devices[0]).catch((err) => {
      finish(classify(err));
    });
  });
}

interface CaptureStreamHandlers {
  onSample(png: Uint8Array<ArrayBuffer>, sdkQuality: number): void;
  onDeviceConnected?(): void;
  onDeviceDisconnected?(): void;
  // onError fires on transient SDK errors (low quality, etc) and on
  // fatal failures alike — distinguish via `code`. The stream keeps
  // running unless onError throws or the caller calls stop().
  onError?(err: BiometricError): void;
}

export interface CaptureStream {
  stop(): Promise<void>;
}

/**
 * startCaptureStream keeps the reader streaming PNGs for the kiosk loop.
 * Each finger placement fires onSample; the caller POSTs it to the
 * /biometric/checkin endpoint without blocking subsequent captures.
 *
 * If the scanner is unplugged while streaming, onDeviceDisconnected
 * fires but the stream itself stays alive — the SDK resumes when the
 * device comes back. The page can show a "lector desconectado" banner
 * driven by those callbacks.
 */
export async function startCaptureStream(
  handlers: CaptureStreamHandlers,
): Promise<CaptureStream> {
  // Canal persistente + canario con redial-en-fallo — ver readyReader().
  // devices trae el UID real: el GUID all-zeros "default device" lo
  // rechaza el driver U.are.U Legacy con E_INVALIDARG.
  const { ns, reader, devices } = await readyReader();

  let streamLastQuality = 0;
  const onStreamQuality = (e: unknown) => {
    streamLastQuality = (e as QualityReportedEvent).quality ?? 0;
  };
  const onSamples = (e: unknown) => {
    try {
      const ev = e as SamplesAcquiredEvent;
      const quality = streamLastQuality;
      // Discard captures whose SDK quality is too low for reliable matching.
      // The caller never sees them — the stream keeps running for the next
      // finger placement. quality === 0 means the SDK didn't report quality
      // for this placement, so we let it through rather than silently drop.
      if (quality > 0 && quality < CHECKIN_QUALITY_FLOOR) return;
      handlers.onSample(decodeSample(ns, ev.samples), quality);
    } catch (err) {
      handlers.onError?.(classify(err));
    }
  };
  const onConnect = (_e: unknown) => handlers.onDeviceConnected?.();
  const onDisconnect = (_e: unknown) => handlers.onDeviceDisconnected?.();
  const onError = (e: unknown) => {
    const ev = e as ErrorEvent;
    handlers.onError?.(new BiometricError("sdk_error", `reader error ${ev.error}`));
  };
  const onComm = () =>
    handlers.onError?.(new BiometricError("lite_client_unreachable", "comm failed"));

  reader.on("QualityReported", onStreamQuality);
  reader.on("SamplesAcquired", onSamples);
  reader.on("DeviceConnected", onConnect);
  reader.on("DeviceDisconnected", onDisconnect);
  reader.on("ErrorOccurred", onError);
  reader.on("CommunicationFailed", onComm);

  try {
    await reader.startAcquisition(ns.SampleFormat.PngImage, devices[0]);
  } catch (err) {
    reader.off("QualityReported", onStreamQuality);
    reader.off("SamplesAcquired", onSamples);
    reader.off("DeviceConnected", onConnect);
    reader.off("DeviceDisconnected", onDisconnect);
    reader.off("ErrorOccurred", onError);
    reader.off("CommunicationFailed", onComm);
    throw classify(err);
  }

  return {
    async stop() {
      reader.off("QualityReported", onStreamQuality);
      reader.off("SamplesAcquired", onSamples);
      reader.off("DeviceConnected", onConnect);
      reader.off("DeviceDisconnected", onDisconnect);
      reader.off("ErrorOccurred", onError);
      reader.off("CommunicationFailed", onComm);
      try {
        await reader.stopAcquisition();
      } catch {
        // ignore — caller is shutting down anyway
      }
    },
  };
}

/**
 * isReaderConnected does a non-streaming probe. Used by the kiosk header
 * to render the "lector desconectado" banner without having to subscribe
 * to events.
 */
export async function isReaderConnected(): Promise<boolean> {
  try {
    // readyReader ya redialea una vez si el canal murió (y deja el estado
    // reseteado si tampoco eso funcionó), así que el gate del kiosko se
    // auto-cura dentro del mismo poll en vez de esperar al siguiente.
    await readyReader();
    return true;
  } catch {
    return false;
  }
}
