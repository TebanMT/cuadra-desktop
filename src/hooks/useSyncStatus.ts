import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type SyncLevel = "ok" | "warn" | "error";

export interface SyncStatus {
  state: "online" | "offline_short" | "offline_medium" | "offline_long" | "offline_critical";
  last_sync_at: string | null;
  pending_count: number;
  last_error: string | null;
}

export function useSyncStatus(enabled = true) {
  return useQuery<SyncStatus>({
    queryKey: ["sync", "status"],
    queryFn: () => api.get<SyncStatus>("/sync/status"),
    refetchInterval: 10_000,
    refetchIntervalInBackground: true,
    enabled,
  });
}

export function levelOf(status?: SyncStatus | null): SyncLevel {
  if (!status) return "ok";
  switch (status.state) {
    case "online":
    case "offline_short":
      return "ok";
    case "offline_medium":
    case "offline_long":
      return "warn";
    case "offline_critical":
      return "error";
    default:
      return "ok";
  }
}
