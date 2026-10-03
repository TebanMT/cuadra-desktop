import { useEffect, useRef, useState } from "react";
import type { Product } from "@/hooks/useProducts";
import type { Promotion } from "@/hooks/usePromotions";
import type { MemberSearchResult, RegisterSaleInput } from "@/hooks/useSales";

export type CartLine = { product: Product; qty: number };
export type SaleAttempt = { request: RegisterSaleInput; received?: number };
export type SaleDraft = {
  version: 1; lines: CartLine[]; member: MemberSearchResult | null;
  promo: Promotion | null; attempt: SaleAttempt | null;
};
export const emptySaleDraft = (): SaleDraft => ({ version: 1, lines: [], member: null, promo: null, attempt: null });
export const moneyCents = (value: number) => Math.round((value + Number.EPSILON) * 100);
export function saleTotals(lines: CartLine[], promo: Promotion | null) {
  const subtotal = lines.reduce((n, l) => n + moneyCents(l.product.price) * l.qty, 0);
  const discount = !promo ? 0 : promo.kind === "percent"
    ? Math.round(subtotal * (promo.value ?? 0) / 100)
    : promo.kind === "fixed_amount" ? moneyCents(promo.value ?? 0) : 0;
  return { subtotal: subtotal / 100, discount: Math.min(subtotal, Math.max(0, discount)) / 100,
    total: Math.max(0, subtotal - Math.max(0, discount)) / 100 };
}
export function changedSaleProducts(lines: CartLine[], products: Product[]) {
  return lines.filter(line => {
    const current = products.find(p => p.id === line.product.id && p.active);
    return !current || moneyCents(current.price) !== moneyCents(line.product.price) || current.name !== line.product.name;
  });
}

// Persist before changing the UI or sending a sale. Compare snapshots so another
// window cannot overwrite an unconfirmed attempt with a fresh cart.
export function useSaleDraft(key: string) {
  const snapshot = useRef<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const failed = useRef(false);
  function read() {
    snapshot.current = localStorage.getItem(key);
    if (!snapshot.current) return emptySaleDraft();
    const saved = JSON.parse(snapshot.current) as SaleDraft;
    if (saved.version !== 1 || !Array.isArray(saved.lines) || saved.lines.some(l =>
      !l.product?.id || !l.product.name || !Number.isFinite(l.product.price) || l.product.price <= 0 ||
      !Number.isSafeInteger(l.qty) || l.qty <= 0) ||
      (saved.attempt && (!saved.attempt.request?.idempotency_key || !Array.isArray(saved.attempt.request.line_items)))) {
      throw new Error("invalid draft");
    }
    return saved;
  }
  const [draft, setDraft] = useState<SaleDraft>(() => {
    try { return read(); } catch { failed.current = true; return emptySaleDraft(); }
  });
  const latest = useRef(draft);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      if (event.key === key || event.key === null) {
        try { if (localStorage.getItem(key) !== snapshot.current) setConflict(true); }
        catch { setError("No se pudo leer la venta guardada."); }
      }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  function update(change: (current: SaleDraft) => SaleDraft) {
    if (failed.current || conflict) return false;
    try {
      if (localStorage.getItem(key) !== snapshot.current) { setConflict(true); return false; }
      const next = change(latest.current);
      const raw = JSON.stringify(next);
      localStorage.setItem(key, raw); snapshot.current = raw;
      latest.current = next; setDraft(next); setError(null); return true;
    } catch { setError("No se pudo guardar la venta en este dispositivo. Libera espacio e intenta de nuevo."); return false; }
  }
  function reload() {
    try { const next = read(); latest.current = next; setDraft(next); failed.current = false; setConflict(false); setError(null); }
    catch { setError("No se pudo recuperar la venta guardada."); }
  }
  return { draft, update, reload, blocked: conflict || failed.current,
    error: error || (conflict ? "La venta cambió en otra ventana. Recárgala para continuar." : failed.current ? "No se pudo recuperar la venta guardada." : null) };
}
