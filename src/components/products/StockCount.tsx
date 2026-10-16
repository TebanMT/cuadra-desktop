import { validCount } from "./countValidation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Row = { id: string; name: string; stock: number; count_revision: string; quantity: string; changed?: boolean; unavailable?: boolean };
type Request = { id: string; reason: string; purchases_checked: boolean; lines: { product_id: string; revision: string; quantity: number }[] };
type Draft = { rows: Row[]; reason: string; checked: boolean; attempt: Request | null };
type Conflict = { product_id: string; name: string; stock: number; revision: string; available: boolean };


export function StockCountButton({ desktop = false }: { desktop?: boolean }) {
  const [open, setOpen] = useState(false);
  const gym = useAuthStore(s => s.gym?.gym_id);
  const user = useAuthStore(s => s.user?.user_id);
  return <><Button variant="outline" onClick={() => setOpen(true)}>Contar productos</Button>
    <Dialog open={open} onOpenChange={setOpen}><DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
      <DialogHeader><DialogTitle>Contar productos</DialogTitle><DialogDescription>Deja vacío lo que no contaste. Escribe 0 si no queda ninguna unidad.</DialogDescription></DialogHeader>
      {open && <StockCount key={`${gym}:${user}`} storageKey={`tinta:stock-count:v1:${gym}:${user}`} desktop={desktop} onClose={() => setOpen(false)} />}
    </DialogContent></Dialog></>;
}

function StockCount({ storageKey, desktop, onClose }: { storageKey: string; desktop: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const [draft, setDraft] = useState<Draft | null>(null);
  const latest = useRef<Draft | null>(null);
  const snapshot = useRef<string | null>(null);
  const locked = useRef(false);
  const [storageBlocked, setStorageBlocked] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [review, setReview] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  const [search, setSearch] = useState("");
  const persist = useCallback((next: Draft) => {
    try {
      if (localStorage.getItem(storageKey) !== snapshot.current) throw new Error("El conteo cambió en otra ventana. Cierra y vuelve a abrirlo.");
      const raw = JSON.stringify(next); localStorage.setItem(storageKey, raw); snapshot.current = raw;
      latest.current = next; setDraft(next); return true;
    } catch (e) { setStorageBlocked(true); setError(e instanceof Error ? e.message : "No se pudo guardar el borrador. Libera espacio y vuelve a abrirlo."); return false; }
  }, [storageKey]);
  useEffect(() => {
    let cancelled = false;
    async function load() {
      try {
        snapshot.current = localStorage.getItem(storageKey);
        if (snapshot.current) {
          const saved = JSON.parse(snapshot.current) as Draft;
          if (!Array.isArray(saved.rows)) throw new Error("No se pudo recuperar el conteo. Conserva el borrador y contacta a soporte.");
          latest.current = saved; setDraft(saved); setReview(!!saved.attempt); return;
        }
        const rows: Row[] = []; let page = 1;
        for (;;) {
          const data = await api.get<{ items: Omit<Row, "quantity">[]; total: number }>("/api/v1/products", { query: { page, page_size: 200, status: "active" } });
          rows.push(...data.items.map(p => ({ ...p, quantity: "" })));
          if (rows.length >= data.total || data.items.length === 0) break;
          page++;
        }
        if (!cancelled) persist({ rows, reason: "Conteo físico", checked: false, attempt: null });
      } catch (e) { if (!cancelled) setError(e instanceof Error ? e.message : "No se pudieron cargar los productos."); }
    }
    void load(); return () => { cancelled = true; };
  }, [storageKey, persist]); // The draft owns its snapshot; polling must never replace it.
  const edit = (change: (d: Draft) => Draft) => { if (latest.current && !locked.current && !latest.current.attempt && !storageBlocked) persist(change(latest.current)); };
  const selected = draft?.rows.filter(r => r.quantity !== "") ?? [];
  const invalid = selected.length === 0 || selected.length > 200 || selected.some(r => !validCount(r.quantity) || r.changed || r.unavailable);

  async function confirm() {
    const current = latest.current;
    if (!current || locked.current || storageBlocked) return;
    locked.current = true; setBusy(true); setError("");
    const request = current.attempt ?? { id: crypto.randomUUID(), reason: current.reason.trim(), purchases_checked: current.checked,
      lines: current.rows.filter(r => r.quantity !== "").map(r => ({ product_id: r.id, revision: r.count_revision, quantity: Number(r.quantity) })) };
    if (!persist({ ...current, attempt: request })) { locked.current = false; setBusy(false); return; }
    try {
      await api.post("/api/v1/product-counts", request, { retry: 2 });
      setConfirmed(true); void qc.invalidateQueries({ queryKey: ["products"] });
      // The persisted request is safe to repeat even if removing the draft fails.
      if (localStorage.getItem(storageKey) === snapshot.current) { localStorage.removeItem(storageKey); snapshot.current = null; }
    } catch (e) {
      if (e instanceof ApiError && [400, 409, 422].includes(e.status)) {
        const changes = (e.details as { data?: { items?: Conflict[] } })?.data?.items ?? [];
        persist({ ...current, attempt: null, rows: current.rows.map(row => {
          const c = changes.find(c => c.product_id === row.id);
          return c ? { ...row, stock: c.stock, count_revision: c.revision, changed: true, unavailable: !c.available } : row;
        }) });
        setReview(false);
        setError(changes.length ? "Hay productos que cambiaron. Revisa los señalados y cuenta sus unidades otra vez. No se guardó ningún ajuste." : e.message);
      } else { setError("Aún no confirmamos el resultado. Conservamos tu conteo. Pulsa Comprobar guardado para consultar el mismo intento."); }
    } finally { locked.current = false; setBusy(false); }
  }
  if (confirmed) return <div className="space-y-4"><p role="status" className="font-medium">Conteo confirmado{desktop ? " en esta computadora" : ""}.</p>
    <p className="text-sm text-muted-foreground">{desktop ? "Los ajustes quedaron guardados. Se compartirán con la nube cuando haya conexión; puedes revisar su avance en el estado de sincronización." : "Los ajustes quedaron guardados y llegarán a recepción cuando se conecte."}</p>
    <Button onClick={onClose}>Listo</Button></div>;
  const frozen = busy || !!draft?.attempt || storageBlocked;
  return <div className="space-y-4">
    <p className="text-sm text-muted-foreground">Antes de contar, registra las compras que ya llegaron en Productos → Compras, con su costo. Este conteo sólo corrige unidades.</p>
    <p className="text-xs text-muted-foreground">{desktop ? "Puedes contar sin internet. " : "Para guardar necesitas internet. "}Si hay una venta o compra mientras cuentas, revisaremos las diferencias. Los movimientos que lleguen después por sincronización se sumarán al resultado; vuelve a revisar si también cambiaron lo que contaste.</p>
    {error && <p role="alert" className="rounded-md border border-amber-500 p-3 text-sm">{error}</p>}
    {!draft ? <p role="status">{error ? "Cierra y vuelve a abrir para reintentar." : "Cargando productos…"}</p> : <>
      {draft.attempt && <p className="text-sm font-medium">Hay un guardado por confirmar. Comprueba su resultado antes de editar o iniciar otro conteo.</p>}
      {!review && <Input aria-label="Buscar en el conteo" placeholder="Buscar producto" value={search} onChange={e => setSearch(e.target.value)} />}
      <div className="overflow-auto max-h-[40vh] border rounded-md"><table className="w-full text-sm"><thead className="bg-muted"><tr><th className="p-3 text-left">Producto</th><th className="p-3">Registradas</th><th className="p-3">Contadas</th><th className="p-3">Diferencia</th></tr></thead>
        <tbody>{(review ? selected : draft.rows.filter(r => r.name.toLocaleLowerCase().includes(search.toLocaleLowerCase()))).map(row => <tr key={row.id} className="border-t">
          <td className="p-3"><span>{row.name}</span>{row.changed && <div className="mt-2 text-amber-700"><p>{row.unavailable ? "Ya no está disponible. Quítalo del conteo." : "Cambió durante el conteo. Cuenta otra vez."}</p>
            <Button size="sm" variant="outline" disabled={frozen} onClick={() => edit(d => ({ ...d, rows: d.rows.map(r => r.id === row.id ? row.unavailable ? { ...r, quantity: "", changed: false } : { ...r, changed: false } : r) }))}>{row.unavailable ? "Quitar del conteo" : "Ya volví a contar"}</Button></div>}</td>
          <td className="p-3 text-center tabular-nums">{row.stock}</td><td className="p-3 text-center">{review ? row.quantity : <Input className="w-28 mx-auto" inputMode="numeric" aria-label={`Contadas: ${row.name}`} placeholder="Sin contar" value={row.quantity} disabled={frozen || row.unavailable} onChange={e => edit(d => ({ ...d, checked: false, rows: d.rows.map(r => r.id === row.id ? { ...r, quantity: e.target.value } : r) }))} />}</td>
          <td className="p-3 text-center tabular-nums">{row.quantity === "" ? "—" : validCount(row.quantity) ? Number(row.quantity) - row.stock : "Revisa la cantidad"}</td>
        </tr>)}</tbody></table></div>
      <p className="text-xs text-muted-foreground">{selected.length} {selected.length === 1 ? "producto contado" : "productos contados"}. Los campos vacíos no cambian. Hasta 200 productos por conteo.</p>
      <label className="block text-sm">Motivo<Input disabled={frozen} value={draft.reason} maxLength={200} onChange={e => edit(d => ({ ...d, reason: e.target.value }))} /></label>
      <label className="flex gap-2 text-sm"><input type="checkbox" disabled={frozen} checked={draft.checked} onChange={e => edit(d => ({ ...d, checked: e.target.checked }))} />Ya registré las compras recibidas. Estas diferencias son del conteo.</label>
      <div className="flex flex-wrap justify-end gap-2">{!draft.attempt && <Button variant="ghost" disabled={busy || storageBlocked} onClick={() => {
          if (!window.confirm("¿Descartar este borrador? No cambiarán las existencias.")) return;
          try { if (localStorage.getItem(storageKey) !== snapshot.current) throw new Error(); localStorage.removeItem(storageKey); onClose(); }
          catch { setError("No pudimos quitar el borrador. Cierra y vuelve a abrirlo."); }
        }}>Descartar borrador</Button>}<Button variant="ghost" onClick={onClose}>Continuar después</Button>
        {draft.attempt ? <Button disabled={busy || storageBlocked} onClick={confirm}>{busy ? "Comprobando…" : "Comprobar guardado"}</Button> : review ? <><Button variant="outline" disabled={busy} onClick={() => setReview(false)}>Volver</Button><Button disabled={invalid || !draft.checked || frozen || draft.reason.trim().length < 3} onClick={confirm}>Confirmar conteo</Button></> : <Button disabled={invalid || !draft.checked || frozen || draft.reason.trim().length < 3} onClick={() => { setError(""); setReview(true); }}>Revisar diferencias</Button>}
      </div></>}
  </div>;
}
