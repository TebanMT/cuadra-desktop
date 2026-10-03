import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { useAdjustStock, type Product } from "@/hooks/useProducts";
import { keyForPayload } from "@/lib/idempotency";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

export function AdjustStockModal({ product, open, onOpenChange }: { product: Product | null; open: boolean; onOpenChange(open: boolean): void }) {
  const adjust = useAdjustStock(product?.id ?? "");
  const [type, setType] = useState<"count" | "damage">("count");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  useEffect(() => { if (open && product) { setType("count"); setQuantity(""); setReason(""); setError(null); attempt.current = null; } }, [open, product]);
  async function submit(e: React.FormEvent) {
    e.preventDefault(); setError(null);
    const n = Number(quantity);
    if (!quantity.trim() || !Number.isSafeInteger(n) || n < 0 || (type === "damage" && n === 0)) return setError("Escribe una cantidad válida.");
    if (type === "damage" && n > (product?.stock ?? 0)) return setError("Revisa el conteo antes de registrar esta pérdida.");
    if (!reason.trim()) return setError("Escribe el motivo del ajuste.");
    const payload = type === "count" ? { movement_type: "count" as const, new_stock: n, notes: reason.trim() } : { movement_type: "damage" as const, quantity: n, notes: reason.trim() };
    attempt.current = keyForPayload(attempt.current, payload);
    try { await adjust.mutateAsync({ ...payload, idempotency_key: attempt.current.key }); toast.success("Existencias actualizadas."); attempt.current = null; onOpenChange(false); }
    catch (err) { setError(err instanceof Error ? err.message : "No se pudo guardar el ajuste."); }
  }
  return <Dialog open={open && !!product} onOpenChange={value => { if (!adjust.isPending) onOpenChange(value); }}><DialogContent><DialogHeader><DialogTitle>Ajustar existencias</DialogTitle><DialogDescription>{product?.name} · {product?.stock} registradas</DialogDescription></DialogHeader><form onSubmit={submit} className="space-y-4">
    <label className="block text-sm">Qué necesitas corregir<select className="h-10 w-full rounded-md border bg-background px-3" value={type} onChange={e => { setType(e.target.value as typeof type); setQuantity(""); }}><option value="count">Corregir conteo</option><option value="damage">Registrar pérdida o daño</option></select></label>
    <label className="block text-sm">{type === "count" ? "Cuántas unidades tienes realmente" : "Cuántas unidades se perdieron"}<Input type="number" min={type === "count" ? 0 : 1} step="1" value={quantity} onChange={e => setQuantity(e.target.value)} autoFocus /></label>
    <label className="block text-sm">Motivo<Input value={reason} maxLength={200} onChange={e => setReason(e.target.value)} placeholder="Ej. diferencia al contar" /></label>
    {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
    <div className="flex justify-end gap-2"><Button type="button" variant="outline" disabled={adjust.isPending} onClick={() => onOpenChange(false)}>Cancelar</Button><Button disabled={adjust.isPending} type="submit">Guardar ajuste</Button></div>
  </form></DialogContent></Dialog>;
}
