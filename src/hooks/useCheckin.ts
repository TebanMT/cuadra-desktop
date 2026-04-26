import { useEffect, useRef, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

export type CheckinMethod = "fingerprint" | "pin" | "manual";
export type CheckinResult =
  | "allowed_active"
  | "allowed_expiring_soon"
  | "denied_expired"
  | "denied_inactive"
  | "denied_no_membership"
  | "denied_not_found";

export interface CheckinEvent {
  id: string;
  result: CheckinResult;
  method: CheckinMethod;
  member_id: string | null;
  member_name: string | null;
  expiry_date: string | null;
  days_until_expiry: number | null;
  manual_override: boolean;
  override_reason?: string | null;
  operator_name?: string | null;
  created_at: string;
}

export interface ManualCheckinInput {
  member_id: string;
}
export interface PinCheckinInput {
  pin: string;
}
export interface OverrideCheckinInput {
  member_id: string;
  reason: string;
  original_checkin_id?: string;
}

export function checkinErrorMessage(err: unknown, fallback: string): string {
  if (err instanceof ApiError) {
    const data = err.details as Record<string, unknown> | null;
    return (data?.exception as string | undefined) || err.message || fallback;
  }
  return fallback;
}

export function useCheckinManual() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ManualCheckinInput) =>
      api.post<CheckinEvent>("/api/v1/checkins/manual", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkins"] });
    },
  });
}

export function useCheckinByPin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: PinCheckinInput) =>
      api.post<CheckinEvent>("/api/v1/checkins/pin", input, { retry: 0 }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkins"] });
    },
  });
}

export function useOverrideCheckin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: OverrideCheckinInput) =>
      api.post<CheckinEvent>("/api/v1/checkins/override", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["checkins"] });
    },
  });
}

export type KioskEventKind =
  | "attempt_started"
  | "checkin_result"
  | "reader_connected"
  | "reader_disconnected";

export interface KioskEventEnvelope {
  kind: KioskEventKind;
  cursor: string;
  checkin?: CheckinEvent;
}

interface UseKioskEventsOptions {
  enabled?: boolean;
  onEvent(event: KioskEventEnvelope): void;
}

interface KioskPollResponse {
  events: KioskEventEnvelope[];
  cursor: string;
}

export function useKioskEvents({ enabled = true, onEvent }: UseKioskEventsOptions) {
  const cursorRef = useRef<string>("");
  const handlerRef = useRef(onEvent);
  handlerRef.current = onEvent;

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;

    async function loop() {
      while (!stopped) {
        try {
          const res = await api.get<KioskPollResponse>("/api/v1/kiosk/events", {
            query: { cursor: cursorRef.current || undefined, timeout_ms: 25000 },
            retry: 0,
          });
          if (stopped) return;
          cursorRef.current = res.cursor || cursorRef.current;
          for (const ev of res.events ?? []) handlerRef.current(ev);
        } catch {
          if (stopped) return;
          await new Promise((r) => setTimeout(r, 1500));
        }
      }
    }

    loop();
    return () => {
      stopped = true;
    };
  }, [enabled]);
}

interface CheckinCountResponse {
  count_today: number;
}

export function useCheckinCountToday(enabled = true) {
  return useQuery<CheckinCountResponse>({
    queryKey: ["checkins", "count-today"],
    queryFn: () => api.get<CheckinCountResponse>("/api/v1/checkins/count-today"),
    refetchInterval: 30_000,
    enabled,
    staleTime: 15_000,
  });
}

interface CheckinMethodsResponse {
  fingerprint_available: boolean;
  pin_available: boolean;
  manual_available: boolean;
}

export function useCheckinMethods(enabled = true) {
  return useQuery<CheckinMethodsResponse>({
    queryKey: ["checkins", "methods"],
    queryFn: () => api.get<CheckinMethodsResponse>("/api/v1/checkins/methods"),
    refetchInterval: 15_000,
    enabled,
    staleTime: 10_000,
  });
}

interface RecentCheckinsResponse {
  items: CheckinEvent[];
}

export function useRecentCheckins() {
  const qc = useQueryClient();
  const [items, setItems] = useState<CheckinEvent[]>([]);

  useEffect(() => {
    let cancelled = false;
    api
      .get<RecentCheckinsResponse>("/api/v1/checkins", { query: { limit: 5 }, retry: 0 })
      .then((res) => {
        if (cancelled) return;
        setItems(res.items ?? []);
      })
      .catch(() => {
        if (!cancelled) setItems([]);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function prepend(ev: CheckinEvent) {
    setItems((prev) => [ev, ...prev].slice(0, 5));
    qc.invalidateQueries({ queryKey: ["checkins"] });
  }

  return { items, prepend };
}

interface VerifyOperatorInput {
  password: string;
}

export function useVerifyOperatorPassword() {
  return useMutation({
    mutationFn: (input: VerifyOperatorInput) =>
      api.post<{ ok: true }>("/api/v1/auth/verify-password", input, { retry: 0 }),
  });
}
