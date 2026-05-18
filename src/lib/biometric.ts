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
interface FingerprintReader {
  enumerateDevices(): Promise<string[]>;
  startAcquisition(fmt: SampleFormat, deviceUid?: string): Promise<void>;
  stopAcquisition(deviceUid?: string): Promise<void>;
  on(event: string, handler: (e: unknown) => void): FingerprintReader;
  off(event?: string, handler?: (e: unknown) => void): FingerprintReader;
}
interface FingerprintNamespace {
  WebApi: new () => FingerprintReader;
  SampleFormat: { PngImage: SampleFormat };
  b64UrlTo64(s: string): string;
}

declare global {
  interface Window {
    Fingerprint?: FingerprintNamespace;
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

// resetWebSdkSession drops the cached WebSDK connection state. The
// @digitalpersona/websdk Configurator caches the agent's *ephemeral* data
// port + SRP keys in sessionStorage under "websdk" (and "websdk.sessionId").
// That port rotates — the Lite Client agent recycles it per connection —
// so a cached entry goes stale fast: the WebChannel keeps dialing a dead
// port and every call fails with "communication failure" (the SDK's own
// docs call this "obsolete data in local storage"). Clearing the cache and
// dropping the WebApi singleton forces a fresh `/get_connection` bootstrap
// on the next getReader(), so each capture session dials the live port.
function resetWebSdkSession(): void {
  try {
    window.sessionStorage.removeItem("websdk");
    window.sessionStorage.removeItem("websdk.sessionId");
  } catch {
    // sessionStorage can throw in locked-down webviews — best effort.
  }
  readerInstance = null;
}

// Decode the SDK's URL-safe base64 PNG into a Uint8Array. The SDK helper
// `b64UrlTo64` normalises padding + `-_` → `+/`; atob handles the rest.
function decodeSample(ns: FingerprintNamespace, sample: string): Uint8Array {
  const std = ns.b64UrlTo64(sample);
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
export async function captureOnePng(opts: CaptureOneOptions = {}): Promise<Uint8Array> {
  const timeoutMs = opts.timeoutMs ?? 30_000;
  // Force a fresh /get_connection bootstrap — the cached agent port goes
  // stale between captures and causes "communication failure".
  resetWebSdkSession();
  const ns = await ensureSdk();
  const reader = await getReader();

  const devices = await reader.enumerateDevices().catch((e) => {
    throw classify(e);
  });
  if (!devices || devices.length === 0) {
    throw new BiometricError("no_device", "no scanner plugged in");
  }

  return new Promise<Uint8Array>((resolve, reject) => {
    let settled = false;
    const finish = (value: Uint8Array | BiometricError) => {
      if (settled) return;
      settled = true;
      reader.off("SamplesAcquired", onSamples);
      reader.off("ErrorOccurred", onError);
      reader.off("DeviceDisconnected", onDisconnect);
      reader.off("CommunicationFailed", onComm);
      clearTimeout(timer);
      reader.stopAcquisition().catch(() => {
        // Best effort — if we're already stopped, ignore.
      });
      if (value instanceof Uint8Array) resolve(value);
      else reject(value);
    };

    const onSamples = (e: unknown) => {
      try {
        const ev = e as SamplesAcquiredEvent;
        finish(decodeSample(ns, ev.samples));
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

    reader.startAcquisition(ns.SampleFormat.PngImage).catch((err) => {
      finish(classify(err));
    });
  });
}

interface CaptureStreamHandlers {
  onSample(png: Uint8Array): void;
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
  // Fresh bootstrap before the stream — see resetWebSdkSession().
  resetWebSdkSession();
  const ns = await ensureSdk();
  const reader = await getReader();

  const onSamples = (e: unknown) => {
    try {
      const ev = e as SamplesAcquiredEvent;
      handlers.onSample(decodeSample(ns, ev.samples));
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

  reader.on("SamplesAcquired", onSamples);
  reader.on("DeviceConnected", onConnect);
  reader.on("DeviceDisconnected", onDisconnect);
  reader.on("ErrorOccurred", onError);
  reader.on("CommunicationFailed", onComm);

  try {
    await reader.startAcquisition(ns.SampleFormat.PngImage);
  } catch (err) {
    reader.off("SamplesAcquired", onSamples);
    reader.off("DeviceConnected", onConnect);
    reader.off("DeviceDisconnected", onDisconnect);
    reader.off("ErrorOccurred", onError);
    reader.off("CommunicationFailed", onComm);
    throw classify(err);
  }

  return {
    async stop() {
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
    const reader = await getReader();
    const devices = await reader.enumerateDevices();
    return devices.length > 0;
  } catch {
    // Probe failed — most likely a stale WebSDK session (the cached agent
    // port went dead). Reset so the NEXT poll re-bootstraps against the
    // live port: the kiosk's reader-connected gate self-heals within one
    // poll interval instead of staying stuck "disconnected" forever (which
    // would keep useBiometricCheckinLoop disabled and the kiosk blind).
    resetWebSdkSession();
    return false;
  }
}
