import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

// El sidecar (GET /api/v1/biometric/status) responde flat:
//   { device_id, vendor, model, connected, available }
// Donde `connected` = USB plugado, `available` = listo para capturar.
// Para "ofrecer la opción huella" usamos `connected` (más permisivo).
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

export interface CollisionMember {
  id: string;
  name: string;
}

export interface FingerprintProgress {
  status: "idle" | "waiting" | "capturing" | "success" | "failed";
  captures_done: number;
  captures_total: number;
  last_quality?: number;
  error?: string;
  // Populated only when error === "collision" — the existing member whose
  // template matched the new capture (UC-028 §collision-detection).
  collisionMember?: CollisionMember;
}

interface ProgressResponse extends FingerprintProgress {
  existing_member_id?: string;
  existing_member_name?: string;
}

interface StartResponse {
  session_id: string;
  captures_total: number;
}

interface UseRegisterFingerprintOptions {
  onSuccess?(): void;
  onError?(message: string): void;
}

const READER_ERROR_CODES = new Set(["reader_disconnected", "reader_unavailable", "biometric_unavailable"]);
const CAPTURE_ERROR_CODES = new Set(["capture_failed", "low_quality", "timeout"]);

function messageFromError(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    if (err.code === "fingerprint_collision") return "collision";
    if (READER_ERROR_CODES.has(err.code)) return "reader";
    if (CAPTURE_ERROR_CODES.has(err.code)) return "capture";
    const data = err.details as Record<string, unknown> | null;
    return (data?.exception as string | undefined) || err.message || fallback;
  }
  return fallback;
}

function readCollision(p: ProgressResponse): CollisionMember | undefined {
  if (p.existing_member_id && p.existing_member_name) {
    return { id: p.existing_member_id, name: p.existing_member_name };
  }
  return undefined;
}

export function useRegisterFingerprint(memberId: string, opts: UseRegisterFingerprintOptions = {}) {
  const qc = useQueryClient();
  const [progress, setProgress] = useState<FingerprintProgress>({
    status: "idle",
    captures_done: 0,
    captures_total: 3,
  });
  const abortRef = useRef<AbortController | null>(null);
  const sessionRef = useRef<string | null>(null);

  function cancel() {
    abortRef.current?.abort();
    abortRef.current = null;
    sessionRef.current = null;
  }

  function reset() {
    cancel();
    setProgress({ status: "idle", captures_done: 0, captures_total: 3 });
  }

  async function start() {
    cancel();
    setProgress({ status: "waiting", captures_done: 0, captures_total: 3 });
    const ctrl = new AbortController();
    abortRef.current = ctrl;

    let session: StartResponse;
    try {
      session = await api.post<StartResponse>(`/api/v1/members/${memberId}/fingerprint/start`, {});
    } catch (err) {
      const code = messageFromError(err, "");
      const msg =
        code === "reader" ? "reader" : code === "capture" ? "capture" : "generic";
      setProgress({ status: "failed", captures_done: 0, captures_total: 3, error: msg });
      opts.onError?.(msg);
      return;
    }
    sessionRef.current = session.session_id;
    setProgress((p) => ({ ...p, captures_total: session.captures_total ?? 3 }));

    while (!ctrl.signal.aborted) {
      let next: ProgressResponse;
      try {
        next = await api.get<ProgressResponse>(
          `/api/v1/members/${memberId}/fingerprint/progress`,
          { query: { session_id: session.session_id }, retry: 0 }
        );
      } catch (err) {
        if (ctrl.signal.aborted) return;
        const code = messageFromError(err, "");
        const msg = code === "reader" ? "reader" : "generic";
        setProgress({ status: "failed", captures_done: 0, captures_total: 3, error: msg });
        opts.onError?.(msg);
        return;
      }
      if (ctrl.signal.aborted) return;
      const collisionMember = readCollision(next);
      const normalized: FingerprintProgress = {
        status: next.status,
        captures_done: next.captures_done,
        captures_total: next.captures_total,
        last_quality: next.last_quality,
        error: next.error,
        collisionMember,
      };
      setProgress(normalized);

      if (next.status === "success") {
        qc.invalidateQueries({ queryKey: ["members"] });
        opts.onSuccess?.();
        return;
      }
      if (next.status === "failed") {
        const msg =
          next.error === "collision"
            ? "collision"
            : next.error === "reader_disconnected"
            ? "reader"
            : "capture";
        opts.onError?.(msg);
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  useEffect(() => () => cancel(), []);

  return { progress, start, cancel, reset };
}
