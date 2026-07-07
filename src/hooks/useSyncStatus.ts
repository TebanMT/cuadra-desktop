import { useEffect, useRef } from "react";
import { useMutation, useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { queryClient } from "@/lib/queryClient";

export type SyncLevel = "ok" | "syncing" | "warn" | "error" | "auth" | "stale" | "syncError";

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
    | "auth_invalid"
    // sync_error: el último fallo fue al APLICAR un cambio en esta laptop
    // (no de red — el servidor respondió). La UI lo muestra accionable
    // ("actualiza / reporta"), no como "Sin internet".
    | "sync_error"
    // schema_upgrade_required: el cloud devolvió 426 al sync (ADR-001
    // §3.8). El binario quedó atrás del wire protocol — la UI dispara
    // un modal bloqueante "Actualízala" en lugar de toast.
    | "schema_upgrade_required";
  // Field names mirror the backend wire shape
  // (cuadra-core/src/shared/sync/types.go::StatusResponse). Earlier they were
  // mistyped as last_sync_at / pending_count, which made the UI permanently
  // read undefined for "Nunca" and "0 pendientes" regardless of agent state.
  last_synced_at: string | null;
  // last_pulled_at avanza SÓLO cuando un pull aplicó cambios del cloud
  // (last_synced_at bumpea en cada ciclo exitoso aunque no haya traído
  // nada). Es la señal para invalidar queries: "hay datos nuevos abajo".
  last_pulled_at?: string | null;
  queue_pending_count: number;
  last_error: string | null;
  // auth_invalid surface también cuando el sidecar nunca recibió token
  // (waiting for auth). Desde el operador es el mismo problema:
  // hace falta autenticar.
  auth_invalid?: boolean;
  // schema_upgrade_required: redundante con state pero útil como flag
  // independiente (e.g. para deshabilitar acciones sin tocar el switch
  // del state principal).
  schema_upgrade_required?: boolean;
  // quarantined_count: cambios del servidor que no se pudieron aplicar y
  // el sync SALTÓ tras varios intentos, para no quedar atascado. >0
  // mantiene el estado en "sync_error" (no silencioso).
  quarantined_count?: number;
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

// useSyncPullRefresh — invalida el caché de react-query cuando el sync
// trajo cambios. Se monta UNA vez (App) y observa last_pulled_at del
// polling de /sync/status: si avanzó, un pull aplicó filas nuevas en el
// SQLite local (renovación hecha en otro device, cambios cloud-side, o el
// full-sync inicial que acaba de terminar) y TODO lo leído puede estar
// viejo. Sin esto, el dashboard mostraba datos pre-sync hasta que una
// mutación local casualmente invalidaba sus queries (bug del dogfood:
// "el sync fue exitoso pero el dashboard no se actualizó").
//
// invalidateQueries() sin filtro es deliberado: react-query sólo refetchea
// las queries ACTIVAS (las montadas en pantalla) — el resto se marca stale
// y se refetchea al montarse. Costo real: un puñado de requests al sidecar
// local por pull con cambios.
export function useSyncPullRefresh() {
  const status = useSyncStatus();
  const lastSeen = useRef<string | null | undefined>(undefined);
  const pulled = status.data?.last_pulled_at ?? null;
  useEffect(() => {
    if (status.data === undefined) return; // aún sin primer snapshot
    if (lastSeen.current === undefined) {
      // Primer snapshot tras montar: las queries recién nacieron, no hay
      // nada viejo que invalidar.
      lastSeen.current = pulled;
      return;
    }
    if (pulled && pulled !== lastSeen.current) {
      lastSeen.current = pulled;
      void queryClient.invalidateQueries();
    }
  }, [status.data, pulled]);
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
    case "sync_error":
      // Falla al guardar un cambio localmente (no de red). Tono propio
      // para NO decir "Sin internet" cuando sí hay.
      return "syncError";
    case "schema_upgrade_required":
      // Cliente desactualizado contra el cloud — el modal bloqueante
      // toma la pantalla, pero el indicador igual cambia de color para
      // que en la barra superior se note antes de abrirlo.
      return "stale";
    default:
      return "ok";
  }
}
