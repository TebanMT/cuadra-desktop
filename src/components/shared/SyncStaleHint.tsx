import { AlertTriangle } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSyncStatus } from "@/hooks/useSyncStatus";

// Aviso preventivo para los diálogos de captura de catálogo (planes y
// productos). La validación de "nombre duplicado" corre contra lo que ESTA
// laptop ya tiene en su SQLite: si el equipo lleva rato sin sincronizar,
// otro device pudo crear un registro con el mismo nombre y el choque va a
// aparecer DESPUÉS, al subir (rechazo por duplicado en la nube). El hint
// avisa exactamente en esa ventana — con sync fresco no molesta.
//
// Umbral: 15 min sin ciclo exitoso. El agente tickea cada 30s, así que un
// equipo sano nunca lo ve; uno offline lo ve de inmediato tras el umbral.
export const STALE_AFTER_MS = 15 * 60 * 1000;

// isSyncStale — pura para test: null/ausente cuenta como stale (equipo que
// nunca ha sincronizado es exactamente el caso de riesgo).
export function isSyncStale(lastSyncedAt: string | null | undefined, nowMs: number): boolean {
  if (!lastSyncedAt) return true;
  return nowMs - new Date(lastSyncedAt).getTime() > STALE_AFTER_MS;
}

export function SyncStaleHint({ noun }: { noun: string }) {
  const { data } = useSyncStatus();
  if (!data) return null;
  const lastMs = data.last_synced_at ? new Date(data.last_synced_at).getTime() : null;
  if (!isSyncStale(data.last_synced_at, Date.now())) return null;
  const since =
    lastMs === null
      ? "Este equipo aún no sincroniza con la nube."
      : `Este equipo lleva ${formatDistanceToNow(new Date(lastMs), { locale: es })} sin sincronizar con la nube.`;
  return (
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription>
        {since} Si en otro equipo crearon {noun} con el mismo nombre, el choque se detectará
        hasta sincronizar — usa un nombre distintivo o sincroniza primero.
      </AlertDescription>
    </Alert>
  );
}
