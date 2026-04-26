import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

export interface BiometricStatus {
  available: boolean;
  reader: {
    model: string | null;
    vendor: string | null;
    connected: boolean;
  } | null;
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

export interface FingerprintProgress {
  status: "idle" | "waiting" | "capturing" | "success" | "failed";
  captures_done: number;
  captures_total: number;
  last_quality?: number;
  error?: string;
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
    if (READER_ERROR_CODES.has(err.code)) return "reader";
    if (CAPTURE_ERROR_CODES.has(err.code)) return "capture";
    const data = err.details as Record<string, unknown> | null;
    return (data?.exception as string | undefined) || err.message || fallback;
  }
  return fallback;
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
      let next: FingerprintProgress;
      try {
        next = await api.get<FingerprintProgress>(
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
      setProgress(next);

      if (next.status === "success") {
        qc.invalidateQueries({ queryKey: ["members"] });
        opts.onSuccess?.();
        return;
      }
      if (next.status === "failed") {
        const msg = next.error === "reader_disconnected" ? "reader" : "capture";
        opts.onError?.(msg);
        return;
      }
      await new Promise((r) => setTimeout(r, 500));
    }
  }

  useEffect(() => () => cancel(), []);

  return { progress, start, cancel, reset };
}
