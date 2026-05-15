import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export type SyncLevel = "ok" | "syncing" | "warn" | "error" | "auth";

export interface SyncStatus {
  state:
    | "online"
    | "offline_short"
    | "offline_medium"
    | "offline_long"
    | "offline_critical"
    | "initial_syncing"
    // auth_invalid: el cloud rechazó la credencial sk_live_* del sidecar
    // (típicamente por revocación tras 30+ días de idle). La UI muestra
    // CTA de re-login en lugar de "Sin internet".
    | "auth_invalid";
  // Field names mirror the backend wire shape
  // (cuadra-core/src/shared/sync/types.go::StatusResponse). Earlier they were
  // mistyped as last_sync_at / pending_count, which made the UI permanently
  // read undefined for "Nunca" and "0 pendientes" regardless of agent state.
  last_synced_at: string | null;
  queue_pending_count: number;
  last_error: string | null;
  // auth_invalid surface también cuando el sidecar nunca recibió token
  // (waiting for auth). Desde el operador es el mismo problema:
  // hace falta autenticar.
  auth_invalid?: boolean;
}

export function useSyncStatus(enabled = true) {
  return useQuery<SyncStatus>({
    queryKey: ["sync", "status"],
    queryFn: () => api.get<SyncStatus>("/api/v1/sync/status"),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    enabled,
  });
}

// useTriggerSync nudges the sidecar agent to run an immediate sync cycle
// (push + pull) and refreshes the indicator afterwards. The endpoint is
// fire-and-forget on the backend (returns 202 immediately); the actual
// sync work happens on the agent's next tick which lands in the next
// status refresh.
export function useTriggerSync() {
  return useMutation({
    mutationFn: () => api.post<{ triggered: boolean }>("/api/v1/sync/trigger", {}),
    onSettled: () => {
      void queryClient.invalidateQueries({ queryKey: ["sync", "status"] });
    },
  });
}

export function levelOf(status?: SyncStatus | null): SyncLevel {
  if (!status) return "ok";
  switch (status.state) {
    case "online":
    case "offline_short":
      return "ok";
    case "initial_syncing":
      return "syncing";
    case "offline_medium":
    case "offline_long":
      return "warn";
    case "offline_critical":
      return "error";
    case "auth_invalid":
      // Tono propio: la credencial del sidecar está muerta y hace falta
      // re-login. Distinto de error genérico — la acción es clara.
      return "auth";
    default:
      return "ok";
  }
}
