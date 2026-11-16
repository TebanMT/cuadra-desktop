import { LockKeyhole } from "lucide-react";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";

// Aviso de la pantalla de entradas cuando la recepción está en solo lectura
// (prueba terminada, UC-002). Las entradas siguen; lo que espera al plan es
// cobrar y "Permitir de todos modos".
export function CheckinReadOnlyNotice() {
  return <Alert variant="warning" className="max-w-2xl">
    <LockKeyhole aria-hidden="true" className="h-4 w-4" />
    <AlertTitle>Recepción en solo lectura</AlertTitle>
    <AlertDescription>
      Tu prueba terminó. Sigues registrando entradas, pero no puedes cobrar ni dejar pasar a un socio vencido hasta que se active el plan.
    </AlertDescription>
  </Alert>;
}
