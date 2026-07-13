import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import {
  AlertTriangle,
  Loader2,
  Minus,
  PackagePlus,
  Plus,
  Search,
  Tag,
  Trash2,
  UserCheck,
  UserPlus,
  Wallet,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  stockLevel,
  useActiveProducts,
  type Product,
  type StockLevel,
} from "@/hooks/useProducts";
import { ProductPhoto } from "@/components/products/ProductPhoto";
import {
  useMemberSearch,
  useRegisterSale,
  type MemberSearchResult,
  type RegisterSaleInput,
} from "@/hooks/useSales";
import { fmtMoney, usePaymentHistory, type PaymentMethod } from "@/hooks/useBilling";
import { SettleBalanceModal } from "@/components/billing/SettleBalanceModal";
import { levelOf, useSyncStatus } from "@/hooks/useSyncStatus";
import { useDebounce } from "@/hooks/useDebounce";
import { api, ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sales as t } from "@/strings/sales";
import type { Promotion } from "@/hooks/usePromotions";
import { formatPromotionValue } from "@/strings/promotions";
import { PromotionPickerModal } from "@/components/billing/PromotionPickerModal";
import { Badge } from "@/components/ui/badge";

interface CartLine {
  product: Product;
  qty: number;
}

// normalize — quita acentos y baja a lowercase. Sin esto "mineral" no
// pegaba con "Agua mineral" y "ciel" no pegaba con "Ciél". Usamos
// NFD + strip de combining marks (Unicode plane Diacritic) que cubre
// todas las vocales acentuadas en español.
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

// Cash quick-amount chips. Cubre los billetes típicos del operador
// mexicano + "Exacto" (= total). Si el total ya rebasa el chip lo
// escondemos automáticamente para no inducir error.
const CASH_QUICK_AMOUNTS = [50, 100, 200, 500, 1000] as const;

function badgeForStock(level: StockLevel, stock: number) {
  if (level === "out")
    return { text: t.page.badges.out, className: "bg-destructive text-destructive-foreground" };
  if (level === "low")
    return { text: t.page.badges.low(stock), className: "bg-warning text-warning-foreground" };
  return { text: t.page.badges.stock(stock), className: "bg-muted text-muted-foreground" };
}

export default function QuickSalePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const products = useActiveProducts();
  const sync = useSyncStatus();
  const register = useRegisterSale();

  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [member, setMember] = useState<MemberSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qtyModal, setQtyModal] = useState<Product | null>(null);
  const [qtyValue, setQtyValue] = useState("1");
  const [search, setSearch] = useState("");
  // Por default escondemos los productos con stock=0 — el operador
  // tiene foco en lo que SÍ se puede vender ahora. El toggle expone los
  // agotados (caso típico: el operador sabe que sí tiene físico pero el
  // sistema no lo refleja). Al tocar uno agotado se abre el modal de
  // restock rápido que registra el inventario y agrega al carrito en un
  // solo gesto — protege contra olvidos del día a día.
  const [showOutOfStock, setShowOutOfStock] = useState(false);
  const [restockModal, setRestockModal] = useState<Product | null>(null);
  // Cash change calculator state. Vacío = sin cálculo. parseFloat lo
  // convierte a número al usarlo; no usamos number en state porque
  // intermedios como "1" vs "1." tienen UX distinta en input numérico.
  const [givenCash, setGivenCash] = useState("");
  // Fiado: el toggle decide si el operador quiere dejar saldo. Si está
  // ON, paidValue es lo que cobra ahora (default = total). Si OFF, se
  // ignora — el BE recibe paid omitido y cobra todo. Requiere socio.
  const [creditMode, setCreditMode] = useState(false);
  const [paidValue, setPaidValue] = useState("");
  // Promo opcional. En ventas sólo aplican percent / fixed_amount; el BE
  // tira no-op para los demás kinds. El target del picker es "sale".
  const [promo, setPromo] = useState<Promotion | null>(null);
  const [promoPickerOpen, setPromoPickerOpen] = useState(false);
  // Deuda del socio asociado: el momento natural de cobrar un fiado es
  // cuando esa persona vuelve al mostrador. El chip ámbar junto a su
  // nombre abre el modal de abono sin salir de la venta.
  const [settleOpen, setSettleOpen] = useState(false);
  const memberHistory = usePaymentHistory(member?.member_id ?? null, {});
  const memberDebt = member ? (memberHistory.data?.total_pending ?? 0) : 0;
  const oldestMemberDebt = useMemo(() => {
    if (!member) return undefined;
    return [...(memberHistory.data?.items ?? [])]
      .filter((p) => p.balance_pending > 0)
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date))[0];
  }, [member, memberHistory.data]);
  const searchRef = useRef<HTMLInputElement | null>(null);

  const items = useMemo(() => products.data ?? [], [products.data]);
  const offline = levelOf(sync.data) !== "ok";

  const cartLines: CartLine[] = useMemo(() => {
    return Object.entries(cart)
      .map(([id, qty]) => {
        const product = items.find((p) => p.id === id);
        if (!product) return null;
        return { product, qty };
      })
      .filter((x): x is CartLine => x !== null && x.qty > 0);
  }, [cart, items]);

  const subtotal = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.product.price * l.qty, 0),
    [cartLines]
  );

  // Promo preview client-side (espeja Calculate del BE). Para ventas sólo
  // percent y fixed_amount dan descuento; los demás kinds → 0.
  const promoDiscount = useMemo(() => {
    if (!promo || subtotal <= 0) return 0;
    switch (promo.kind) {
      case "percent":
        if (promo.value == null) return 0;
        return Math.min(subtotal, subtotal * (promo.value / 100));
      case "fixed_amount":
        if (promo.value == null) return 0;
        return Math.min(subtotal, promo.value);
      default:
        return 0;
    }
  }, [promo, subtotal]);

  const total = useMemo(
    () => Math.max(0, subtotal - promoDiscount),
    [subtotal, promoDiscount]
  );

  // Filtra los productos por (a) la búsqueda visible — substring +
  // accent-tolerant (normalize ambos lados) — y (b) la regla
  // "esconder agotados por default". El toggle showOutOfStock los
  // reintroduce cuando el operador necesita registrar mercancía no
  // capturada.
  const filtered = useMemo(() => {
    const q = normalize(search);
    return items.filter((p) => {
      if (!showOutOfStock && p.stock <= 0) return false;
      if (q && !normalize(p.name).includes(q)) return false;
      return true;
    });
  }, [items, search, showOutOfStock]);

  // outOfStockCount — count de agotados que el toggle expondría. Si es
  // 0 escondemos el toggle entero (no aporta señal). Conteo se hace
  // sobre `items` (no filtered) para que respete sólo el dataset, no la
  // búsqueda.
  const outOfStockCount = useMemo(
    () => items.filter((p) => p.stock <= 0).length,
    [items]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of filtered) {
      // El backend omite `category` cuando es null (omitempty), así que
      // puede llegar undefined aunque el tipo diga string. Agrupamos esos
      // bajo "Sin categoría" — sin el fallback, la key undefined rompía el
      // .sort (undefined.localeCompare) y dejaba un encabezado vacío.
      const category = p.category || t.page.uncategorized;
      const arr = map.get(category) ?? [];
      arr.push(p);
      map.set(category, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([category, list]) => ({
        category,
        list: list.slice().sort((a, b) => a.name.localeCompare(b.name, "es")),
      }));
  }, [filtered]);

  function addToCart(product: Product, qty = 1) {
    if (product.stock <= 0) return;
    setCart((c) => {
      const current = c[product.id] ?? 0;
      const next = Math.min(product.stock, current + qty);
      if (next === current) {
        toast.error(t.page.errors.stockInsufficient(product.name, product.stock));
        return c;
      }
      return { ...c, [product.id]: next };
    });
    setError(null);
  }

  function setLineQty(productId: string, qty: number) {
    setCart((c) => {
      if (qty <= 0) {
        const { [productId]: _drop, ...rest } = c;
        return rest;
      }
      const product = items.find((p) => p.id === productId);
      const capped = product ? Math.min(product.stock, qty) : qty;
      return { ...c, [productId]: capped };
    });
  }

  function removeLine(productId: string) {
    setCart((c) => {
      const { [productId]: _drop, ...rest } = c;
      return rest;
    });
  }

  function clearCart() {
    setCart({});
    setMember(null);
    setError(null);
    setGivenCash("");
    setCreditMode(false);
    setPaidValue("");
    setPromo(null);
  }

  function close() {
    navigate("/");
  }

  // Atajos globales:
  //   E / T / C  → método de pago (cash / transfer / card). No se
  //                disparan si el operador está escribiendo en un input.
  //   Esc        → limpia el carrito (si tiene algo). Si está vacío y el
  //                foco está en el search, blurea el search.
  //   Enter      → agrega el primer match al carrito cuando hay query
  //                visible. (Reemplaza el viejo keyBuffer invisible.)
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName.toLowerCase() === "input" ||
          target.tagName.toLowerCase() === "textarea" ||
          target.isContentEditable);

      // Esc siempre disponible — incluso desde el search input — para
      // dar al operador una salida rápida del estado actual.
      if (e.key === "Escape") {
        if (cartLines.length > 0 || search) {
          e.preventDefault();
          clearCart();
          setSearch("");
        }
        return;
      }

      // Enter desde el search agrega el primer producto filtrado con
      // stock disponible. Asegura el flujo "tecleo + Enter" sin mouse.
      if (e.key === "Enter" && isInput && target === searchRef.current) {
        const first = filtered.find((p) => p.active && p.stock > 0);
        if (first) {
          e.preventDefault();
          addToCart(first, 1);
        }
        return;
      }

      // Atajos de método: sólo cuando NO hay un input enfocado, sin
      // modificadores. Una sola letra E/T/C. Mayúsculas y minúsculas.
      if (!isInput && !e.metaKey && !e.ctrlKey && !e.altKey) {
        const k = e.key.toLowerCase();
        if (k === "e") {
          e.preventDefault();
          setMethod("cash");
        } else if (k === "t") {
          e.preventDefault();
          setMethod("transfer");
        } else if (k === "c") {
          e.preventDefault();
          setMethod("card");
        }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [cartLines.length, filtered, search]);

  // Autofocus en el search al cargar la página — habilita escribir
  // inmediatamente sin tocar el mouse.
  useEffect(() => {
    searchRef.current?.focus();
  }, []);

  // Reset del cambio cuando se sale del método cash (no tiene sentido).
  useEffect(() => {
    if (method !== "cash") setGivenCash("");
  }, [method]);

  // Si se quita el socio mientras el toggle de fiado estaba ON, hay que
  // desactivarlo: fiado-sin-socio es estado inválido.
  useEffect(() => {
    if (!member && creditMode) {
      setCreditMode(false);
      setPaidValue("");
    }
  }, [member, creditMode]);

  // Reset paidValue al total cuando entra a credit mode (default es
  // "cobrar todo"; el operador baja el valor para crear el saldo).
  useEffect(() => {
    if (creditMode) {
      setPaidValue((v) => (v === "" ? String(total) : v));
    } else {
      setPaidValue("");
    }
  }, [creditMode, total]);

  function openQtyModal(p: Product) {
    if (p.stock <= 0) return;
    setQtyValue(String(cart[p.id] ?? 1));
    setQtyModal(p);
  }

  function confirmQty() {
    if (!qtyModal) return;
    const q = parseInt(qtyValue, 10);
    if (!Number.isFinite(q) || q <= 0) return;
    if (q > qtyModal.stock) {
      setError(t.page.errors.stockInsufficient(qtyModal.name, qtyModal.stock));
      return;
    }
    setCart((c) => ({ ...c, [qtyModal.id]: q }));
    setQtyModal(null);
  }

  // Cobrado efectivo: lo que de verdad va al payment. En credit mode es
  // el input; en modo normal es el total completo.
  const paidNow = useMemo(() => {
    if (!creditMode) return total;
    const v = parseFloat(paidValue);
    if (!Number.isFinite(v)) return 0;
    return v;
  }, [creditMode, paidValue, total]);

  const balanceLeft = creditMode ? Math.max(0, total - paidNow) : 0;

  // Cambio en efectivo: positivo = devuelves; negativo = falta. Se
  // muestra solo cuando method = cash y hay total > 0.
  const cashGiven = useMemo(() => {
    const v = parseFloat(givenCash);
    return Number.isFinite(v) ? v : 0;
  }, [givenCash]);
  const cashToCover = creditMode ? paidNow : total;
  const change = cashGiven - cashToCover;

  async function submit() {
    setError(null);
    if (cartLines.length === 0) {
      setError(t.page.errors.cartEmpty);
      return;
    }
    if (!method) {
      setError(t.page.errors.methodRequired);
      return;
    }
    if (creditMode) {
      if (!member) {
        setError(t.page.credit.requiresMember);
        return;
      }
      if (paidNow <= 0) {
        setError(t.page.credit.paidMustBePositive);
        return;
      }
      if (paidNow > total) {
        setError(t.page.credit.paidExceedsTotal);
        return;
      }
    }
    for (const line of cartLines) {
      if (line.qty > line.product.stock) {
        setError(t.page.errors.stockInsufficient(line.product.name, line.product.stock));
        return;
      }
    }

    const payload: RegisterSaleInput = {
      line_items: cartLines.map((l) => ({ product_id: l.product.id, quantity: l.qty })),
      payment_method: method,
      ...(member ? { member_id: member.member_id } : {}),
      ...(creditMode && paidNow < total ? { paid: paidNow } : {}),
      ...(promo ? { promotion: { promotion_id: promo.id } } : {}),
    };

    try {
      const res = await register.mutateAsync(payload);
      if (res.pending_offline_sync || offline) {
        toast.success(t.page.success.offline);
      } else if (res.balance_pending > 0) {
        toast.success(
          `${fmtMoney(res.paid)} cobrados · queda ${fmtMoney(res.balance_pending)} a deber.`
        );
      } else {
        toast.success(t.page.success.online(fmtMoney(res.total)));
      }
      clearCart();
      searchRef.current?.focus();
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.page.errors.generic);
      } else {
        setError(t.page.errors.generic);
      }
    }
  }

  return (
    <div className="flex flex-col h-full">
      <header className="flex items-center justify-between border-b border-foreground/10 px-6 py-5 bg-background">
        <h1
          className="text-3xl font-semibold text-foreground"
          style={{ letterSpacing: "-0.025em" }}
        >
          {t.page.title}
        </h1>
        <div className="flex items-center gap-2">
          <MemberAssociator member={member} onChange={setMember} />
          {member && memberDebt > 0 && oldestMemberDebt && (
            <button
              type="button"
              onClick={() => setSettleOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-full border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs font-semibold text-warning hover:bg-warning/20 transition-colors"
            >
              <Wallet className="h-3.5 w-3.5" />
              {t.page.debt.chip(fmtMoney(memberDebt))}
            </button>
          )}
          <Button variant="ghost" size="icon" onClick={close} aria-label={t.page.close}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {member && oldestMemberDebt && (
        <SettleBalanceModal
          paymentId={oldestMemberDebt.id}
          memberName={member.full_name}
          pendingBalance={oldestMemberDebt.balance_pending}
          open={settleOpen}
          onOpenChange={setSettleOpen}
        />
      )}

      {offline && (
        <div className="bg-warning/10 text-warning-foreground border-b border-border px-6 py-2 text-sm">
          {t.page.offline}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_360px] overflow-hidden">
        <div className="overflow-y-auto p-6 space-y-6">
          {/* Search sticky — siempre visible, autofocus al cargar. El
              operador puede escribir sin tocar el mouse, ver matches en
              vivo, y Enter agrega el primer match al carrito. */}
          <div className="sticky top-0 -mt-6 -mx-6 px-6 pt-6 pb-3 bg-background z-10 border-b border-border">
            <div className="flex items-center gap-3 flex-wrap">
              <div className="relative flex-1 min-w-[240px] max-w-lg">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
                <Input
                  ref={searchRef}
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder={t.page.searchPlaceholder}
                  className="pl-9 pr-9 h-11 text-base"
                  aria-label={t.page.searchPlaceholder}
                />
                {search && (
                  <button
                    type="button"
                    onClick={() => {
                      setSearch("");
                      searchRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                    aria-label="Limpiar búsqueda"
                    title="Limpiar búsqueda"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
              {/* Toggle "Ver agotados". Sólo aparece si hay al menos un
                  producto en 0 — sin nada que esconder no aporta. */}
              {outOfStockCount > 0 && (
                <label className="flex items-center gap-2 cursor-pointer h-11 px-3 rounded-md border border-input hover:bg-muted">
                  <Switch
                    checked={showOutOfStock}
                    onCheckedChange={setShowOutOfStock}
                  />
                  <span className="text-sm whitespace-nowrap">
                    {t.page.showOutOfStock}
                    <span className="ml-1.5 text-xs text-muted-foreground tabular-nums">
                      ({outOfStockCount})
                    </span>
                  </span>
                </label>
              )}
            </div>
          </div>

          {products.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p>{t.page.empty}</p>
              <p className="text-sm mt-1">{t.page.emptyHint}</p>
            </div>
          ) : grouped.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p>{t.page.noSearchResults}</p>
            </div>
          ) : (
            <div className="space-y-8">
              {grouped.map(({ category, list }) => (
                <section key={category}>
                  <h2 className="text-sm font-semibold uppercase tracking-wide text-muted-foreground mb-3">
                    {category}
                  </h2>
                  <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
                    {list.map((p) => (
                      <ProductCard
                        key={p.id}
                        product={p}
                        cartQty={cart[p.id] ?? 0}
                        onAdd={() => addToCart(p, 1)}
                        onCustomQty={() => openQtyModal(p)}
                        onRestock={() => setRestockModal(p)}
                      />
                    ))}
                  </div>
                </section>
              ))}
              <p className="text-xs text-muted-foreground pt-4">{t.page.keyboard.hint}</p>
            </div>
          )}
        </div>

        <aside className="border-l border-border bg-muted/40 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b border-border">
            <h2 className="font-semibold text-foreground">{t.page.cart.title}</h2>
            {cartLines.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearCart}>
                <Trash2 className="h-4 w-4" />
                {t.page.cart.clear}
              </Button>
            )}
          </div>

          <div className="flex-1 overflow-y-auto px-4 py-3 space-y-2">
            {cartLines.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 text-center">{t.page.cart.empty}</p>
            ) : (
              cartLines.map((line) => (
                <CartRow
                  key={line.product.id}
                  line={line}
                  onInc={() => addToCart(line.product, 1)}
                  onDec={() => setLineQty(line.product.id, line.qty - 1)}
                  onRemove={() => removeLine(line.product.id)}
                />
              ))
            )}
          </div>

          <div className="border-t border-border bg-background px-4 py-4 space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-1">
              {promoDiscount > 0 && (
                <div className="flex items-baseline justify-between text-xs text-muted-foreground">
                  <span>Subtotal</span>
                  <span className="tabular-nums">{fmtMoney(subtotal)}</span>
                </div>
              )}
              {promoDiscount > 0 && (
                <div className="flex items-baseline justify-between text-xs text-success">
                  <span>− Promoción ({promo?.name})</span>
                  <span className="tabular-nums">−{fmtMoney(promoDiscount)}</span>
                </div>
              )}
              <div className="flex items-baseline justify-between">
                <span className="text-sm font-medium">{t.page.cart.total}</span>
                <span className="text-2xl font-semibold tabular-nums">{fmtMoney(total)}</span>
              </div>
            </div>

            {/* Promoción — opcional. Botón "Aplicar promoción" abre el
                picker compartido con el flujo de membresía. La promo
                sólo se aplica al subtotal de productos. */}
            <div className="rounded-md border border-dashed bg-card p-2.5">
              {!promo ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="w-full h-9"
                  onClick={() => setPromoPickerOpen(true)}
                  disabled={cartLines.length === 0}
                >
                  <Tag className="h-4 w-4 mr-2" />
                  Aplicar promoción
                </Button>
              ) : (
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0 flex items-center gap-2 flex-wrap">
                    <Tag className="h-4 w-4 text-primary shrink-0" />
                    <span className="text-sm font-medium truncate">{promo.name}</span>
                    <Badge variant="secondary" className="text-[10px]">
                      {formatPromotionValue(promo.kind, promo.value, promo.companion_count)}
                    </Badge>
                  </div>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => setPromo(null)}
                    aria-label="Quitar promoción"
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              )}
            </div>

            <PromotionPickerModal
              open={promoPickerOpen}
              onOpenChange={setPromoPickerOpen}
              target="sale"
              onApply={(p) => setPromo(p)}
            />

            {/* Método de pago como segmented control con hint de tecla
                (E/T/C). Hace descubrible el shortcut sin meter un
                cheat-sheet aparte. */}
            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.page.cart.methodLabel}
              </Label>
              <div className="grid grid-cols-3 gap-1.5">
                {(["cash", "transfer", "card"] as PaymentMethod[]).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => setMethod(m)}
                    className={cn(
                      "h-10 rounded-md border text-sm font-medium transition-colors",
                      "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                      method === m
                        ? "bg-primary text-primary-foreground border-primary"
                        : "bg-background hover:bg-muted border-border text-foreground"
                    )}
                    aria-pressed={method === m}
                  >
                    <span>{t.page.cart.methods[m]}</span>
                    <kbd
                      className={cn(
                        "ml-1.5 inline-flex h-4 min-w-[1rem] items-center justify-center rounded px-1 text-[10px] font-mono",
                        method === m
                          ? "bg-primary-foreground/20 text-primary-foreground"
                          : "bg-muted text-muted-foreground"
                      )}
                    >
                      {t.page.cart.methodHints[m]}
                    </kbd>
                  </button>
                ))}
              </div>
            </div>

            {/* Calculadora de cambio (solo cash, total > 0). Chips
                rápidos con denominaciones MX típicas + "Exacto". El
                cambio se renderiza en verde si positivo, en rojo si
                falta para cubrir. */}
            {method === "cash" && cashToCover > 0 && (
              <div className="space-y-2 rounded-md border border-border bg-muted/40 p-3">
                <Label
                  htmlFor="qs-given"
                  className="text-xs uppercase tracking-wide text-muted-foreground"
                >
                  {t.page.change.label}
                </Label>
                <Input
                  id="qs-given"
                  type="number"
                  inputMode="decimal"
                  min={0}
                  step="0.01"
                  value={givenCash}
                  onChange={(e) => setGivenCash(e.target.value)}
                  placeholder={t.page.change.placeholder}
                  className="h-10 text-base"
                />
                <div className="flex flex-wrap gap-1.5">
                  <button
                    type="button"
                    onClick={() => setGivenCash(String(cashToCover))}
                    className="px-2 py-1 text-xs rounded border border-border bg-background hover:bg-muted transition-colors"
                  >
                    {t.page.change.exact}
                  </button>
                  {CASH_QUICK_AMOUNTS.filter((v) => v >= cashToCover).map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => setGivenCash(String(v))}
                      className="px-2 py-1 text-xs rounded border border-border bg-background hover:bg-muted transition-colors tabular-nums"
                    >
                      ${v}
                    </button>
                  ))}
                </div>
                {givenCash !== "" && (
                  <div
                    className={cn(
                      "text-sm font-semibold tabular-nums",
                      change >= 0 ? "text-success" : "text-destructive"
                    )}
                  >
                    {change >= 0
                      ? t.page.change.result(fmtMoney(change))
                      : t.page.change.shortfall(fmtMoney(-change))}
                  </div>
                )}
              </div>
            )}

            {/* Fiado: toggle sólo aparece cuando hay socio asociado.
                Cuando está activo, input para "cobrado ahora" + display
                de "queda a deber". El submit cambia label.

                Nota: usamos <div> + onClick en lugar de <label> porque
                Radix Switch es un <button>. Un <label> sin htmlFor
                envolviendo un button hace double-fire del click (HTML
                spec: el label forwarda al primer "labelable element"
                interno; button califica). El stopPropagation en el
                Switch evita el bubbling al div padre. */}
            <div className="space-y-2">
              <CreditToggleRow
                disabled={!member}
                checked={creditMode}
                onToggle={(v) => setCreditMode(v)}
              />
              {creditMode && (
                <div className="space-y-2 rounded-md border border-warning/40 bg-warning/5 p-3">
                  <Label
                    htmlFor="qs-paid"
                    className="text-xs uppercase tracking-wide text-muted-foreground"
                  >
                    {t.page.credit.paidLabel}
                  </Label>
                  <Input
                    id="qs-paid"
                    type="number"
                    inputMode="decimal"
                    min={0}
                    max={total}
                    step="0.01"
                    value={paidValue}
                    onChange={(e) => setPaidValue(e.target.value)}
                    className="h-10 text-base"
                  />
                  <div className="flex items-center gap-2 text-sm font-semibold text-warning tabular-nums">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{t.page.credit.balanceLabel(fmtMoney(balanceLeft))}</span>
                  </div>
                </div>
              )}
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={submit}
              disabled={register.isPending || cartLines.length === 0}
            >
              {register.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {balanceLeft > 0
                ? t.page.cart.submitWithDebt(fmtMoney(paidNow), fmtMoney(balanceLeft))
                : t.page.cart.submit(fmtMoney(total))}
            </Button>
          </div>
        </aside>
      </div>

      <Dialog open={!!qtyModal} onOpenChange={(o) => !o && setQtyModal(null)}>
        <DialogContent className="max-w-xs">
          <DialogHeader>
            <DialogTitle>{qtyModal ? t.page.quantityModal.title(qtyModal.name) : ""}</DialogTitle>
          </DialogHeader>
          {qtyModal && (
            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                {t.page.quantityModal.stockLabel(qtyModal.stock)}
              </p>
              <div className="space-y-1">
                <Label htmlFor="qs-qty">{t.page.quantityModal.label}</Label>
                <Input
                  id="qs-qty"
                  type="number"
                  inputMode="numeric"
                  min={1}
                  max={qtyModal.stock}
                  value={qtyValue}
                  onChange={(e) => setQtyValue(e.target.value)}
                  autoFocus
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      confirmQty();
                    }
                  }}
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button variant="outline" onClick={() => setQtyModal(null)}>
                  {t.page.quantityModal.cancel}
                </Button>
                <Button onClick={confirmQty}>{t.page.quantityModal.submit}</Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <QuickRestockModal
        product={restockModal}
        onClose={() => setRestockModal(null)}
        onDone={(productId, newStock) => {
          // Parche optimista al cache de useActiveProducts. Si no lo
          // hacemos, addToCart leería el item con stock=0 del closure
          // viejo y el +1 se descartaría. setQueryData dispara un
          // re-render de QuickSalePage con el item refrescado.
          queryClient.setQueryData<Product[]>(["products", "active"], (old) =>
            (old ?? []).map((p) => (p.id === productId ? { ...p, stock: newStock } : p))
          );
          // Y aún así no podemos depender del closure para addToCart —
          // metemos directo al carrito con qty=1. La fila lee el item
          // del array refrescado, así que el precio se mostrará bien.
          setCart((c) => ({ ...c, [productId]: 1 }));
          setRestockModal(null);
          searchRef.current?.focus();
        }}
      />
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  cartQty: number;
  onAdd(): void;
  onCustomQty(): void;
  onRestock(): void;
}

function ProductCard({ product, cartQty, onAdd, onCustomQty, onRestock }: ProductCardProps) {
  const level = stockLevel(product);
  const out = level === "out";
  const badge = badgeForStock(level, product.stock);
  // Long-press para abrir el modal de cantidad. El right-click sigue
  // funcionando en desktop pero no es descubrible en touch. 500ms es
  // el umbral típico (Material/iOS). Si la posición cambia mucho
  // (scroll/drag) cancelamos para no disparar accidentalmente.
  const longPressTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressFired = useRef(false);

  function startLongPress() {
    if (out) return;
    longPressFired.current = false;
    longPressTimer.current = setTimeout(() => {
      longPressFired.current = true;
      onCustomQty();
    }, 500);
  }
  function cancelLongPress() {
    if (longPressTimer.current) {
      clearTimeout(longPressTimer.current);
      longPressTimer.current = null;
    }
  }

  function handleClick() {
    if (out) {
      // Out-of-stock ya no bloquea: el tap abre el modal de restock
      // rápido. Caso típico: te llegó mercancía y no la registraste,
      // ahora un socio te la pide. Un solo gesto registra el inventario
      // y mete 1 al carrito.
      onRestock();
      return;
    }
    if (longPressFired.current) {
      // El long-press ya abrió el modal — evitamos sumar 1 además.
      longPressFired.current = false;
      return;
    }
    onAdd();
  }

  function handleContextMenu(e: React.MouseEvent) {
    e.preventDefault();
    if (out) return;
    onCustomQty();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      onContextMenu={handleContextMenu}
      onPointerDown={startLongPress}
      onPointerUp={cancelLongPress}
      onPointerLeave={cancelLongPress}
      onPointerCancel={cancelLongPress}
      title={out ? t.page.outOfStockTap : t.page.tooltips.rightClick}
      className={cn(
        "relative flex flex-col items-stretch text-left rounded-lg border-2 bg-background overflow-hidden transition-all",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        out
          // Out-of-stock: dashed border + muted bg para diferenciar
          // visualmente del estado "vendible", sin esconderlo (toggle
          // del padre ya hace eso). Hover ofrece el affordance de
          // restock — borde primary tenue.
          ? "border-dashed border-muted-foreground/40 bg-muted/30 hover:border-primary/60 hover:bg-primary/5"
          : cartQty > 0
          ? "border-primary shadow-sm bg-primary/5"
          : "border-border hover:border-primary/60 hover:shadow-sm active:scale-[0.98]"
      )}
    >
      <div className="relative aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
        <span className="text-2xl font-semibold text-muted-foreground">
          {product.name.slice(0, 2).toUpperCase()}
        </span>
        <ProductPhoto
          productId={product.id}
          imageUrl={product.image_url}
          className="absolute inset-0 h-full w-full object-cover"
        />
      </div>
      <div className="px-3 py-2 space-y-1">
        <div className="font-medium text-sm leading-tight line-clamp-2 min-h-[2.5rem]">
          {product.name}
        </div>
        <div className="flex items-baseline justify-between">
          <span className="text-base font-semibold tabular-nums">{fmtMoney(product.price)}</span>
          <span
            className={cn(
              "rounded px-1.5 py-0.5 text-xs font-medium tabular-nums",
              badge.className
            )}
          >
            {badge.text}
          </span>
        </div>
      </div>
      {cartQty > 0 && (
        <span className="absolute top-2 right-2 inline-flex items-center justify-center h-7 min-w-[1.75rem] rounded-full bg-primary text-primary-foreground text-xs font-semibold px-2 shadow">
          ×{cartQty}
        </span>
      )}
      {out && (
        // Hint visible: el card está accesible y el tap registra
        // mercancía. Lo ponemos sobre la foto en lugar de bajo el
        // nombre para no romper el alineamiento del grid.
        <span className="absolute top-2 left-2 inline-flex items-center gap-1 rounded-md bg-background/95 border border-border px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          <PackagePlus className="h-3 w-3" />
          {t.page.outOfStockTap}
        </span>
      )}
    </button>
  );
}

interface CartRowProps {
  line: CartLine;
  onInc(): void;
  onDec(): void;
  onRemove(): void;
}

function CartRow({ line, onInc, onDec, onRemove }: CartRowProps) {
  return (
    <div className="rounded-md bg-background border px-3 py-2 flex items-center gap-2">
      <div className="flex-1 min-w-0">
        <div className="font-medium text-sm truncate">{line.product.name}</div>
        <div className="text-xs text-muted-foreground tabular-nums">
          {fmtMoney(line.product.price)} c/u
        </div>
      </div>
      <div className="flex items-center gap-1">
        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={onDec}>
          <Minus className="h-3.5 w-3.5" />
        </Button>
        <span className="w-7 text-center text-sm font-semibold tabular-nums">{line.qty}</span>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7"
          onClick={onInc}
          disabled={line.qty >= line.product.stock}
        >
          <Plus className="h-3.5 w-3.5" />
        </Button>
      </div>
      <div className="w-20 text-right tabular-nums font-semibold">
        {fmtMoney(line.product.price * line.qty)}
      </div>
      <Button
        variant="ghost"
        size="icon"
        className="h-7 w-7 text-muted-foreground"
        onClick={onRemove}
        aria-label={t.page.cart.remove}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

function MemberAssociator({
  member,
  onChange,
}: {
  member: MemberSearchResult | null;
  onChange(m: MemberSearchResult | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const search = useMemberSearch(debounced);

  if (member) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border bg-muted px-3 py-1.5 text-sm">
        <UserCheck className="h-4 w-4 text-success" />
        <span className="font-medium">{member.full_name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground hover:text-foreground ml-1"
        >
          {t.page.removeAssociation}
        </button>
      </div>
    );
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4" />
          {t.page.associate}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.page.associateSearchPlaceholder}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {search.isFetching && (
            <div className="px-3 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Buscando…</span>
            </div>
          )}
          {!search.isFetching && debounced.length >= 2 && (search.data ?? []).length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">{t.page.associateNoResults}</p>
          )}
          {(search.data ?? []).map((m) => (
            <button
              key={m.member_id}
              type="button"
              onClick={() => {
                onChange(m);
                setOpen(false);
                setQuery("");
              }}
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
            >
              <div className="font-medium">{m.full_name}</div>
              <div className="text-xs text-muted-foreground">{m.phone}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}

// CreditToggleRow — fila del switch de fiado. Aislada en componente
// propio porque mezcla 3 cosas no-triviales: (1) la fila completa es
// clickeable (no sólo el switch), (2) cuando está deshabilitada
// envuelve todo en un Tooltip de Radix para explicar el porqué en
// hover (el `title` nativo del browser tiene latencia ~700ms y no
// aparece en touch — el Tooltip es ~150ms y consistente), (3) el
// stopPropagation del Switch evita el double-toggle vs el onClick del
// contenedor.
function CreditToggleRow({
  disabled,
  checked,
  onToggle,
}: {
  disabled: boolean;
  checked: boolean;
  onToggle(next: boolean): void;
}) {
  const row = (
    <div
      role="button"
      tabIndex={disabled ? -1 : 0}
      aria-disabled={disabled}
      aria-pressed={checked}
      onClick={() => {
        if (disabled) return;
        onToggle(!checked);
      }}
      onKeyDown={(e) => {
        if (disabled) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle(!checked);
        }
      }}
      className={cn(
        "flex items-center justify-between gap-2 rounded-md border border-border bg-background px-3 py-2 select-none transition-colors",
        disabled
          ? "opacity-60 cursor-not-allowed"
          : "cursor-pointer hover:bg-muted/50",
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      )}
    >
      <span className="text-sm font-medium">{t.page.credit.toggle}</span>
      <Switch
        checked={checked}
        onCheckedChange={(v) => {
          if (disabled) return;
          onToggle(!!v);
        }}
        onClick={(e) => e.stopPropagation()}
        disabled={disabled}
      />
    </div>
  );

  // Cuando está deshabilitado, el row queda envuelto en un Tooltip.
  // delayDuration 150ms — más rápido que el nativo, menos brusco que 0.
  // Sin asChild Radix pone su propio botón wrapper que rompe el ancho
  // del contenedor padre (el row ya es full-width); asChild deja al row
  // como el trigger directo.
  if (!disabled) return row;
  return (
    <Tooltip delayDuration={150}>
      <TooltipTrigger asChild>{row}</TooltipTrigger>
      <TooltipContent side="top" className="max-w-[220px] text-center">
        {t.page.credit.requiresMember}
      </TooltipContent>
    </Tooltip>
  );
}

// adjustStockResp — shape devuelta por POST /products/:id/adjust-stock
// según payment_controller.go. La definimos aquí porque el hook
// existente useAdjustStock devuelve `Product` (incorrecto — pre-existing
// FE/BE mismatch). Para no expandir el blast radius, este modal hace
// el POST directo con `api.post` y el tipo correcto.
interface AdjustStockResp {
  new_stock: number;
  delta: number;
  movement_id: string;
}

function QuickRestockModal({
  product,
  onClose,
  onDone,
}: {
  product: Product | null;
  onClose(): void;
  onDone(productId: string, newStock: number): void;
}) {
  const [qty, setQty] = useState("1");
  const [cost, setCost] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    if (product) {
      setQty("1");
      setCost("");
      setError(null);
      setSubmitting(false);
    }
  }, [product]);

  if (!product) return null;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const q = parseInt(qty, 10);
    if (!Number.isFinite(q) || q <= 0) {
      setError(t.page.restock.errors.qtyInvalid);
      return;
    }
    const costNum = cost ? parseFloat(cost) : undefined;
    // reason fija porque la triggereó la venta. Sin razón, el reporte
    // de "Compras de inventario" mostraría "—" y el dueño no sabría
    // por qué se registró el restock. La etiqueta lo deja claro.
    const payload: Record<string, unknown> = {
      movement_type: "restock",
      quantity: q,
      reason: t.page.restock.reasonDefault,
    };
    if (costNum !== undefined && Number.isFinite(costNum) && costNum > 0) {
      payload.cost = costNum;
    }
    setSubmitting(true);
    try {
      const res = await api.post<AdjustStockResp>(
        `/api/v1/products/${product!.id}/adjust-stock`,
        payload
      );
      toast.success(t.page.restock.success(q, product!.name));
      onDone(product!.id, res.new_stock);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.page.restock.errors.generic);
      } else {
        setError(t.page.restock.errors.generic);
      }
      setSubmitting(false);
    }
  }

  return (
    <Dialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.page.restock.title(product.name)}</DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          <p className="text-sm text-muted-foreground">{t.page.restock.description}</p>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-2">
            <Label htmlFor="restock-qty">{t.page.restock.qtyLabel}</Label>
            <Input
              id="restock-qty"
              type="number"
              inputMode="numeric"
              min={1}
              step={1}
              value={qty}
              onChange={(e) => setQty(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="restock-cost">{t.page.restock.costLabel}</Label>
            <Input
              id="restock-cost"
              type="number"
              inputMode="decimal"
              min={0}
              step="0.01"
              placeholder="0.00"
              value={cost}
              onChange={(e) => setCost(e.target.value)}
            />
            <p className="text-xs text-muted-foreground">{t.page.restock.costHint}</p>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={onClose} disabled={submitting}>
              {t.page.restock.cancel}
            </Button>
            <Button type="submit" disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.page.restock.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
