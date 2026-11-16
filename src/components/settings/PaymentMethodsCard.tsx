import { useId } from "react";
import { Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { PAYMENT_METHOD_KEYS, type PaymentMethodKey } from "@/hooks/useGym";
import { settings } from "@/strings/settings";
import type { PaymentMethodSelection } from "./paymentMethods";

const t = settings.gymProfile.paymentMethods;

/**
 * Métodos de pago dentro del formulario de Datos del gym. Es una sección
 * controlada: la página guarda todo con un solo botón, aunque los métodos
 * viajen a su propio endpoint.
 */
export function PaymentMethodsCard({
  value,
  loadFailed,
  onRetry,
  onToggle,
  disabled,
}: {
  /** null mientras carga la configuración guardada. */
  value: PaymentMethodSelection | null;
  loadFailed: boolean;
  onRetry(): void;
  onToggle(key: PaymentMethodKey, checked: boolean): void;
  disabled: boolean;
}) {
  const baseId = useId();

  return (
    <Card>
      <CardContent className="pt-5 pb-5 space-y-4">
        <div className="space-y-1">
          <h2 className="text-base font-semibold">{t.title}</h2>
          <p className="text-sm text-muted-foreground">{t.body}</p>
        </div>
        {loadFailed && !value ? (
          <div className="space-y-3">
            <Alert variant="destructive">
              <AlertDescription>{t.loadError}</AlertDescription>
            </Alert>
            <Button type="button" variant="outline" onClick={onRetry}>
              {t.retry}
            </Button>
          </div>
        ) : !value ? (
          <p role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin motion-reduce:animate-none" />
            Consultando métodos de pago…
          </p>
        ) : (
          <div className="grid gap-3 sm:grid-cols-3">
            {PAYMENT_METHOD_KEYS.map((key) => (
              <div key={key} className="flex min-h-11 items-center gap-3 rounded-lg border p-4">
                <Checkbox
                  id={`${baseId}-${key}`}
                  checked={value[key]}
                  disabled={disabled}
                  onCheckedChange={(checked) => onToggle(key, checked === true)}
                />
                <Label htmlFor={`${baseId}-${key}`} className="text-base font-medium cursor-pointer">
                  {t.options[key]}
                </Label>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
