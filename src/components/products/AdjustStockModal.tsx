import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAdjustStock, type Product, type StockMovementType } from "@/hooks/useProducts";
import { ApiError } from "@/lib/api";
import { products as t } from "@/strings/products";

interface Props {
  product: Product | null;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function AdjustStockModal({ product, open, onOpenChange }: Props) {
  const adjust = useAdjustStock(product?.id ?? "");
  const [type, setType] = useState<StockMovementType>("restock");
  const [quantity, setQuantity] = useState("");
  const [newStock, setNewStock] = useState("");
  const [cost, setCost] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && product) {
      setType("restock");
      setQuantity("");
      setNewStock(String(product.stock));
      setCost("");
      setNotes("");
      setError(null);
    }
  }, [open, product]);

  const preview = useMemo(() => {
    if (!product) return null;
    if (type === "restock") {
      const q = parseInt(quantity, 10);
      if (!Number.isFinite(q) || q <= 0) return null;
      return product.stock + q;
    }
    if (type === "damage") {
      const q = parseInt(quantity, 10);
      if (!Number.isFinite(q) || q <= 0) return null;
      return Math.max(0, product.stock - q);
    }
    if (type === "count") {
      const n = parseInt(newStock, 10);
      if (!Number.isFinite(n) || n < 0) return null;
      return n;
    }
    return null;
  }, [type, quantity, newStock, product]);

  if (!product) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (type === "count") {
      const n = parseInt(newStock, 10);
      if (!Number.isFinite(n) || n < 0) {
        setError(t.adjustStock.errors.countInvalid);
        return;
      }
      try {
        await adjust.mutateAsync({
          movement_type: "count",
          new_stock: n,
          notes: notes.trim() || undefined,
        });
        toast.success(t.adjustStock.success);
        onOpenChange(false);
      } catch (err) {
        handleErr(err);
      }
      return;
    }

    const q = parseInt(quantity, 10);
    if (!Number.isFinite(q) || q <= 0) {
      setError(t.adjustStock.errors.quantityInvalid);
      return;
    }

    if (type === "damage" && q > product!.stock) {
      setError(t.adjustStock.errors.damageTooMuch(product!.stock));
      return;
    }

    const payload =
      type === "restock"
        ? {
            movement_type: "restock" as const,
            quantity: q,
            cost: cost ? parseFloat(cost) : undefined,
            notes: notes.trim() || undefined,
          }
        : {
            movement_type: "damage" as const,
            quantity: q,
            notes: notes.trim() || undefined,
          };

    try {
      await adjust.mutateAsync(payload);
      toast.success(t.adjustStock.success);
      onOpenChange(false);
    } catch (err) {
      handleErr(err);
    }
  }

  function handleErr(err: unknown) {
    if (err instanceof ApiError) {
      const data = err.details as Record<string, unknown> | null;
      setError((data?.exception as string | undefined) || t.adjustStock.errors.generic);
    } else {
      setError(t.adjustStock.errors.generic);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.adjustStock.title(product.name)}</DialogTitle>
          <p className="text-sm text-muted-foreground">{t.adjustStock.currentStock(product.stock)}</p>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>{t.adjustStock.question}</Label>
            <RadioGroup
              value={type}
              onValueChange={(v) => setType(v as StockMovementType)}
              className="space-y-1.5"
            >
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem value="restock" id="as-restock" className="mt-1" />
                <div>
                  <div className="font-medium text-sm">{t.adjustStock.types.restock}</div>
                  <div className="text-xs text-muted-foreground">{t.adjustStock.typeHints.restock}</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem value="damage" id="as-damage" className="mt-1" />
                <div>
                  <div className="font-medium text-sm">{t.adjustStock.types.damage}</div>
                  <div className="text-xs text-muted-foreground">{t.adjustStock.typeHints.damage}</div>
                </div>
              </label>
              <label className="flex items-start gap-2 cursor-pointer">
                <RadioGroupItem value="count" id="as-count" className="mt-1" />
                <div>
                  <div className="font-medium text-sm">{t.adjustStock.types.count}</div>
                  <div className="text-xs text-muted-foreground">{t.adjustStock.typeHints.count}</div>
                </div>
              </label>
            </RadioGroup>
          </div>

          {type === "count" ? (
            <div className="space-y-1">
              <Label htmlFor="as-new">{t.adjustStock.countLabel} *</Label>
              <Input
                id="as-new"
                type="number"
                inputMode="numeric"
                min={0}
                step={1}
                value={newStock}
                onChange={(e) => setNewStock(e.target.value)}
                autoFocus
              />
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="as-qty">{t.adjustStock.quantityLabel} *</Label>
                <Input
                  id="as-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  step={1}
                  value={quantity}
                  onChange={(e) => setQuantity(e.target.value)}
                  autoFocus
                />
              </div>
              {type === "restock" && (
                <div className="space-y-1">
                  <Label htmlFor="as-cost">{t.adjustStock.costLabel}</Label>
                  <Input
                    id="as-cost"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    step="0.01"
                    value={cost}
                    onChange={(e) => setCost(e.target.value)}
                  />
                </div>
              )}
            </div>
          )}

          <div className="space-y-1">
            <Label htmlFor="as-notes">{t.adjustStock.notesLabel}</Label>
            <Textarea
              id="as-notes"
              rows={2}
              value={notes}
              placeholder={t.adjustStock.notesPlaceholder}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>

          {preview !== null && (
            <p className="text-sm font-medium text-muted-foreground">
              {t.adjustStock.preview(preview)}
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={adjust.isPending}
            >
              {t.adjustStock.cancel}
            </Button>
            <Button type="submit" disabled={adjust.isPending}>
              {adjust.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.adjustStock.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
