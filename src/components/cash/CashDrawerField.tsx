import { useEffect } from "react";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useCashDrawers } from "@/hooks/useCashDrawers";

interface CashDrawerFieldProps {
  value?: string;
  onChange(value: string): void;
  date?: string;
  disabled?: boolean;
  id?: string;
  hideHint?: boolean;
}

/**
 * Selector progresivo de cajón. Un gym con una sola caja no ve ningún
 * concepto extra; cuando existen varias, toda operación cash exige atribuir el
 * evento físico a una. La API mantiene `main` como default para clientes viejos.
 */
export function CashDrawerField({
  value,
  onChange,
  disabled,
  id = "cash-drawer",
  hideHint = false,
}: CashDrawerFieldProps) {
  const catalog = useCashDrawers();
  const drawers = catalog.data ?? [];
  const defaultDrawer = drawers.find((drawer) => drawer.is_main)?.id ?? drawers[0]?.id;

  useEffect(() => {
    if (!value && defaultDrawer) onChange(defaultDrawer);
  }, [defaultDrawer, onChange, value]);

  if (drawers.length <= 1) return null;

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
