import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Minus, Plus, Search, Trash2, UserCheck, UserPlus, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  stockLevel,
  useActiveProducts,
  type Product,
  type StockLevel,
} from "@/hooks/useProducts";
import {
  useMemberSearch,
  useRegisterSale,
  type MemberSearchResult,
  type RegisterSaleInput,
} from "@/hooks/useSales";
import { fmtMoney, type PaymentMethod } from "@/hooks/useBilling";
import { levelOf, useSyncStatus } from "@/hooks/useSyncStatus";
import { useDebounce } from "@/hooks/useDebounce";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sales as t } from "@/strings/sales";

interface CartLine {
  product: Product;
  qty: number;
}

function badgeForStock(level: StockLevel, stock: number) {
  if (level === "out") return { text: t.page.badges.out, className: "bg-destructive text-destructive-foreground" };
  if (level === "low") return { text: t.page.badges.low(stock), className: "bg-warning text-warning-foreground" };
  return { text: t.page.badges.stock(stock), className: "bg-muted text-muted-foreground" };
}

export default function QuickSalePage() {
  const navigate = useNavigate();
  const products = useActiveProducts();
  const sync = useSyncStatus();
  const register = useRegisterSale();

  const [cart, setCart] = useState<Record<string, number>>({});
  const [method, setMethod] = useState<PaymentMethod>("cash");
  const [member, setMember] = useState<MemberSearchResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [qtyModal, setQtyModal] = useState<Product | null>(null);
  const [qtyValue, setQtyValue] = useState("1");
  const [keyBuffer, setKeyBuffer] = useState("");
  const bufferTimeout = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  const total = useMemo(
    () => cartLines.reduce((sum, l) => sum + l.product.price * l.qty, 0),
    [cartLines]
  );

  const grouped = useMemo(() => {
    const map = new Map<string, Product[]>();
    for (const p of items) {
      const arr = map.get(p.category) ?? [];
      arr.push(p);
      map.set(p.category, arr);
    }
    return Array.from(map.entries())
      .sort(([a], [b]) => a.localeCompare(b, "es"))
      .map(([category, list]) => ({
        category,
        list: list.slice().sort((a, b) => a.name.localeCompare(b.name, "es")),
      }));
  }, [items]);

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
  }

  function close() {
    navigate("/");
  }

  // Keyboard: type letters to filter, Enter to add 1.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const target = e.target as HTMLElement | null;
      if (target) {
        const tag = target.tagName.toLowerCase();
        if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
      }
      if (e.metaKey || e.ctrlKey || e.altKey) return;

      if (e.key === "Escape") {
        if (keyBuffer) {
          setKeyBuffer("");
          return;
        }
      }

      if (e.key === "Enter" && keyBuffer) {
        e.preventDefault();
        const term = keyBuffer.toLowerCase();
        const match = items.find(
          (p) => p.active && p.stock > 0 && p.name.toLowerCase().startsWith(term)
        );
        if (match) addToCart(match, 1);
        setKeyBuffer("");
        return;
      }

      if (e.key === "Backspace" && keyBuffer) {
        e.preventDefault();
        setKeyBuffer((b) => b.slice(0, -1));
        return;
      }

      if (e.key.length === 1 && /[a-zA-Z0-9áéíóúüñ]/i.test(e.key)) {
        setKeyBuffer((b) => b + e.key);
        if (bufferTimeout.current) clearTimeout(bufferTimeout.current);
        bufferTimeout.current = setTimeout(() => setKeyBuffer(""), 1500);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (bufferTimeout.current) clearTimeout(bufferTimeout.current);
    };
  }, [items, keyBuffer]);

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
    };

    try {
      const res = await register.mutateAsync(payload);
      const amount = fmtMoney(res.sale.total);
      if (res.pending_offline_sync || offline) {
        toast.success(t.page.success.offline);
      } else {
        toast.success(t.page.success.online(amount));
      }
      clearCart();
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
      <header className="flex items-center justify-between border-b px-6 py-4 bg-background">
        <div className="flex items-center gap-3">
          <h1 className="text-2xl font-semibold tracking-tight">{t.page.title}</h1>
          {keyBuffer && (
            <span className="inline-flex items-center gap-1.5 rounded-md border bg-muted px-2 py-1 text-xs">
              <Search className="h-3 w-3" />
              <span className="font-mono">{keyBuffer}</span>
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <MemberAssociator member={member} onChange={setMember} />
          <Button variant="ghost" size="icon" onClick={close} aria-label={t.page.close}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </header>

      {offline && (
        <div className="bg-warning/10 text-warning-foreground border-b px-6 py-2 text-sm">
          {t.page.offline}
        </div>
      )}

      <div className="flex-1 grid grid-cols-1 md:grid-cols-[1fr_360px] overflow-hidden">
        <div className="overflow-y-auto p-6">
          {products.isLoading ? (
            <div className="flex items-center justify-center py-20">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : items.length === 0 ? (
            <div className="text-center py-20 text-muted-foreground">
              <p>{t.page.empty}</p>
              <p className="text-sm mt-1">{t.page.emptyHint}</p>
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
                      />
                    ))}
                  </div>
                </section>
              ))}
              <p className="text-xs text-muted-foreground pt-4">{t.page.keyboard.hint}</p>
            </div>
          )}
        </div>

        <aside className="border-l bg-muted/30 flex flex-col overflow-hidden">
          <div className="flex items-center justify-between px-4 py-3 border-b">
            <h2 className="font-semibold">{t.page.cart.title}</h2>
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

          <div className="border-t bg-background px-4 py-4 space-y-4">
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <div className="flex items-baseline justify-between">
              <span className="text-sm font-medium">{t.page.cart.total}</span>
              <span className="text-2xl font-semibold tabular-nums">{fmtMoney(total)}</span>
            </div>

            <div className="space-y-2">
              <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.page.cart.methodLabel}
              </Label>
              <RadioGroup
                value={method}
                onValueChange={(v) => setMethod(v as PaymentMethod)}
                className="flex flex-wrap gap-3"
              >
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <RadioGroupItem value="cash" id="qs-m-cash" />
                  {t.page.cart.methods.cash}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <RadioGroupItem value="transfer" id="qs-m-tr" />
                  {t.page.cart.methods.transfer}
                </label>
                <label className="flex items-center gap-1.5 cursor-pointer text-sm">
                  <RadioGroupItem value="card" id="qs-m-card" />
                  {t.page.cart.methods.card}
                </label>
              </RadioGroup>
            </div>

            <Button
              size="lg"
              className="w-full"
              onClick={submit}
              disabled={register.isPending || cartLines.length === 0}
            >
              {register.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.page.cart.submit(fmtMoney(total))}
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
    </div>
  );
}

interface ProductCardProps {
  product: Product;
  cartQty: number;
  onAdd(): void;
  onCustomQty(): void;
}

function ProductCard({ product, cartQty, onAdd, onCustomQty }: ProductCardProps) {
  const level = stockLevel(product);
  const out = level === "out";
  const badge = badgeForStock(level, product.stock);

  function handleClick() {
    if (out) return;
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
      disabled={out}
      title={out ? t.page.tooltips.out : t.page.tooltips.rightClick}
      className={cn(
        "relative flex flex-col items-stretch text-left rounded-lg border bg-background overflow-hidden transition-all",
        "focus:outline-none focus:ring-2 focus:ring-ring",
        out ? "opacity-50 cursor-not-allowed" : "hover:border-primary hover:shadow-sm active:scale-[0.98]"
      )}
    >
      <div className="aspect-[4/3] bg-muted flex items-center justify-center overflow-hidden">
        {product.photo_url ? (
          <img src={product.photo_url} alt="" className="h-full w-full object-cover" />
        ) : (
          <span className="text-2xl font-semibold text-muted-foreground">
            {product.name.slice(0, 2).toUpperCase()}
          </span>
        )}
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
      <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground" onClick={onRemove} aria-label={t.page.cart.remove}>
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
