import { PageContainer } from "@/components/shared/PagePrimitives";
import { useCanWrite } from "@/lib/writeAccess";
import { usePermission } from "@/lib/permissions";
import { RestrictedNote } from "@/components/shared/RestrictedNote";
import { StockCountButton } from "@/components/products/StockCount";
import { ExpensesWorkspace } from "@/pages/expenses/ExpensesPage";
import { PurchaseDeliveries } from "@/components/products/PurchaseDeliveries";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, useSearchParams } from "react-router-dom";
import {
  ChevronDown,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  Plus,
  Search,
  BadgeMinus,
  BadgePlus,
  Package,
  PackagePlus,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableTh,
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/components/shared/PagePrimitives";
import {
  DEFAULT_CATEGORIES,
  stockLevel,
  useCreateProduct,
  useDeactivateProduct,
  useProductForDeepLink,
  useProductsList,
  useReactivateProduct,
  useUpdateProduct,
  type ListProductsInput,
  type Product,
  type ProductSortColumn,
  type ProductStatusFilter,
  type SortDirection,
} from "@/hooks/useProducts";
import { useDebounce } from "@/hooks/useDebounce";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { canAccessFeature } from "@/lib/features";
import { useCan } from "@/lib/permissions";
import { ApiError } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { ProductForm, type ProductFormSubmitPayload } from "@/components/products/ProductForm";
import { ProductPhoto } from "@/components/products/ProductPhoto";
import { AdjustStockModal } from "@/components/products/AdjustStockModal";
import { SyncStaleHint } from "@/components/shared/SyncStaleHint";
import { products as t } from "@/strings/products";
import { common } from "@/strings/common";

const PAGE_SIZE = 50;

function stockBadge(p: Product) {
  const level = stockLevel(p);
  if (p.stock < 0) return <Badge variant="warning">Existencias por revisar</Badge>;
  if (level === "out") {
    return <Badge variant="destructive">{t.page.badges.out}</Badge>;
  }
  if (level === "low") {
    return <Badge variant="warning">{t.page.badges.low}</Badge>;
  }
  return <Badge variant="outline">{t.page.badges.ok}</Badge>;
}

function stockColorClass(p: Product) {
  const level = stockLevel(p);
  if (level === "out") return "text-destructive font-semibold";
  if (level === "low") return "text-warning font-semibold";
  return "text-muted-foreground";
}

// SortableHeader — column header clickeable que dispara toggleSort.
// Renderea un indicador visual (↑/↓ cuando es la columna activa, ↕
// neutro para las inactivas) y queda accesible por teclado (es un
// <button> nativo, soporta Tab + Enter).
function SortableHeader({
  label,
  column,
  sortBy,
  sortDir,
  onClick,
  align = "left",
}: {
  label: string;
  column: ProductSortColumn;
  sortBy: ProductSortColumn;
  sortDir: SortDirection;
  onClick: (col: ProductSortColumn) => void;
  align?: "left" | "right";
}) {
  const active = sortBy === column;
  const Icon = active ? (sortDir === "asc" ? ArrowUp : ArrowDown) : ArrowUpDown;
  return (
    <DataTableTh className={cn(align === "right" && "text-right")}>
      <button
        type="button"
        onClick={() => onClick(column)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 rounded",
          align === "right" && "ml-auto",
          active ? "text-foreground" : "text-muted-foreground"
        )}
        aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : "none"}
        aria-label={`Ordenar por ${label}${
          active ? `, actualmente ${sortDir === "asc" ? "ascendente" : "descendente"}` : ""
        }`}
      >
        <span>{label}</span>
        <Icon className={cn("h-3.5 w-3.5", active ? "opacity-100" : "opacity-50")} />
      </button>
    </DataTableTh>
  );
}

export default function ProductsPage() {
  const canWrite = useCanWrite();
  // Per-operator permissions: editing the catalog (create, edit, price,
  // deactivate) needs "products"; adjusting stock needs "inventory".
  const mayEditProducts = usePermission("products");
  const mayAdjust = usePermission("inventory");
  const canEditProducts = canWrite && mayEditProducts;
  const canAdjust = canWrite && mayAdjust;
  // Hidrata los filtros iniciales desde la URL: ?q= llega de Buscar (el
  // producto elegido abre el catálogo ya filtrado) y ?low_stock=1 de «Por
  // surtir» en Inicio o del KPI de existencias del reporte.
  const [searchParams, setSearchParams] = useSearchParams();
  const queryParam = searchParams.get("q");
  const [search, setSearch] = useState(() => queryParam ?? "");
  const debouncedSearch = useDebounce(search, 300);
  const [category, setCategory] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("active");
  // Apply ?q= once and drop it from the URL: a new search from Buscar sets it
  // again, and typing here never fights with a stale param.
  useEffect(() => {
    if (queryParam === null) return;
    setSearch(queryParam);
    setSearchParams(current => { const next = new URLSearchParams(current); next.delete("q"); return next; }, { replace: true });
  }, [queryParam, setSearchParams]);
  const purchasesView = searchParams.get("view") === "purchases";
  const isOwner = useAuthStore(s => s.user?.role === "owner");
  const navigate = useNavigate();
  const location = useLocation();
  const openPurchase = (initialProduct?: Product) => navigate("/products/purchases/new", { state: { returnTo: location.pathname + location.search, initialProduct } });
  const [lowStockOnly, setLowStockOnly] = useState(
    () => searchParams.get("low_stock") === "1",
  );
  const [page, setPage] = useState(1);
  // Sort: persist en estado local. Default name asc — coincide con el
  // default del backend si lo omitimos, pero lo mando explícito para
  // que el header de la tabla pueda reflejar la dirección activa.
  const [sortBy, setSortBy] = useState<ProductSortColumn>("name");
  const [sortDir, setSortDir] = useState<SortDirection>("asc");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Product | null>(null);
  const money = useMoneyVisibility();

  // Deep-link ?edit=<id> — llega desde el indicador de sync ("Abrir para
  // renombrar" un producto que la nube rechazó por nombre duplicado). El
  // producto puede no estar en la página/filtros actuales, así que se
  // resuelve con su propia query y se limpia el param para que el refresh
  // o el cierre del diálogo no lo re-disparen.
  const editParam = searchParams.get("edit");
  const deepLink = useProductForDeepLink(editParam);
  useEffect(() => {
    if (!editParam || deepLink.data === undefined) return;
    if (deepLink.data && canEditProducts) {
      setEditing(deepLink.data);
    } else if (!deepLink.data) {
      toast.error(t.errors.deepLinkNotFound);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("edit");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editParam, deepLink.data, canEditProducts]);
  // El costo y los márgenes son sensibles y forman parte de Análisis Plus.
  // Se requieren ambas condiciones: permiso de dueño y plan Plus. Standard
  // conserva catálogo, stock, ventas, compras y captura de costos.
  const plan = useAuthStore((state) => state.gym);
  const showMargins =
    useCan("view_product_margins") && canAccessFeature(plan, "product_margins");

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, statusFilter, lowStockOnly, sortBy, sortDir]);

  // Mantén el URL sincronizado con el toggle — si el operador apaga el
  // filtro al llegar desde el drill-down, removemos el query param para
  // que un refresh no vuelva a forzarlo.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (lowStockOnly) {
      next.set("low_stock", "1");
    } else {
      next.delete("low_stock");
    }
    const cur = searchParams.toString();
    const after = next.toString();
    if (cur !== after) {
      setSearchParams(next, { replace: true });
    }
  }, [lowStockOnly, searchParams, setSearchParams]);

  // toggleSort: click en column header. Si la columna ya es la activa,
  // invierte dirección; si no, la convierte en activa y arranca asc.
  // Convención típica de data tables.
  const toggleSort = (col: ProductSortColumn) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      setSortDir("asc");
    }
  };

  const hasActiveFilters = !!(debouncedSearch || category || lowStockOnly || statusFilter !== "active");
  const clearAllFilters = () => {
    setSearch("");
    setCategory("");
    setStatusFilter("active");
    setLowStockOnly(false);
  };

  const filters: ListProductsInput = {
    q: debouncedSearch || undefined,
    category: category || undefined,
    status: statusFilter,
    low_stock: lowStockOnly || undefined,
    sort: sortBy,
    dir: sortDir,
    page,
    page_size: PAGE_SIZE,
  };

  const list = useProductsList(filters);
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const knownCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    // `category` puede llegar undefined (el BE la omite cuando es null);
    // no la metemos al set para no pintar una opción vacía en el dropdown.
    items.forEach((p) => {
      if (p.category) set.add(p.category);
    });
    return Array.from(set);
  }, [items]);

  // Stats globales del backend (filtro completo, no la página). El BE
  // calcula low/out/total_value con SUM(CASE WHEN ...) sobre el set
  // filtrado — antes los counters reflejaban solo la página visible.
  const totals = list.data?.totals ?? {
    total_value: 0,
    low_count: 0,
    out_count: 0,
    potential_profit: 0,
    cost_value: 0,
    margin_pct: null,
    products_total: 0,
    products_with_cost: 0,
  };

  return (
    <PageContainer className="space-y-4">
      <PageHeader
        title={t.page.title}

        actions={
          <div className="flex gap-2">{!purchasesView && <StockCountButton desktop />}{(purchasesView || canEditProducts) && <Button requiresWrite
            size="lg"
            disabled={purchasesView ? !canWrite : !canEditProducts}
            onClick={() => purchasesView ? openPurchase() : setCreateOpen(true)}
          >
            {purchasesView ? <PackagePlus aria-hidden="true" className="h-4 w-4" /> : <Plus aria-hidden="true" className="h-4 w-4" />}
            {purchasesView ? "Registrar compra" : t.page.new}
          </Button>}</div>
        }
      />

      {!purchasesView && canWrite && (!mayEditProducts || !mayAdjust) && (
        <div className="space-y-1">
          {!mayEditProducts && <RestrictedNote permission="products">{t.page.restricted.edit}</RestrictedNote>}
          {!mayAdjust && <RestrictedNote permission="inventory">{t.page.restricted.adjust}</RestrictedNote>}
        </div>
      )}
      <div className="flex gap-5 border-b" role="group" aria-label="Vistas de Productos">{[["catalog","Catálogo"],["purchases","Compras"]].map(([id,label])=><button key={id} type="button" aria-pressed={purchasesView===(id==="purchases")} onClick={()=>setSearchParams(current=>{const next=new URLSearchParams(current);next.set("view",id);return next;})} className={cn("h-11 border-b-2 px-1 text-sm",purchasesView===(id==="purchases")?"border-foreground font-semibold":"border-transparent text-muted-foreground")}>{label}</button>)}</div>
      {/* The operator sees what they can act on (merchandise to receive) and
          is told where the rest lives, never a blank tab. */}
      {purchasesView ? <div className="space-y-5"><PurchaseDeliveries showEmpty={!isOwner} />{isOwner ? <ExpensesWorkspace section="purchases" embedded /> : <p className="text-sm text-muted-foreground">{t.page.purchases.ownerHistory}</p>}</div> : <>


      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[280px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.page.searchPlaceholder}
            className="pl-9 pr-11 h-11"
            aria-label={t.page.searchPlaceholder}
          />
          {/* Botón limpiar búsqueda — aparece solo cuando hay texto.
              Patrón estándar de search inputs (Gmail, GitHub, etc); evita
              al operador tener que seleccionar todo + borrar. */}
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-0 top-0 inline-flex h-11 w-11 items-center justify-center rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={category || "_all"} onValueChange={(v) => setCategory(v === "_all" ? "" : v)}>
          <SelectTrigger aria-label="Categoría" className="h-11 w-[180px]">
            <SelectValue placeholder={t.page.filters.categoryAll} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">{t.page.filters.categoryAll}</SelectItem>
            {knownCategories.map((c) => (
              <SelectItem key={c} value={c}>
                {c}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProductStatusFilter)}>
          <SelectTrigger aria-label="Estado del producto" className="h-11 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t.page.filters.statusActive}</SelectItem>
            <SelectItem value="inactive">{t.page.filters.statusInactive}</SelectItem>
            <SelectItem value="all">{t.page.filters.statusAll}</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 cursor-pointer h-11 px-3 rounded-md border border-input hover:bg-muted">
          <Switch aria-label={t.page.filters.lowStockOnly} checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
          <span className="text-sm whitespace-nowrap">{t.page.filters.lowStockOnly}</span>
        </label>
      </div>

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
            <span>{t.errors.loadList}{list.data ? " Mostramos la última información disponible; puede haber cambiado." : " Reintenta para consultar tus existencias."}</span>
            <Button variant="outline" disabled={list.isFetching} onClick={() => void list.refetch()}>{list.isFetching ? "Reintentando…" : "Reintentar"}</Button>
          </AlertDescription>
        </Alert>
      )}
      {list.data && !list.error && <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm" aria-label="Existencias del catálogo">
        <span><strong className="font-display tabular">{total}</strong> {total === 1 ? "producto" : "productos"}{hasActiveFilters ? " en el filtro" : ""}</span>
        <span><strong className="font-display tabular">{totals.low_count}</strong> {t.page.stockSummary.low}</span>
        <span><strong className="font-display tabular">{totals.out_count}</strong> {t.page.stockSummary.out(totals.out_count)}</span>
        {list.isFetching && <span role="status" className="text-muted-foreground">Actualizando…</span>}
      </div>}

      {(!list.error || items.length > 0) && <SectionCard flush>
        {list.isLoading && items.length === 0 ? (
          <div role="status" className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> Cargando productos…
          </div>
        ) : list.error && items.length === 0 ? null : items.length === 0 ? (
          <EmptyState
            icon={<Package className="h-5 w-5" />}
            title={hasActiveFilters ? t.page.noResults : t.page.empty}
            hint={
              hasActiveFilters
                ? "Prueba con otros filtros o limpia la búsqueda."
                : "Empieza agregando tu primer producto."
            }
            action={
              hasActiveFilters ? (
                <Button variant="outline" size="sm" onClick={clearAllFilters}>
                  <XIcon className="h-4 w-4 mr-1" />
                  Limpiar filtros
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh className="w-12 pl-5"><span className="sr-only">Foto</span></DataTableTh>
              <SortableHeader
                label="Producto"
                column="name"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label="Categoría"
                column="category"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label="Precio"
                column="price"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <SortableHeader
                label="Existencias"
                column="stock"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <DataTableTh>Estado</DataTableTh>
              <DataTableTh className="w-20 text-right pr-5"><span className="sr-only">Acciones</span></DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {items.map((p) => (
                <DataTableRow
                  key={p.id}
                  // Click anywhere on the row is a mouse shortcut for «Editar»;
                  // keyboard and screen readers use the named button on the
                  // product name, so the row is not a second control.
                  onClick={canEditProducts ? () => setEditing(p) : undefined}
                  className={cn("group", !p.active && "opacity-60")}
                >
                  <DataTableCell className="w-12 pl-5">
                    {/* Products are not people: a photo or a package icon,
                        never initials. */}
                    <div className="h-11 w-10 rounded-md border border-border bg-muted flex items-center justify-center overflow-hidden relative">
                      <Package aria-hidden="true" className="h-4 w-4 text-muted-foreground" />
                      <ProductPhoto
                        productId={p.id}
                        imageUrl={p.image_url}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    {canEditProducts ? (
                      <button
                        type="button"
                        onClick={(e) => { e.stopPropagation(); setEditing(p); }}
                        aria-label={t.page.rowEditLabel(p.name)}
                        className="rounded text-left font-semibold text-foreground underline-offset-4 decoration-muted-foreground/40 group-hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                      >
                        {p.name}
                      </button>
                    ) : (
                      <span className="font-semibold text-foreground">{p.name}</span>
                    )}
                  </DataTableCell>
                  <DataTableCell className="text-muted-foreground">{p.category}</DataTableCell>
                  <DataTableCell className="text-right tabular font-medium text-foreground">
                    {formatMoney(p.price)}
                  </DataTableCell>
                  <DataTableCell className={cn("text-right tabular", stockColorClass(p))}>
                    <span className="font-semibold">{p.stock}</span>
                    {p.stock_minimum > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">/ {p.stock_minimum}</span>
                    )}
                  </DataTableCell>
                  <DataTableCell>
                    {p.active ? (
                      stockBadge(p)
                    ) : (
                      <Badge variant="outline">{t.page.badges.inactive}</Badge>
                    )}
                  </DataTableCell>
                  <DataTableCell className="text-right pr-3">
                    {p.active && canAdjust && (
                      <Button
                        requiresWrite
                        variant="ghost"
                        size="icon"
                        onClick={(e) => { e.stopPropagation(); setAdjusting(p); }}
                        title={t.page.rowAdjust}
                        aria-label={t.page.rowAdjustLabel(p.name)}
                      >
                        <PackagePlus aria-hidden="true" />
                      </Button>
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>}

      {isOwner && list.data && !list.error && <details className="group border-t pt-2">
        <summary className="min-h-11 flex items-center cursor-pointer text-sm font-medium"><ChevronDown aria-hidden="true" className="mr-2 h-4 w-4 -rotate-90 transition-transform group-open:rotate-0" />Ver valor y ganancia del inventario</summary>
        <dl className="flex flex-wrap gap-x-8 gap-y-3 py-3 text-sm">
          <div><dt className="text-muted-foreground">Valor de venta de las existencias</dt><dd className="font-semibold tabular-nums">{money.fmt(totals.total_value)}</dd></div>
          {showMargins && <div><dt className="text-muted-foreground">Ganancia potencial, aún sin vender</dt><dd className="font-semibold tabular-nums">{money.fmt(totals.potential_profit)}</dd>
            {totals.products_with_cost < totals.products_total && <p className="text-muted-foreground">{t.page.margin.coverage(totals.products_with_cost, totals.products_total)}</p>}
          </div>}
        </dl>
      </details>}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((n) => Math.max(1, n - 1))}
            disabled={page <= 1 || list.isFetching}
            className="rounded-md"
          >
            Anterior
          </Button>
          <span className="text-sm px-3 tabular">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
            disabled={page >= totalPages || list.isFetching}
            className="rounded-md"
          >
            Siguiente
          </Button>
        </div>
      )}

      </>}
      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        knownCategories={knownCategories}
      />
      <EditDialog
        product={editing}
        showMargins={showMargins}
        knownCategories={knownCategories}
        onClose={() => setEditing(null)}
        onAskDeactivate={(p) => {
          setEditing(null);
          setConfirmDeactivate(p);
        }}
        onAskReactivate={() => setEditing(null)}
        onCaptureCost={(p) => {
          setEditing(null);
          openPurchase(p);
        }}
      />
      <AdjustStockModal
        product={adjusting}
        open={!!adjusting}
        onOpenChange={(o) => !o && setAdjusting(null)}
      />
      <DeactivateConfirm
        product={confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
      />
    </PageContainer>
  );
}

function CreateDialog({
  open,
  onOpenChange,
  knownCategories,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
  knownCategories: string[];
}) {
  const create = useCreateProduct();
  const [serverError, setServerError] = useState<string | null>(null);
  const [resetKey, setResetKey] = useState(0);

  function handleClose(o: boolean) {
    if (!o) setServerError(null);
    onOpenChange(o);
  }

  async function submit(payload: ProductFormSubmitPayload) {
    setServerError(null);
    try {
      const created = await create.mutateAsync({
        name: payload.values.name,
        category: payload.values.category,
        price: payload.values.price,
        initial_stock: payload.values.initial_stock,
        stock_minimum: payload.values.stock_minimum,
        initial_cost: payload.values.initial_cost,
        initial_is_purchase: payload.values.initial_is_purchase,
        image_url: payload.values.image_url,
      });
      toast.success(t.form.success.created(created.name));
      if (payload.addAnother) {
        setResetKey((n) => n + 1);
      } else {
        handleClose(false);
      }
    } catch (e) {
      if (e instanceof ApiError) {
        setServerError(e.message || t.form.errors.generic);
      } else {
        setServerError(t.form.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.form.titleNew}</DialogTitle>
        </DialogHeader>
        {/* La validación de nombre duplicado sólo ve lo ya sincronizado a
            esta laptop — con sync atrasado avisamos ANTES de capturar. */}
        <SyncStaleHint noun="un producto" />
        <ProductForm
          key={resetKey}
          mode="create"
          knownCategories={knownCategories}
          submitting={create.isPending}
          onSubmit={submit}
          onCancel={() => handleClose(false)}
          serverError={serverError}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({
  product,
  showMargins,
  knownCategories,
  onClose,
  onAskDeactivate,
  onAskReactivate,
  onCaptureCost,
}: {
  product: Product | null;
  showMargins: boolean;
  knownCategories: string[];
  onClose(): void;
  onAskDeactivate(p: Product): void;
  onAskReactivate(p: Product): void;
  onCaptureCost(p: Product): void;
}) {
  const update = useUpdateProduct(product?.id ?? "");
  const reactivate = useReactivateProduct();
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(payload: ProductFormSubmitPayload) {
    if (!product) return;
    setServerError(null);
    try {
      await update.mutateAsync({
        name: payload.values.name,
        category: payload.values.category,
        price: payload.values.price,
        stock_minimum: payload.values.stock_minimum,
        image_url: payload.values.image_url,
      });
      toast.success(t.form.success.updated);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        setServerError(e.message || t.form.errors.generic);
      } else {
        setServerError(t.form.errors.generic);
      }
    }
  }

  async function handleReactivate() {
    if (!product) return;
    try {
      await reactivate.mutateAsync(product.id);
      toast.success(t.form.success.updated);
      onAskReactivate(product);
    } catch {
      toast.error(t.form.errors.generic);
    }
  }

  return (
    <Dialog
      open={!!product}
      onOpenChange={(o) => {
        if (!o) {
          setServerError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-lg max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.form.titleEdit}</DialogTitle>
        </DialogHeader>
        <SyncStaleHint noun="un producto" />
        {product && (
          <>
            <ProductForm
              mode="edit"
              productId={product.id}
              initial={{
                name: product.name,
                category: product.category,
                price: String(product.price),
                stock: String(product.stock),
                stock_minimum: String(product.stock_minimum),
                image_url: product.image_url ?? "",
              }}
              knownCategories={knownCategories}
              submitting={update.isPending}
              onSubmit={submit}
              onCancel={onClose}
              serverError={serverError}
            />
            <ProductMarginLine
              product={product}
              showMargins={showMargins}
              onCaptureCost={() => onCaptureCost(product)}
            />
            <div className="flex justify-between border-t pt-4 mt-2">
              {product.active ? (
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-destructive hover:text-destructive"
                  onClick={() => onAskDeactivate(product)}
                >
                  <BadgeMinus className="h-4 w-4" />
                  {t.page.rowDeactivate}
                </Button>
              ) : (
                <Button requiresWrite
                  variant="ghost"
                  size="sm"
                  onClick={handleReactivate}
                  disabled={reactivate.isPending}
                >
                  <BadgePlus className="h-4 w-4" />
                  {t.page.rowReactivate}
                </Button>
              )}
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ProductMarginLine — "Costo promedio · Precio · Margen (d%)" en la ficha.
// Cuando el producto no tiene costo capturado muestra un enlace para
// capturarlo al resurtir (abre AdjustStockModal vía onCaptureCost). Respeta
// el ojo de visibilidad de dinero. El % se calcula client-side a partir del
// costo y precio; el monto del margen sí se enmascara.
function ProductMarginLine({
  product,
  showMargins,
  onCaptureCost,
}: {
  product: Product;
  showMargins: boolean;
  onCaptureCost(): void;
}) {
  const money = useMoneyVisibility();
  const cost = product.avg_unit_cost;
  if (!showMargins) return null;
  const hasCost = typeof cost === "number";
  if (!hasCost) {
    return (
      <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
        <p className="mb-1 text-xs font-medium text-muted-foreground">
          {t.form.margin.heading}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-muted-foreground">
            {t.form.margin.noCost}
          </span>
          <button
            type="button"
            onClick={onCaptureCost}
            className="min-h-11 font-medium text-primary hover:underline"
          >
            {t.form.margin.captureCost}
          </button>
        </div>
      </div>
    );
  }
  const unitCost = cost as number;
  const margin = product.price - unitCost;
  const marginPct = product.price > 0 ? (margin / product.price) * 100 : null;
  return (
    <div className="rounded-lg border border-border bg-muted/40 p-3 text-sm">
      <p className="mb-1 text-xs font-medium text-muted-foreground">
        {t.form.margin.heading}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular">
        <span className="text-muted-foreground">
          {t.form.margin.cost} {money.fmt(unitCost)}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">·</span>
        <span className="text-muted-foreground">
          {t.form.margin.price} {money.fmt(product.price)}
        </span>
        <span aria-hidden="true" className="text-muted-foreground">·</span>
        <span className="font-semibold text-success-text">
          {t.form.margin.marginLabel} {money.fmt(margin)}
          {marginPct != null && !money.hidden
            ? ` (${marginPct.toFixed(0)}%)`
            : ""}
        </span>
      </div>
    </div>
  );
}

function DeactivateConfirm({ product, onClose }: { product: Product | null; onClose(): void }) {
  const deactivate = useDeactivateProduct();

  async function confirm() {
    if (!product) return;
    try {
      await deactivate.mutateAsync(product.id);
      toast.success(t.form.success.updated);
      onClose();
    } catch {
      toast.error(t.form.errors.generic);
    }
  }

  return (
    <AlertDialog open={!!product} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {product ? t.page.deactivateConfirm.title(product.name) : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>{t.page.deactivateConfirm.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deactivate.isPending}>{common.cancel}</AlertDialogCancel>
          <AlertDialogAction requiresWrite
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={deactivate.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deactivate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.page.deactivateConfirm.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
