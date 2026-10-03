import { useEffect, useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { CheckCircle2, Loader2, Minus, Plus, Search, Tag, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { stockLevel, useActiveProducts, type Product } from "@/hooks/useProducts";
import { ProductPhoto } from "@/components/products/ProductPhoto";
import { useRegisterSale } from "@/hooks/useSales";
import { fmtMoney, usePaymentHistory, type Payment } from "@/hooks/useBilling";
import { SettleBalanceModal } from "@/components/billing/SettleBalanceModal";
import { ReceiptViewer } from "@/components/billing/ReceiptViewer";
import { CheckoutModal, type CheckoutInput } from "@/components/sales/CheckoutModal";
import { useSyncStatus } from "@/hooks/useSyncStatus";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/dates";
import { sales as t } from "@/strings/sales";
import { PromotionPickerModal } from "@/components/billing/PromotionPickerModal";
import { SaleCorrectionModal } from "@/components/sales/SaleCorrectionModal";
import { createIdempotencyKey } from "@/lib/idempotency";
import { useAuthStore } from "@/stores/useAuthStore";
import { changedSaleProducts, emptySaleDraft, moneyCents, saleTotals, useSaleDraft, type CartLine, type SaleAttempt } from "@/components/sales/saleDraft";

interface LastSale { saleId: string; paymentId: string; folio: string; total: number; paid: number; balance: number; change?: number }
const normalize = (value: string) => value.normalize("NFD").replace(/\p{Diacritic}/gu, "").toLowerCase().trim();

export default function QuickSalePage() {
  const gym = useAuthStore(s => s.gym?.gym_id);
  const user = useAuthStore(s => s.user?.user_id);
  if (!gym || !user) return null;
  const key = `tinta.sale.v1:${gym}:${user}`;
  return <SaleWorkspace key={key} draftKey={key} />;
}
function SaleWorkspace({ draftKey }: { draftKey: string }) {
  const products = useActiveProducts();
  const sync = useSyncStatus();
  const register = useRegisterSale();
  const saved = useSaleDraft(draftKey);
  const { draft } = saved;
  const { lines, member, promo } = draft;
  const [search, setSearch] = useState("");
  const [category, setCategory] = useState<string | null>(null);
  const [showOutOfStock, setShowOutOfStock] = useState(true);
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const [lastSale, setLastSale] = useState<LastSale | null>(null);
  const [correctionOpen, setCorrectionOpen] = useState(false);
  const [receiptOpen, setReceiptOpen] = useState(false);
  const [promoOpen, setPromoOpen] = useState(false);
  const [debtOpen, setDebtOpen] = useState(false);
  const [settlement, setSettlement] = useState<Payment | null>(null);
  const [error, setError] = useState<string | null>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const sending = useRef(false);
  const memberHistory = usePaymentHistory(member?.member_id, {});
  const items = useMemo(() => products.data ?? [], [products.data]);
  const categories = useMemo(() => [...new Set(items.map(p => p.category || t.page.uncategorized))].sort((a, b) => a.localeCompare(b, "es")), [items]);
  const filtered = useMemo(() => items.filter(p => p.active && (showOutOfStock || p.stock > 0)
    && (!category || (p.category || t.page.uncategorized) === category)
    && (!normalize(search) || normalize(p.name).includes(normalize(search))))
    .sort((a, b) => a.name.localeCompare(b.name, "es")), [items, showOutOfStock, category, search]);
  const changed = products.data ? changedSaleProducts(lines, items) : [];
  const totals = saleTotals(lines, promo);
  const blocked = register.isPending || !!draft.attempt || saved.blocked;
  const needsReview = changed.length > 0;
  const debts = [...(memberHistory.data?.items ?? [])].filter(p => p.balance_pending > 0)
    .sort((a, b) => a.payment_date.localeCompare(b.payment_date));
  useEffect(() => { searchRef.current?.focus(); }, []);

  function add(product: Product) {
    if (blocked) return;
    saved.update(d => {
      const existing = d.lines.find(l => l.product.id === product.id);
      return { ...d, lines: existing ? d.lines.map(l => l === existing ? { ...l, qty: l.qty + 1 } : l) : [...d.lines, { product, qty: 1 }] };
    });
    setLastSale(null); setError(null);
  }
  function quantity(id: string, qty: number) {
    if (blocked || !Number.isSafeInteger(qty) || qty < 0) return;
    saved.update(d => ({ ...d, lines: qty === 0 ? d.lines.filter(l => l.product.id !== id) : d.lines.map(l => l.product.id === id ? { ...l, qty } : l) }));
  }
  function clear() {
    const previous = draft;
    if (!blocked && saved.update(() => emptySaleDraft())) {
      setError(null);
      toast("Venta vaciada", { action: { label: "Deshacer", onClick: () => saved.update(d => d.lines.length || d.attempt ? d : previous) } });
    }
  }
  function checkout() {
    if (blocked || !lines.length) return;
    if (totals.total <= 0) { setPromoOpen(true); return; }
    if (!products.data) { setError("Carga los productos antes de cobrar."); return; }
    if (needsReview) { setReviewOpen(true); return; }
    setError(null); setCheckoutOpen(true);
  }
  async function send(attempt: SaleAttempt) {
    if (sending.current) return;
    sending.current = true;
    try {
      const res = await register.mutateAsync(attempt.request);
      const change = attempt.received === undefined ? undefined : Math.max(0, moneyCents(attempt.received) - moneyCents(res.paid)) / 100;
      setLastSale({ saleId: res.sale_id, paymentId: res.payment_id, folio: res.folio, total: res.total, paid: res.paid, balance: res.balance_pending, change });
      saved.update(() => emptySaleDraft());
      setCheckoutOpen(false); setError(null); setSearch("");
      const message = res.balance_pending > 0 && res.paid === 0 ? `Fiado guardado: ${fmtMoney(res.balance_pending)} pendientes.` : res.balance_pending > 0 ? `${fmtMoney(res.paid)} cobrados · ${fmtMoney(res.balance_pending)} pendientes.`
        : res.total === 0 ? "Venta registrada sin cobro." : t.page.success.online(fmtMoney(res.paid));
      toast.success(message, { description: res.pending_offline_sync || sync.data?.state.startsWith("offline_") ? "Guardada en este equipo. Pendiente de sincronizar." : undefined });
      searchRef.current?.focus();
    } catch (err) {
      // A definitive rejection did not create a sale. A lost response retains
      // the exact request/key, including after reload, until confirmed.
      const rejected = err instanceof ApiError && err.status >= 400 && err.status < 500 && ![408, 429].includes(err.status);
      if (rejected) { saved.update(d => ({ ...d, attempt: null })); void products.refetch(); }
      else { setCheckoutOpen(false); }
      setError(err instanceof ApiError ? err.message : "No se pudo confirmar la venta. Reintenta la confirmación.");
      throw err;
    } finally { sending.current = false; }
  }
  async function confirm(input: CheckoutInput) {
    if (needsReview || saved.blocked || sending.current) return;
    const attempt: SaleAttempt = { received: input.received, request: {
      idempotency_key: createIdempotencyKey(), expected_total: totals.total,
      line_items: lines.map(l => ({ product_id: l.product.id, quantity: l.qty })),
      payment_method: input.method,
      ...(input.cash_drawer_id ? { cash_drawer_id: input.cash_drawer_id } : {}),
      ...(member ? { member_id: member.member_id } : {}),
      ...(input.paid !== undefined ? { paid: input.paid } : {}),
      ...(promo ? { promotion: { promotion_id: promo.id } } : {}),
    } };
    if (!saved.update(d => ({ ...d, attempt }))) throw new Error("draft storage unavailable");
    await send(attempt);
  }
  return <div className="flex h-full min-h-0 flex-col">
    <header className="flex shrink-0 flex-wrap items-center justify-between gap-3 border-b px-5 py-4">
      <h1 className="text-2xl font-semibold tracking-tight">{t.page.title}</h1>
      <Button variant="outline" size="sm" asChild><Link to="/billing?concept=product">Ventas del día</Link></Button>
    </header>
    {lastSale && <div role="status" className="flex shrink-0 flex-wrap items-center justify-between gap-2 border-b bg-success/10 px-5 py-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm"><span className="inline-flex items-center gap-2"><CheckCircle2 className="h-4 w-4 text-success" />Venta {lastSale.folio} · {fmtMoney(lastSale.total)}</span>
        {lastSale.balance > 0 && <span>Pendiente: {fmtMoney(lastSale.balance)}</span>}
        {lastSale.change !== undefined && <strong className="text-lg">Cambio: {fmtMoney(lastSale.change)}</strong>}
      </div>
      <div className="flex items-center gap-1"><Button variant="ghost" size="sm" onClick={() => setReceiptOpen(true)}>Ver comprobante</Button>
        <Button variant="ghost" size="sm" onClick={() => setCorrectionOpen(true)}>Corregir</Button>
        <Button variant="ghost" size="icon" aria-label="Ocultar última venta" onClick={() => setLastSale(null)}><X className="h-4 w-4" /></Button></div>
    </div>}
    <div className="grid min-h-0 flex-1 grid-cols-1 overflow-y-auto md:grid-cols-[minmax(0,1fr)_360px] md:overflow-hidden">
      <section className="flex min-h-0 flex-col">
        <div className="shrink-0 space-y-3 border-b px-5 py-3">
          <div className="relative"><Search className="pointer-events-none absolute left-3 top-3.5 h-4 w-4 text-muted-foreground" />
            <Input ref={searchRef} aria-label="Buscar producto" placeholder="Buscar producto…" value={search} onChange={e => setSearch(e.target.value)} className="h-11 pl-9 pr-10"
              onKeyDown={e => {
                if (e.key === "Escape") { e.preventDefault(); setSearch(""); }
                if (e.key === "Enter" && normalize(search) && filtered[0]) { e.preventDefault(); add(filtered[0]); }
              }} />
            {search && <Button type="button" variant="ghost" size="icon" className="absolute right-1 top-1 h-9 w-9" aria-label="Limpiar búsqueda" onClick={() => { setSearch(""); searchRef.current?.focus(); }}><X className="h-4 w-4" /></Button>}
          </div>
          {categories.length > 1 && <div className="flex gap-1.5 overflow-x-auto pb-1" aria-label="Categorías">
            {[null, ...categories].map(c => <Button key={c ?? "all"} variant={category === c ? "secondary" : "ghost"} size="sm" className="shrink-0" aria-pressed={category === c} onClick={() => setCategory(c)}>{c ?? "Todos"}</Button>)}
          </div>}
          {items.some(p => p.stock <= 0) && <label className="flex w-fit cursor-pointer items-center gap-2 text-xs text-muted-foreground">
            <input type="checkbox" className="h-4 w-4 accent-primary" checked={showOutOfStock} onChange={e => setShowOutOfStock(e.target.checked)} />{t.page.showOutOfStock}
          </label>}
        </div>
        <div className="min-h-40 flex-1 overflow-y-auto p-5">
          {products.isError && <Alert variant="destructive" className="mb-3"><AlertDescription>No se pudieron cargar los productos. <Button variant="link" size="sm" onClick={() => products.refetch()}>Reintentar</Button></AlertDescription></Alert>}
          {products.isLoading ? <div className="flex justify-center py-12"><Loader2 aria-label="Cargando productos" className="h-6 w-6 animate-spin" /></div>
            : !items.length && !products.isError ? <div className="py-12 text-center text-sm text-muted-foreground"><p>{t.page.empty}</p><Button variant="link" asChild><Link to="/products">Agregar productos</Link></Button></div>
            : items.length > 0 && !filtered.length ? <p className="py-12 text-center text-sm text-muted-foreground">{t.page.noSearchResults}</p>
            : <div className="grid grid-cols-[repeat(auto-fill,minmax(min(100%,170px),1fr))] gap-2.5">{filtered.map(p => <ProductCard key={p.id} product={p}
              qty={lines.find(l => l.product.id === p.id)?.qty ?? 0} highlighted={!!normalize(search) && filtered[0]?.id === p.id} disabled={blocked} onAdd={() => add(p)} />)}</div>}
        </div>
      </section>
      <aside className="flex min-h-72 flex-col border-t bg-muted/30 md:min-h-0 md:border-l md:border-t-0">
        <div className="flex shrink-0 items-center justify-between border-b px-4 py-3"><h2 className="font-semibold">Venta actual</h2>
          {!!lines.length && <Button variant="ghost" size="sm" onClick={clear} disabled={blocked}><Trash2 className="h-4 w-4" />Vaciar</Button>}</div>
        <div className="min-h-0 flex-1 space-y-2 overflow-y-auto px-4 py-3">
          {saved.error && <Alert variant="destructive"><AlertDescription>{saved.error}<Button variant="link" onClick={saved.reload}>Recargar venta</Button></AlertDescription></Alert>}
          {draft.attempt && <Alert><AlertDescription>Esta venta está por confirmar.
            <Button className="mt-2 w-full" disabled={register.isPending || saved.blocked} onClick={() => { void send(draft.attempt!).catch(() => {}); }}>{register.isPending ? "Confirmando…" : "Reintentar confirmación"}</Button>
          </AlertDescription></Alert>}
          {needsReview && !draft.attempt && <Alert><AlertDescription>Cambiaron productos de esta venta. <Button variant="link" className="px-0" onClick={() => setReviewOpen(true)}>Revisar cambios</Button></AlertDescription></Alert>}
          {!lines.length ? <p className="py-8 text-center text-sm text-muted-foreground">Agrega un producto para empezar.</p> : lines.map(line => <CartRow key={line.product.id} line={line}
            stock={items.find(p => p.id === line.product.id)?.stock ?? line.product.stock} disabled={blocked} onQuantity={q => quantity(line.product.id, q)} />)}
        </div>
        <div className="shrink-0 space-y-3 border-t bg-background p-4">
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          {!!lines.length && <div className="flex items-center justify-between gap-2">
            <Button variant="ghost" size="sm" className="h-auto min-h-9 max-w-full justify-start whitespace-normal px-0 text-sm" disabled={blocked} onClick={() => setPromoOpen(true)}><Tag className="h-4 w-4 shrink-0" />{promo?.name ?? "Aplicar promoción"}</Button>
            {promo && <Button variant="ghost" size="icon" aria-label="Quitar promoción" disabled={blocked} onClick={() => saved.update(d => ({ ...d, promo: null }))}><X className="h-4 w-4" /></Button>}
          </div>}
          {totals.total === 0 && lines.length > 0 && <p role="alert" className="text-sm text-amber-700">La promoción cubre todo el importe. Ajusta o quita la promoción.</p>}
          {totals.discount > 0 && <div className="space-y-1 text-xs text-muted-foreground"><div className="flex justify-between"><span>Subtotal</span><span>{fmtMoney(totals.subtotal)}</span></div><div className="flex justify-between"><span>Promoción</span><span>−{fmtMoney(totals.discount)}</span></div></div>}
          <div className="flex items-baseline justify-between"><span>Total</span><strong className="text-2xl tabular-nums">{fmtMoney(totals.total)}</strong></div>
          <Button size="lg" className="h-12 w-full text-base" disabled={!lines.length || blocked} onClick={checkout}>{totals.total === 0 && lines.length ? "Cambiar promoción" : `Cobrar ${fmtMoney(totals.total)}`}</Button>
        </div>
      </aside>
    </div>
    <PromotionPickerModal open={promoOpen} onOpenChange={setPromoOpen} target="sale" onApply={p => { if (!blocked) saved.update(d => ({ ...d, promo: p })); }} />
    <CheckoutModal open={checkoutOpen} onOpenChange={setCheckoutOpen} total={totals.total} itemCount={lines.reduce((n, l) => n + l.qty, 0)}
      member={member} onMemberChange={m => saved.update(d => ({ ...d, member: m }))} memberDebt={memberHistory.data?.total_pending ?? 0}
      debtStatus={memberHistory.isError ? "error" : memberHistory.isPending ? "loading" : "ready"} onRetryDebt={() => { void memberHistory.refetch(); }}
      onSettle={() => setDebtOpen(true)} submitting={register.isPending} blockedReason={needsReview ? "Los productos cambiaron. Vuelve a la venta y revisa los cambios." : saved.error ?? undefined} onConfirm={confirm} />
    <Dialog open={reviewOpen} onOpenChange={setReviewOpen}><DialogContent aria-describedby={undefined} className="max-w-md max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Revisar cambios</DialogTitle></DialogHeader>
      {changed.map(l => { const current = items.find(p => p.id === l.product.id && p.active); return <div key={l.product.id} className="border-b py-2 text-sm"><p className="font-medium">{l.product.name}</p>
        <p className="text-muted-foreground">{current ? `${fmtMoney(l.product.price)} → ${fmtMoney(current.price)}${current.name !== l.product.name ? ` · ${current.name}` : ""}` : "Ya no está disponible. Se quitará de la venta."}</p></div>; })}
      <Button onClick={() => { saved.update(d => ({ ...d, lines: d.lines.flatMap(l => { const p = items.find(p => p.id === l.product.id && p.active); return p ? [{ ...l, product: p }] : []; }) })); setReviewOpen(false); }}>Actualizar venta</Button>
    </DialogContent></Dialog>
    <Dialog open={debtOpen} onOpenChange={setDebtOpen}><DialogContent aria-describedby={undefined} className="max-w-md max-h-[85dvh] overflow-y-auto"><DialogHeader><DialogTitle>Saldos de {member?.full_name}</DialogTitle></DialogHeader>
      <p className="font-semibold">Total pendiente: {fmtMoney(memberHistory.data?.total_pending ?? 0)}</p>
      {debts.map(p => <div key={p.id} className="flex items-center justify-between gap-3 border-b py-2 text-sm"><div><p>{p.reference || (p.concept === "product" ? "Compra de productos" : "Membresía")}</p><p className="text-muted-foreground">{fmtDate(p.payment_date)}</p></div><Button variant="outline" onClick={() => { setDebtOpen(false); setSettlement(p); }}>Abonar a {fmtMoney(p.balance_pending)}</Button></div>)}
    </DialogContent></Dialog>
    {member && settlement && <SettleBalanceModal paymentId={settlement.id} memberName={member.full_name} pendingBalance={settlement.balance_pending} open onOpenChange={open => !open && setSettlement(null)} />}
    <ReceiptViewer paymentId={lastSale?.paymentId ?? null} folio={lastSale?.folio} open={receiptOpen} onOpenChange={setReceiptOpen} />
    <SaleCorrectionModal saleId={lastSale?.saleId ?? null} open={correctionOpen} onOpenChange={setCorrectionOpen} onCorrected={() => { setLastSale(null); }} />
  </div>;
}
function ProductCard({ product, qty, highlighted, disabled, onAdd }: { product: Product; qty: number; highlighted: boolean; disabled: boolean; onAdd(): void }) {
  const level = stockLevel(product);
  return <button type="button" disabled={disabled} onClick={onAdd} aria-label={`Agregar ${product.name}`} className={cn("relative flex min-h-28 flex-col justify-between gap-3 rounded-lg border bg-background p-3 text-left transition-colors hover:border-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-60",
    qty > 0 || highlighted ? "border-primary bg-primary/5" : "border-border")}>
    <div className="flex items-start gap-2">
      {product.image_url && <div className="relative h-10 w-10 shrink-0 overflow-hidden rounded bg-muted"><ProductPhoto productId={product.id} imageUrl={product.image_url} className="h-full w-full object-cover" /></div>}
      <span className="min-w-0 flex-1 text-sm font-medium leading-snug">{product.name}</span>
      {qty > 0 && <span className="shrink-0 rounded bg-primary px-1.5 py-0.5 text-xs text-primary-foreground">×{qty}</span>}
    </div>
    <div className="flex flex-col gap-1"><strong className="tabular-nums">{fmtMoney(product.price)}</strong><span className={cn("text-xs tabular-nums", level === "ok" ? "text-muted-foreground" : "text-amber-700 dark:text-amber-400")}>Existencias: {product.stock}</span></div>
  </button>;
}
function CartRow({ line, stock, disabled, onQuantity }: { line: CartLine; stock: number; disabled: boolean; onQuantity(n: number): void }) {
  const [value, setValue] = useState(String(line.qty));
  const [invalid, setInvalid] = useState(false);
  useEffect(() => { setValue(String(line.qty)); setInvalid(false); }, [line.qty]);
  function commit() {
    const qty = Number(value);
    if (!value.trim() || !Number.isSafeInteger(qty) || qty < 1) { setInvalid(true); setValue(String(line.qty)); return; }
    setInvalid(false); onQuantity(qty);
  }
  return <div className="space-y-2 rounded-md border bg-background p-3">
    <div className="flex items-start justify-between gap-2"><span className="text-sm font-medium">{line.product.name}</span><Button variant="ghost" size="icon" className="h-7 w-7 shrink-0" disabled={disabled} aria-label={`Quitar ${line.product.name}`} onClick={() => onQuantity(0)}><X className="h-4 w-4" /></Button></div>
    <div className="flex items-center justify-between gap-2"><div className="flex items-center gap-1">
      <Button variant="outline" size="icon" className="h-9 w-8" disabled={disabled} aria-label={`Restar una unidad de ${line.product.name}`} onClick={() => onQuantity(line.qty - 1)}><Minus className="h-4 w-4" /></Button>
      <Input aria-label={`Cantidad de ${line.product.name}`} inputMode="numeric" value={value} onChange={e => { setValue(e.target.value); setInvalid(false); }} onBlur={commit} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); commit(); } }} disabled={disabled} aria-invalid={invalid} className="h-9 w-14 px-1 text-center tabular-nums" />
      <Button variant="outline" size="icon" className="h-9 w-8" disabled={disabled} aria-label={`Sumar una unidad de ${line.product.name}`} onClick={() => onQuantity(line.qty + 1)}><Plus className="h-4 w-4" /></Button>
    </div><strong className="text-sm tabular-nums">{fmtMoney(moneyCents(line.product.price) * line.qty / 100)}</strong></div>
    {invalid && <p role="alert" className="text-xs text-destructive">Escribe una cantidad entera mayor a cero.</p>}
    <div className="flex flex-wrap justify-between gap-1 text-xs text-muted-foreground"><span>{fmtMoney(line.product.price)} c/u</span>{line.qty > stock && <span className="text-amber-700 dark:text-amber-400">Existencias por revisar</span>}</div>
  </div>;
}
