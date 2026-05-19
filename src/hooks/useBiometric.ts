import { useCallback, useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import {
  BiometricError,
  captureOnePng,
  isReaderConnected,
  startCaptureStream,
  ENROLL_QUALITY_FLOOR,
  type BiometricErrorCode,
  type CaptureStream,
} from "@/lib/biometric";

// El sidecar (GET /api/v1/biometric/status) responde flat:
//   { device_id, vendor, model, connected, available }
// donde `connected` = NBIS matcher listo en el sidecar (binarios resueltos),
// `available` = idem. ESTO NO REFLEJA SI EL ESCÁNER USB ESTÁ ENCHUFADO —
// la presencia física la sabe el JS SDK vía DigitalPersona Lite Client.
// Para "ofrecer la opción huella" combinamos: matcher disponible + scanner
// conectado. Ver useBiometricReady más abajo.
export interface BiometricStatus {
  device_id?: string;
  vendor?: string;
  model?: string;
  connected: boolean;
  available: boolean;
}

export const BIOMETRIC_STATUS_KEY = ["biometric", "status"] as const;

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

// useReaderConnected probes the JS SDK (Lite Client + USB) periodically.
// Returns null while the first probe is pending; true/false once known.
// Cheaper than starting a stream just to know whether to show "lector
// desconectado".
export function useReaderConnected(intervalMs = 4_000) {
  const [connected, setConnected] = useState<boolean | null>(null);
  useEffect(() => {
    let cancelled = false;
    const probe = async () => {
      const ok = await isReaderConnected();
      if (!cancelled) setConnected(ok);
    };
    probe();
    const id = window.setInterval(probe, intervalMs);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [intervalMs]);
  return connected;
}

export interface CollisionMember {
  id: string;
  name: string;
}

// CAPTURES_TOTAL is how many times the operator places the SAME finger per
// enrollment. Each placement is POSTed as its own template; the checkin
// matcher then gets that many chances to recognize the member (best-of-N).
// Must stay ≤ the backend's MaxFingerprintsPerMember.
const CAPTURES_TOTAL = 3;

// State machine the modal renders against. Keys deliberately stable across
// the old (sidecar-driven) flow and the new (frontend-driven) flow so the
// UI can iterate without changing the modal contract.
export interface FingerprintProgress {
  status: "idle" | "waiting" | "capturing" | "success" | "failed";
  // captures_done / captures_total drive the modal's progress dots — the
  // enroll flow captures the same finger CAPTURES_TOTAL times.
  captures_done: number;
  captures_total: number;
  last_quality?: number;
  error?: ProgressError;
  collisionMember?: CollisionMember;
}

export type ProgressError = "reader" | "capture" | "collision" | "generic";

interface UseRegisterFingerprintOptions {
  onSuccess?(): void;
  onError?(code: ProgressError): void;
}

const READER_BIO_CODES = new Set<BiometricErrorCode>([
  "lite_client_unreachable",
  "no_device",
]);

function mapBioError(err: BiometricError): ProgressError {
  if (READER_BIO_CODES.has(err.code)) return "reader";
  if (err.code === "timeout") return "capture";
  return "generic";
}

function mapApiError(err: ApiError): {
  code: ProgressError;
  collision?: CollisionMember;
} {
  if (err.code === "fingerprint_collision") {
    const data = err.details as Record<string, unknown> | null;
    const id = data?.existing_member_id as string | undefined;
    const name = data?.existing_member_name as string | undefined;
    return {
      code: "collision",
      collision: id && name ? { id, name } : undefined,
    };
  }
  // Sidecar sentinels for matcher-unavailable / reader-unavailable share the
  // "reader" bucket — same operator action ("conecta el lector y reintenta").
  if (
    err.code === "biometric_unavailable" ||
    err.code === "reader_unavailable" ||
    err.status === 503
  ) {
    return { code: "reader" };
  }
  if (
    err.code === "quality_threshold" ||
    err.code === "no_finger_detected" ||
    err.code === "template_extract_failed"
  ) {
    return { code: "capture" };
  }
  return { code: "generic" };
}

interface EnrollResponse {
  fingerprint_ids: string[];
  member_id: string;
  quality_score?: number | null;
  count: number;
  registered_at: string;
  status: "success";
}

export function useRegisterFingerprint(
  memberId: string,
  opts: UseRegisterFingerprintOptions = {},
) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<FingerprintProgress>({
    status: "idle",
    captures_done: 0,
    captures_total: CAPTURES_TOTAL,
  });
  const abortRef = useRef<AbortController | null>(null);

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setProgress({ status: "idle", captures_done: 0, captures_total: CAPTURES_TOTAL });
  }, [cancel]);

  const start = useCallback(async () => {
    cancel();
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    // Capture the same finger CAPTURES_TOTAL times — each placement becomes
    // its own template (best-of-N matching at checkin). The operator lifts
    // and re-places between shots; the modal's progress dots cue them.
    const pngs: Uint8Array[] = [];
    for (let i = 0; i < CAPTURES_TOTAL; i++) {
      setProgress({
        status: "waiting",
        captures_done: i,
        captures_total: CAPTURES_TOTAL,
      });
      let png: Uint8Array;
      try {
        const result = await captureOnePng({ signal: ctrl.signal });
        // Reject low-quality captures at the door of enrollment so that
        // only well-formed templates are stored. sdkQuality === 0 means
        // the SDK didn't fire QualityReported (older driver) — let it through.
        if (result.sdkQuality > 0 && result.sdkQuality < ENROLL_QUALITY_FLOOR) {
          if (ctrl.signal.aborted) return;
          setProgress({
            status: "failed",
            captures_done: pngs.length,
            captures_total: CAPTURES_TOTAL,
            last_quality: result.sdkQuality,
            error: "capture",
          });
          opts.onError?.("capture");
          return;
        }
        png = result.png;
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const code =
          err instanceof BiometricError ? mapBioError(err) : "generic";
        setProgress({
          status: "failed",
          captures_done: pngs.length,
          captures_total: CAPTURES_TOTAL,
          error: code,
        });
        opts.onError?.(code);
        return;
      }
      if (ctrl.signal.aborted) return;
      pngs.push(png);
    }

    setProgress({
      status: "capturing",
      captures_done: CAPTURES_TOTAL,
      captures_total: CAPTURES_TOTAL,
    });

    // One atomic request with all CAPTURES_TOTAL images — the BE stores the
    // N templates in a single transaction (all or none).
    const form = new FormData();
    for (const png of pngs) {
      form.append(
        "image",
        new Blob([png], { type: "image/png" }),
        "fingerprint.png",
      );
    }
    form.append("member_id", memberId);
    form.append("consent_accepted", "true");

    try {
      await api.postFormData<EnrollResponse>("/api/v1/biometric/enroll", form);
      if (ctrl.signal.aborted) return;
      setProgress({
        status: "success",
        captures_done: CAPTURES_TOTAL,
        captures_total: CAPTURES_TOTAL,
      });
      qc.invalidateQueries({ queryKey: ["members"] });
      opts.onSuccess?.();
    } catch (err) {
      if (ctrl.signal.aborted) return;
      const mapped =
        err instanceof ApiError
          ? mapApiError(err)
          : { code: "generic" as ProgressError };
      setProgress({
        status: "failed",
        captures_done: 0,
        captures_total: CAPTURES_TOTAL,
        error: mapped.code,
        collisionMember: mapped.collision,
      });
      opts.onError?.(mapped.code);
    }
  }, [memberId, cancel, opts, qc]);

  useEffect(() => () => cancel(), [cancel]);

  return { progress, start, cancel, reset };
}

// ---------------------------------------------------------------------------
// Kiosk loop — feeds /api/v1/biometric/checkin one PNG per finger placement.
// ---------------------------------------------------------------------------

import type { CheckinEvent } from "./useCheckin";

interface UseBiometricCheckinLoopOptions {
  enabled: boolean;
  onAttempt?(): void;
  // onCheckin fires when the BE matched the fingerprint to a socio and
  // wrote a checkin row. The event is the real wire payload.
  onCheckin(event: CheckinEvent): void;
  // onNoMatch fires when the BE accepted the image but couldn't identify
  // anyone (UC-029 ErrNoFingerprintMatch / ErrFingerprintNotEnrolled).
  // No DB row was written; the page should show "no te identifiqué"
  // feedback without prepending anything to the recent list.
  onNoMatch?(): void;
  onError?(code: BiometricErrorCode): void;
  onReaderConnected?(): void;
  onReaderDisconnected?(): void;
}

/**
 * useBiometricCheckinLoop owns the JS SDK acquisition stream while the
 * kiosk page is mounted (and `enabled`). Each finger placement turns into
 * a POST /api/v1/biometric/checkin; the result is handed back via
 * onCheckin so the page can render feedback.
 *
 * Inflight requests are tracked with an AbortController so unmounting the
 * page cancels the request mid-flight without a leaked render.
 */
export function useBiometricCheckinLoop(opts: UseBiometricCheckinLoopOptions) {
  const optsRef = useRef(opts);
  optsRef.current = opts;
  // Serialise checkin requests so a fast double-tap doesn't race two POSTs
  // and produce two checkin rows. The SDK fires SamplesAcquired one at a
  // time, but the BE call takes 50-200ms — long enough for the operator to
  // re-place a finger if they're nervous.
  const inflightRef = useRef(false);

  useEffect(() => {
    if (!opts.enabled) return;
    let stream: CaptureStream | null = null;
    let cancelled = false;
    const aborts = new Set<AbortController>();

    (async () => {
      try {
        stream = await startCaptureStream({
          onSample: (png, _sdkQuality) => {
            if (cancelled || inflightRef.current) return;
            inflightRef.current = true;
            optsRef.current.onAttempt?.();
            const ctrl = new AbortController();
            aborts.add(ctrl);
            const form = new FormData();
            form.append(
              "image",
              new Blob([png], { type: "image/png" }),
              "fingerprint.png",
            );
            api
              .postFormData<CheckinEvent>("/api/v1/biometric/checkin", form)
              .then((ev) => {
                if (!cancelled) optsRef.current.onCheckin(ev);
              })
              .catch((err) => {
                if (cancelled) return;
                // Reader/matcher unavailable on the BE side (NBIS binaries
                // missing, GMK not seeded) is operational — surface via
                // onError so the page can hint. Anything else from the BE
                // (no-match, low quality, not-enrolled) is the "no te
                // identifiqué" case — the page should show denied
                // feedback without prepending a fake row.
                if (err instanceof ApiError && err.status === 503) {
                  optsRef.current.onError?.("sdk_error");
                  return;
                }
                if (err instanceof ApiError) {
                  optsRef.current.onNoMatch?.();
                  return;
                }
                optsRef.current.onError?.("sdk_error");
              })
              .finally(() => {
                aborts.delete(ctrl);
                inflightRef.current = false;
              });
          },
          onDeviceConnected: () => optsRef.current.onReaderConnected?.(),
          onDeviceDisconnected: () => optsRef.current.onReaderDisconnected?.(),
          onError: (err) => optsRef.current.onError?.(err.code),
        });
      } catch (err) {
        if (cancelled) return;
        if (err instanceof BiometricError) optsRef.current.onError?.(err.code);
        else optsRef.current.onError?.("sdk_error");
      }
    })();

    return () => {
      cancelled = true;
      aborts.forEach((c) => c.abort());
      stream?.stop().catch(() => undefined);
    };
  }, [opts.enabled]);
}
