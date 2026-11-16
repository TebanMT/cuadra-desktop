import { useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCashDrawers } from "@/hooks/useCashDrawers";
import { useAuthStore } from "@/stores/useAuthStore";

// Per-device memory of whether this gym uses more than one drawer. It only
// decides what happens when the catalog cannot be read; never trusted over a
// fresh catalog.
const MULTIPLE_KEY = "tinta.cash-drawers.multiple";

function rememberMultiple(gymId: string | undefined, multiple: boolean) {
  if (!gymId) return;
  try { localStorage.setItem(`${MULTIPLE_KEY}:${gymId}`, multiple ? "1" : "0"); } catch { /* storage unavailable */ }
}

function knownMultiple(gymId: string | undefined) {
  if (!gymId) return false;
  try { return localStorage.getItem(`${MULTIPLE_KEY}:${gymId}`) === "1"; } catch { return false; }
}

interface CashDrawerFieldProps {
  value?: string;
  onChange(value: string): void;
  date?: string;
  disabled?: boolean;
  id?: string;
  hideHint?: boolean;
  onReadyChange?(ready: boolean): void;
}

/**
 * Selector progresivo de cajón. Un gym con una sola caja no ve ningún
 * concepto extra; cuando existen varias, toda operación cash exige atribuir el
 * evento físico a una. La API mantiene `main` como default para clientes viejos.
 *
 * Cobrar es la acción central de recepción: si el catálogo tarda o falla y
 * este gym no usa varias cajas, el movimiento va a la caja principal (sin
 * enviar cash_drawer_id) en lugar de bloquear el cobro.
 */
export function CashDrawerField({
  value,
  onChange,
  disabled,
  id = "cash-drawer",
  hideHint = false,
  onReadyChange,
}: CashDrawerFieldProps) {
  const catalog = useCashDrawers();
  const gymId = useAuthStore(s => s.gym?.gym_id);
  // A failed refetch keeps the last catalog: still good enough to choose from.
  const drawers = catalog.data ?? [];
  const known = drawers.length > 0;
  const multiple = known ? drawers.length > 1 : knownMultiple(gymId);
  // Without a catalog, only a gym known to use several drawers must wait.
  const mainFallback = !known && !multiple;
  const ready = mainFallback || (known && (value ? drawers.some(drawer => drawer.id === value) : drawers.length === 1));
  useEffect(() => { onReadyChange?.(ready); return () => onReadyChange?.(false); }, [ready, onReadyChange]);
  useEffect(() => { if (known) rememberMultiple(gymId, drawers.length > 1); }, [known, drawers.length, gymId]);
  const defaultDrawer = drawers.find((drawer) => drawer.is_main)?.id ?? drawers[0]?.id;

  useEffect(() => {
    if (!value && defaultDrawer) onChange(defaultDrawer);
  }, [defaultDrawer, onChange, value]);

  if (mainFallback) return null;
  if (!known && catalog.isLoading) return <p role="status" className="text-sm text-muted-foreground">Confirmando cajas disponibles…</p>;
  if (!known) return <div role="alert" className="space-y-2 text-sm"><p>No pudimos confirmar la caja para este movimiento.</p><Button type="button" variant="outline" size="sm" onClick={() => void catalog.refetch()}>Reintentar cajas</Button></div>;
  if (drawers.length === 1 && ready) return null;

  return (
    <div className="space-y-1">
      <Label htmlFor={id}>Caja física</Label>
      <Select
        value={value ?? defaultDrawer}
        onValueChange={onChange}
        disabled={disabled || catalog.isLoading}
      >
        <SelectTrigger id={id} aria-label="Caja física">
          <SelectValue placeholder="Selecciona una caja" />
        </SelectTrigger>
        <SelectContent>
          {drawers.map((drawer) => (
            <SelectItem key={drawer.id} value={drawer.id}>
              {drawer.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {!hideHint && <p className="text-xs text-muted-foreground">
        El movimiento aparecerá en el corte de esta caja.
      </p>}
    </div>
  );
}
