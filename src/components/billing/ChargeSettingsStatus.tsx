import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import type { GymChargeSettings } from "@/hooks/useGymChargeSettings";

import { chargeSettingsReady } from "@/lib/chargeSettingsReadiness";

export function ChargeSettingsStatus({ query }: { query: {
  data?: GymChargeSettings | null;
  isError?: boolean;
  isFetching?: boolean;
  refetch(): unknown;
} }) {
  if (chargeSettingsReady(query.data)) return null;
  if (!query.isError) return <p role="status" className="text-sm text-muted-foreground">Consultando cuotas del gimnasio… El total estará disponible al terminar.</p>;
  return <Alert variant="destructive"><AlertDescription>
    No se pudieron consultar las cuotas. El total aún no está confirmado.
    <Button type="button" variant="link" disabled={query.isFetching} onClick={() => void query.refetch()}>
      {query.isFetching ? "Consultando…" : "Reintentar cuotas"}
    </Button>
  </AlertDescription></Alert>;
}
