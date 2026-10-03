import { useEffect, useRef, useState } from "react";
import { createIdempotencyKey } from "@/lib/idempotency";
import { todayIso } from "@/lib/dates";

export type PurchaseProduct = { id: string; name: string };
export type PurchaseLine = PurchaseProduct & { quantity: string; cost: string; newProduct?: { price: string } };
export type PurchaseRequest = {
  id: string;
  items: { product_id: string; quantity: number; unit_cost: number; new_product?: { name: string; price: number } }[];
  received: boolean; paid: boolean; paid_on?: string; payment_method?: string; paid_from?: string; cash_drawer_id?: string;
};
export type PurchaseDraft = {
  version: 1; id: string; lines: PurchaseLine[]; received: boolean; paid: boolean;
  day: string; method: string; source: string; drawer?: string;
  search: string; newProduct: { name: string; price: string } | null;
  attempt: PurchaseRequest | null;
};
export function emptyPurchaseDraft(desktop: boolean): PurchaseDraft {
  return { version: 1, id: createIdempotencyKey(), lines: [], received: desktop, paid: false,
    day: todayIso(), method: "transfer", source: "", search: "", newProduct: null, attempt: null };
}

// One local draft per gym and user. Compare before writing as well as listening
// for storage events, so two tabs cannot silently overwrite a pending payment.
export function usePurchaseDraft(key: string, legacyKey: string, desktop: boolean) {
  const snapshot = useRef<string | null>(null);
  const loadFailed = useRef(false);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);
  const read = (): PurchaseDraft => {
    snapshot.current = localStorage.getItem(key);
    if (snapshot.current) {
      const saved = JSON.parse(snapshot.current) as PurchaseDraft;
      if (saved.version !== 1 || !saved.id || !Array.isArray(saved.lines)) throw new Error("invalid draft");
      return saved;
    }
    // Preserve unconfirmed submissions left by the former purchase dialog.
    const legacy = JSON.parse(sessionStorage.getItem(legacyKey) || "null");
    const fresh = emptyPurchaseDraft(desktop);
    if (legacy?.request?.id && Array.isArray(legacy.lines)) {
      const request = legacy.request as PurchaseRequest;
      const migrated = { ...fresh, id: request.id, lines: legacy.lines, received: request.received, paid: request.paid,
        day: request.paid_on || fresh.day, method: request.payment_method || fresh.method,
        source: request.paid_from || "", drawer: request.cash_drawer_id, attempt: request };
      const raw = JSON.stringify(migrated);
      localStorage.setItem(key, raw); snapshot.current = raw; sessionStorage.removeItem(legacyKey);
      return migrated;
    }
    return fresh;
  };
  const [draft, setDraft] = useState<PurchaseDraft>(() => {
    try { return read(); } catch { loadFailed.current = true; return emptyPurchaseDraft(desktop); }
  });
  const latest = useRef(draft);
  useEffect(() => {
    const changed = (event: StorageEvent) => {
      try {
        if ((event.key === key || event.key === null) && localStorage.getItem(key) !== snapshot.current) setConflict(true);
      } catch { setStorageError("No se pudo leer el borrador de este dispositivo."); }
    };
    window.addEventListener("storage", changed);
    return () => window.removeEventListener("storage", changed);
  }, [key]);
  function update(change: (current: PurchaseDraft) => PurchaseDraft): boolean {
    if (loadFailed.current) return false;
    try {
      if (localStorage.getItem(key) !== snapshot.current) { setConflict(true); return false; }
      const next = change(latest.current);
      const raw = JSON.stringify(next);
      localStorage.setItem(key, raw); snapshot.current = raw;
      latest.current = next; setDraft(next); setStorageError(null);
      return true;
    } catch {
      setStorageError("No se pudo guardar el borrador en este dispositivo. Libera espacio e intenta de nuevo.");
      return false;
    }
  }
  function clear(): boolean {
    try {
      if (localStorage.getItem(key) !== snapshot.current) { setConflict(true); return false; }
      localStorage.removeItem(key); snapshot.current = null; setStorageError(null);
      return true;
    } catch { setStorageError("No se pudo quitar el borrador de este dispositivo."); return false; }
  }
  function reload() {
    try { const saved = read(); loadFailed.current = false; latest.current = saved; setDraft(saved); setConflict(false); setStorageError(null); }
    catch { setStorageError("No se pudo recuperar el borrador de este dispositivo."); }
  }
  return { draft, update, clear, reload, conflict, blocked: conflict || loadFailed.current,
    storageError: storageError || (loadFailed.current ? "No se pudo recuperar el borrador. Intenta recargar la página." : null) };
}
