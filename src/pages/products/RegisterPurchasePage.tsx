import { validateDateFields } from "@/lib/date-input";
import { DateInput } from "@/components/ui/date-input";
import { useEffect, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ArrowLeft, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { createIdempotencyKey } from "@/lib/idempotency";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDebounce } from "@/hooks/useDebounce";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CashDrawerField } from "@/components/cash/CashDrawerField";
import { emptyPurchaseDraft, usePurchaseDraft, type PurchaseLine, type PurchaseProduct, type PurchaseRequest } from "@/components/products/purchaseDraft";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

const isDesktop = true;
const money = (n: number) => new Intl.NumberFormat("es-MX", { style: "currency", currency: "MXN" }).format(n);
const validMoney = (value: string) => /^\d+(\.\d{1,2})?$/.test(value) && Number(value) > 0 && Number(value) <= 99999999.99;
const subtotal = (line: PurchaseLine) => Math.round(Number(line.cost) * 100) * Number(line.quantity) / 100;

type PurchasePayment = "pending" | "paid";

type Entry = { returnTo?: string; initialProduct?: PurchaseProduct };
export default function RegisterPurchasePage() {
  const gymID = useAuthStore(s => s.gym?.gym_id);
  const userID = useAuthStore(s => s.user?.user_id);
  if (!gymID || !userID) return null;
  return <PurchasePage key={`${gymID}:${userID}`} storageKey={`tinta:purchase-draft:${gymID}:${userID}`} legacyKey={`tinta:pending-purchase:${gymID}`} />;
}
function PurchasePage({ storageKey, legacyKey }: { storageKey: string; legacyKey: string }) {
  const role = useAuthStore(s => s.user?.role);
  const owner = role === "owner";
  const canPayFromCash = owner || (isDesktop && role === "operator");
  const navigate = useNavigate();
  const location = useLocation();
  const entry = (location.state || {}) as Entry;
  const returnTo = entry.returnTo && /^\/(products|expenses)(\?|$)/.test(entry.returnTo) && (owner || !entry.returnTo.startsWith("/expenses")) ? entry.returnTo : "/products?view=purchases";
  const { draft, update, clear, reload, conflict, blocked, storageError } = usePurchaseDraft(storageKey, legacyKey, isDesktop);
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [discarding, setDiscarding] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);
  const initialAdded = useRef(false);
  const sending = useRef(false);
  const mounted = useRef(true);
  useEffect(() => { mounted.current = true; return () => { mounted.current = false; }; }, []);
  const cache = useQueryClient();
  const query = useDebounce(draft.search, 250);
  const products = useQuery({
    queryKey: ["products", "purchase-form", query],
    queryFn: () => api.get<{ items: PurchaseProduct[]; total: number }>("/api/v1/products", { query: { q: query, status: "active", page: 1, page_size: 50 } }),
  });
  const save = useMutation({ mutationFn: (payload: PurchaseRequest) => api.post("/api/v1/inventory-purchase-registrations", payload) });
  const locked = save.isPending || !!draft.attempt || blocked;
  const hasDraft = draft.lines.length > 0 || !!draft.newProduct || !!draft.search || draft.paid;
  const searching = query !== draft.search || products.isLoading;
  const available = products.data?.items.filter(p => !draft.lines.some(l => l.id === p.id)) || [];
  const total = draft.lines.reduce((sum, line) => sum + Math.round(subtotal(line) * 100), 0) / 100;
  const payment: PurchasePayment = draft.paid ? "paid" : "pending";
  function choosePayment(value: PurchasePayment) {
    if (locked || (value === "paid" && !canPayFromCash)) return;
    update(d => ({ ...d, paid: value === "paid",
      method: value === "paid" && !owner ? "cash" : d.source === "cash_drawer" ? "transfer" : d.method,
      source: value === "paid" && !owner ? "cash_drawer" : "",
      drawer: undefined,
    }));
    setFieldErrors(current => { const next = { ...current }; delete next.payment; delete next.source; delete next.day; return next; });
  }
  function chooseSource(source: string) {
    if (locked || !owner) return;
    update(d => ({ ...d, source,
      method: source === "cash_drawer" ? "cash" : d.source === "cash_drawer" ? "transfer" : d.method,
      drawer: source === "cash_drawer" ? d.drawer : undefined,
    }));
    setFieldErrors(current => { const next = { ...current }; delete next.payment; delete next.source; return next; });
  }
  function focusQuantity(id: string) { requestAnimationFrame(() => document.getElementById(`quantity-${id}`)?.focus()); }
  function addProduct(product: PurchaseProduct) {
    if (locked || draft.lines.length >= 100) return;
    if (update(d => ({ ...d, lines: [...d.lines, { ...product, quantity: "1", cost: "" }], search: "" }))) {
      setPicking(false); setFieldErrors({}); focusQuantity(product.id);
    }
  }
  useEffect(() => {
    if (initialAdded.current) return;
    initialAdded.current = true;
    const product = entry.initialProduct;
    if (product?.id && product.name && !draft.attempt && !draft.lines.some(line => line.id === product.id)) addProduct(product);
    // Navigation data is consumed once; returning never replaces an existing draft.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  function updateLine(id: string, field: "quantity" | "cost" | "name" | "price", value: string) {
    update(d => ({ ...d, lines: d.lines.map(l => l.id !== id ? l : field === "price" ? { ...l, newProduct: { price: value } } : { ...l, [field]: value }) }));
    setFieldErrors(current => { const next = { ...current }; delete next[`${id}:${field}`]; return next; });
  }
  function startNewProduct() {
    if (update(d => ({ ...d, newProduct: { name: d.search.trim(), price: "" } }))) {
      setPicking(false); setFieldErrors({});
      requestAnimationFrame(() => document.getElementById("new-product-name")?.focus());
    }
  }
  function addNewProduct() {
    if (!draft.newProduct || locked) return;
    const name = draft.newProduct.name.trim();
    const problems: Record<string, string> = {};
    if (name.length < 2 || name.length > 100) problems.newName = "Escribe un nombre de 2 a 100 caracteres.";
    if (!validMoney(draft.newProduct.price)) problems.newPrice = "Escribe el precio de venta, con hasta dos decimales.";
    if ([...draft.lines, ...(products.data?.items || [])].some(p => p.name.trim().toLocaleLowerCase() === name.toLocaleLowerCase())) problems.newName = "Ya hay un producto con este nombre. Agrégalo desde el buscador.";
    if (Object.keys(problems).length) { setFieldErrors(problems); return; }
    const id = createIdempotencyKey();
    if (update(d => ({ ...d, lines: [...d.lines, { id, name, quantity: "1", cost: "", newProduct: { price: d.newProduct!.price } }], newProduct: null, search: "" }))) {
      setFieldErrors({}); focusQuantity(id);
    }
  }
  function validate(): boolean {
    const problems: Record<string, string> = {};
    if (!draft.lines.length) problems.products = "Agrega al menos un producto.";
    for (const line of draft.lines) {
      if (!Number.isInteger(Number(line.quantity)) || Number(line.quantity) <= 0 || Number(line.quantity) > 2147483647) problems[`${line.id}:quantity`] = "Escribe una cantidad entera mayor a cero.";
      if (!validMoney(line.cost)) problems[`${line.id}:cost`] = "Escribe el costo por unidad, con hasta dos decimales.";
      if (line.newProduct) {
        if (line.name.trim().length < 2 || line.name.trim().length > 100) problems[`${line.id}:name`] = "Escribe un nombre de 2 a 100 caracteres.";
        if (!validMoney(line.newProduct.price)) problems[`${line.id}:price`] = "Escribe el precio de venta, con hasta dos decimales.";
      }
    }
    if (draft.paid) {
      if (!canPayFromCash) problems.payment = "Solo el dueño puede registrar pagos desde la web.";
      else if (draft.source !== "cash_drawer" && !owner) problems.payment = "En recepción puedes pagar con dinero de caja o dejar el pago pendiente.";
      if (draft.source === "cash_drawer" && draft.method !== "cash") problems.payment = "Vuelve a seleccionar el pago con dinero de caja.";
      if (!draft.source) problems.source = "Selecciona de dónde salió el dinero.";
      if (!draft.day || draft.day > todayIso()) problems.day = "Revisa la fecha del pago.";
    }
    setFieldErrors(problems);
    if (Object.keys(problems).length) requestAnimationFrame(() => document.querySelector<HTMLElement>('[aria-invalid="true"]')?.focus());
    return !Object.keys(problems).length;
  }
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (sending.current || blocked) return;
    setError(null);
    const retry = !!draft.attempt;
    if (!retry && !validate()) return;
    if (!retry && draft.newProduct) { setError("Agrega el producto nuevo a la compra o cancela su captura."); return; }
    const request = draft.attempt || {
      id: draft.id, items: draft.lines.map(line => ({ product_id: line.id, quantity: Number(line.quantity), unit_cost: Number(line.cost),
        ...(line.newProduct ? { new_product: { name: line.name.trim(), price: Number(line.newProduct.price) } } : {}) })),
      received: draft.received, paid: draft.paid,
      ...(draft.paid ? { paid_on: draft.day, payment_method: draft.method, paid_from: draft.source, ...(draft.source === "cash_drawer" ? { cash_drawer_id: draft.drawer } : {}) } : {}),
    };
    // Persist the exact request before sending it. The same UUID survives reloads,
    // retries and crashes, including products that do not exist in the catalog yet.
    if (!update(d => ({ ...d, attempt: request }))) return;
    sending.current = true;
    try {
      await save.mutateAsync(request);
      clear();
      for (const key of ["inventory-purchases", "inventory-purchase-deliveries", "products", "product", "stock-movements", "expenses", "cash-movements", "cash-close", "reports", "dashboard", "analytics"]) void cache.invalidateQueries({ queryKey: [key] });
      toast.success("Compra registrada."); if (mounted.current) navigate(returnTo, { replace: true });
    } catch (err) {
      const status = (err as { status?: number }).status;
      const definitive = !retry && status !== undefined && status >= 400 && status < 500 && status !== 408;
      if (definitive) update(d => ({ ...d, attempt: null }));
      setError(definitive && err instanceof Error ? err.message : "No pudimos confirmar la compra. Vuelve a intentar para confirmar el registro.");
    } finally { sending.current = false; }
  }
  function fieldError(key: string) { return fieldErrors[key] ? <p id={`error-${key}`} className="text-xs text-destructive mt-1">{fieldErrors[key]}</p> : null; }
  const invalid = (key: string) => ({ "aria-invalid": !!fieldErrors[key], "aria-describedby": fieldErrors[key] ? `error-${key}` : undefined });
  return <div className="mx-auto max-w-5xl p-4 sm:p-6 pb-32 sm:pb-32">
    <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-2"><Button type="button" variant="ghost" size="icon" aria-label="Volver" onClick={() => navigate(returnTo)}><ArrowLeft /></Button><h1 className="text-xl sm:text-2xl font-semibold">Registrar compra</h1></div>
      {hasDraft && !draft.attempt && !conflict && <span role="status" className="text-xs text-muted-foreground">Borrador guardado en este dispositivo</span>}
    </div>
    {conflict && <div role="alert" className="mb-4 rounded-lg border p-4 text-sm">Esta compra cambió en otra pestaña. Carga el borrador actual para continuar. <Button variant="link" onClick={reload}>Cargar borrador</Button></div>}
    {storageError && <p role="alert" className="mb-4 text-sm text-destructive">{storageError}</p>}
    <form onSubmitCapture={validateDateFields} onSubmit={submit} noValidate className="space-y-6">
      <fieldset disabled={locked} className="min-w-0 space-y-6">
        <section aria-label="Productos de la compra" className="rounded-xl border bg-card">
          <div className="p-4 sm:p-5 border-b space-y-3">
            <h2 className="font-semibold">Productos</h2>
            <div className="flex flex-wrap gap-2">
              <Input ref={searchRef} className="flex-1 min-w-40" aria-label="Buscar producto" {...invalid("products")} placeholder={draft.lines.length ? "Agregar otro producto" : "Buscar producto"} value={draft.search} onFocus={() => setPicking(true)} onChange={e => { update(d => ({ ...d, search: e.target.value })); setPicking(true); }} onKeyDown={e => {
                if (e.key === "Enter") { e.preventDefault(); if (!searching && !products.isError && available.length === 1) addProduct(available[0]); }
              }} />
              <Button type="button" variant="outline" disabled={!!draft.newProduct || draft.lines.length >= 100} onClick={startNewProduct}><Plus />Nuevo producto</Button>
            </div>
            {fieldError("products")}
            {(picking || (!draft.newProduct && (draft.search.trim() || !draft.lines.length))) && <div className="max-h-52 overflow-y-auto">
              {searching ? <p role="status" className="py-2 text-sm text-muted-foreground">Buscando productos…</p> : products.isError ? <p role="alert" className="text-sm">No se pudieron cargar los productos. <Button type="button" variant="link" onClick={() => products.refetch()}>Reintentar</Button></p> : <>
                {available.map(p => <button type="button" key={p.id} disabled={draft.lines.length >= 100} className="w-full flex items-center gap-2 rounded-md px-2 py-2.5 text-left text-sm hover:bg-muted disabled:opacity-50" onClick={() => addProduct(p)}><Plus className="h-4 w-4 shrink-0" />{p.name}</button>)}
                {!available.length && <p className="py-2 text-sm text-muted-foreground">{draft.search.trim() ? "No encontramos otro producto con ese nombre." : draft.lines.length ? "Los productos de esta lista ya están agregados." : "Agrega el primer producto de tu catálogo."}</p>}
                {!draft.newProduct && draft.search.trim().length >= 2 && !products.data?.items.some(p => p.name.toLocaleLowerCase() === draft.search.trim().toLocaleLowerCase()) && <Button type="button" variant="link" disabled={draft.lines.length >= 100} className="h-auto whitespace-normal text-left" onClick={startNewProduct}>Crear “{draft.search.trim()}”</Button>}
              </>}
            </div>}
            {draft.newProduct && <div className="rounded-lg bg-muted/50 p-4 space-y-3" aria-label="Nuevo producto">
              <h3 className="text-sm font-semibold">Nuevo producto</h3>
              <div className="grid sm:grid-cols-[1fr_180px] gap-3">
                <label className="text-sm">Nombre<Input id="new-product-name" value={draft.newProduct.name} {...invalid("newName")} maxLength={100} onChange={e => update(d => ({ ...d, newProduct: { ...d.newProduct!, name: e.target.value } }))} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); document.getElementById("new-product-price")?.focus(); } }} />{fieldError("newName")}</label>
                <label className="text-sm">Precio de venta<Input id="new-product-price" type="number" inputMode="decimal" min="0.01" step="0.01" value={draft.newProduct.price} {...invalid("newPrice")} onChange={e => update(d => ({ ...d, newProduct: { ...d.newProduct!, price: e.target.value } }))} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); addNewProduct(); } }} />{fieldError("newPrice")}</label>
              </div>
              <div className="flex flex-wrap justify-end gap-2"><Button type="button" variant="ghost" onClick={() => { update(d => ({ ...d, newProduct: null })); setFieldErrors({}); }}>Cancelar</Button><Button type="button" onClick={addNewProduct}>Agregar a la compra</Button></div>
            </div>}
          </div>
          <div className="divide-y">{draft.lines.map(line => <div key={line.id} className="p-4 sm:p-5 space-y-3">
            <div className="flex items-start justify-between gap-3"><div className="min-w-0 flex-1">{line.newProduct ? <div className="grid sm:grid-cols-[1fr_180px] gap-3">
              <label className="text-sm">Nombre del producto nuevo<Input aria-label={`Nombre de ${line.name}`} value={line.name} maxLength={100} {...invalid(`${line.id}:name`)} onChange={e => updateLine(line.id, "name", e.target.value)} />{fieldError(`${line.id}:name`)}</label>
              <label className="text-sm">Precio de venta<Input aria-label={`Precio de venta de ${line.name}`} type="number" inputMode="decimal" min="0.01" step="0.01" value={line.newProduct.price} {...invalid(`${line.id}:price`)} onChange={e => updateLine(line.id, "price", e.target.value)} />{fieldError(`${line.id}:price`)}</label>
            </div> : <p className="font-medium break-words pt-2">{line.name}</p>}</div><Button type="button" variant="ghost" size="icon" aria-label={`Quitar ${line.name}`} onClick={() => update(d => ({ ...d, lines: d.lines.filter(l => l.id !== line.id) }))}><Trash2 /></Button></div>
            <div className="grid grid-cols-[1fr_1fr_auto] gap-3 items-start">
              <label className="text-sm">Cantidad<Input id={`quantity-${line.id}`} aria-label={`Cantidad de ${line.name}`} type="number" inputMode="numeric" min="1" step="1" value={line.quantity} {...invalid(`${line.id}:quantity`)} onChange={e => updateLine(line.id, "quantity", e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); document.getElementById(`cost-${line.id}`)?.focus(); } }} />{fieldError(`${line.id}:quantity`)}</label>
              <label className="text-sm">Costo por unidad<Input id={`cost-${line.id}`} aria-label={`Costo de ${line.name}`} type="number" inputMode="decimal" min="0.01" step="0.01" value={line.cost} {...invalid(`${line.id}:cost`)} onChange={e => updateLine(line.id, "cost", e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); searchRef.current?.focus(); } }} />{fieldError(`${line.id}:cost`)}</label>
              <div className="text-right text-sm min-w-16"><p className="text-muted-foreground">Subtotal</p><p className="py-2.5 font-medium tabular-nums" aria-label={`Subtotal de ${line.name}`}>{validMoney(line.cost) && Number(line.quantity) > 0 ? money(subtotal(line)) : "—"}</p></div>
            </div>
          </div>)}</div>
        </section>
        <section aria-label="Recepción y pago" className="rounded-xl border bg-card p-4 sm:p-5 space-y-4">
          <h2 className="font-semibold">Recepción y pago</h2>
          <label className="flex items-center gap-3 text-sm"><input type="checkbox" className="h-4 w-4" checked={draft.received} onChange={e => update(d => ({ ...d, received: e.target.checked }))} />Ya recibí los productos</label>
          <fieldset className="space-y-3" aria-describedby={fieldErrors.payment ? "error-payment" : undefined}>
            <legend className="mb-3 text-sm font-medium">Pago</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {([
                ["pending", "Pendiente de pago"],
                ...(canPayFromCash ? [["paid", "Pagado"]] : []),
              ] as [PurchasePayment, string][]).map(([value, label]) => <label key={value} className={`flex cursor-pointer items-center gap-3 rounded-lg border p-3 text-sm ${payment === value ? "border-primary bg-primary/5" : "hover:bg-muted/50"}`}>
                <input type="radio" name="purchase-payment" className="h-4 w-4 shrink-0 accent-primary" checked={payment === value} onChange={() => choosePayment(value)} />
                {label}
              </label>)}
            </div>
            {fieldError("payment")}
          </fieldset>
          {draft.paid && <div className="grid sm:grid-cols-2 gap-4 pt-2">
            {owner && <label className="text-sm sm:col-span-2">Pagado desde<select aria-label="Pagado desde" className="flex h-10 w-full rounded-md border bg-background px-3" value={draft.source} {...invalid("source")} onChange={e => chooseSource(e.target.value)}><option value="">Selecciona el origen del dinero</option><option value="cash_drawer">Dinero de caja</option><option value="gym_fund">Dinero del gimnasio fuera de caja</option><option value="external">Dinero personal</option></select>{fieldError("source")}</label>}
            <label className="text-sm">Fecha de pago<DateInput aria-label="Fecha de pago" context="recent" max={todayIso()} value={draft.day} {...invalid("day")} onValueChange={e => update(d => ({ ...d, day: e }))} />{fieldError("day")}</label>
            {draft.source && draft.source !== "cash_drawer" && owner && <label className="text-sm">Método de pago<select className="flex h-10 w-full rounded-md border bg-background px-3" value={draft.method} onChange={e => update(d => ({ ...d, method: e.target.value }))}><option value="transfer">Transferencia</option><option value="cash">Efectivo</option><option value="card">Tarjeta</option></select></label>}
            {draft.source === "cash_drawer" && canPayFromCash && <>
              <CashDrawerField value={draft.drawer} onChange={drawer => update(d => ({ ...d, drawer }))} />
              <p className="text-sm text-muted-foreground sm:col-span-2">Se descontarán {money(Number.isFinite(total) ? total : 0)} de caja.</p>
            </>}
          </div>}
        </section>
      </fieldset>
      {draft.attempt && !save.isPending && !error && <p role="alert" className="text-sm">Falta confirmar si se guardó la compra. Vuelve a intentar.</p>}
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
      {hasDraft && !draft.attempt && <Button type="button" variant="ghost" disabled={locked} onClick={() => setDiscarding(true)}>Descartar borrador</Button>}
      <div className="fixed bottom-0 left-[70px] right-0 z-30 border-t bg-background px-4 py-3 sm:px-6">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-3"><div><p className="text-xs text-muted-foreground">Total</p><p className="text-xl font-semibold tabular-nums">{money(Number.isFinite(total) ? total : 0)}</p></div><Button type="submit" disabled={save.isPending || blocked}>{save.isPending ? "Guardando…" : draft.attempt ? "Reintentar registro" : "Guardar compra"}</Button></div>
      </div>
    </form>
    <Dialog open={discarding} onOpenChange={setDiscarding}><DialogContent><DialogHeader><DialogTitle>¿Descartar esta compra?</DialogTitle><DialogDescription>Se quitarán los datos del borrador. La compra todavía no se ha registrado.</DialogDescription></DialogHeader><DialogFooter><Button type="button" variant="outline" onClick={() => setDiscarding(false)}>Seguir capturando</Button><Button type="button" onClick={() => { if (update(() => emptyPurchaseDraft(isDesktop))) { setFieldErrors({}); setError(null); setPicking(false); setDiscarding(false); } }}>Descartar borrador</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
