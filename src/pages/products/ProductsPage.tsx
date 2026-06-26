import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  Loader2,
  Plus,
  Search,
  BadgeMinus,
  BadgePlus,
  Coins,
  Package,
  PackagePlus,
  PackageX,
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
import { StatCard, StatListCard } from "@/components/shared/StatCard";
import {
  DEFAULT_CATEGORIES,
  stockLevel,
  useCreateProduct,
  useDeactivateProduct,
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
import { useDashboard } from "@/hooks/useReports";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { ApiError } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import { ProductForm, type ProductFormSubmitPayload } from "@/components/products/ProductForm";
import { ProductPhoto } from "@/components/products/ProductPhoto";
import { AdjustStockModal } from "@/components/products/AdjustStockModal";
import { products as t } from "@/strings/products";
import { common } from "@/strings/common";

const PAGE_SIZE = 50;

function stockBadge(p: Product) {
  const level = stockLevel(p);
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
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [category, setCategory] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("active");
  // Hidrata el filtro inicial desde el query param (?low_stock=1) — el KPI
  // "Stock crítico" del reporte navega aquí con ese flag, y queremos que el
  // filtro arranque ya aplicado.
  const [searchParams, setSearchParams] = useSearchParams();
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
  // Ganancia realizada del mes — la calcula el backend de reportes
  // (cross-context products × ventas) y la sirve el dashboard. La reusamos
  // aquí para mostrarla junto a la potencial: la potencial baja al vender,
  // la realizada sube. El endpoint está cacheado 60s, así que es barato.
  const dashboard = useDashboard();
  const realizedMonth = dashboard.data?.realized_profit_month.value ?? 0;
  const realizedCoverage = dashboard.data?.realized_profit_coverage;

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
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={t.page.title}
        subtitle="Catálogo y stock del gym"
        actions={
          <Button
            size="lg"
            onClick={() => setCreateOpen(true)}
            className="h-10 rounded-md font-semibold shadow-sm"
          >
            <Plus className="h-4 w-4 mr-2" />
            {t.page.new}
          </Button>
        }
      />

      {/* Stats — calculadas en backend sobre el filtro completo, no la
          página visible. 4 cards: dos de una cifra (Productos, Valor) y dos
          combinadas (Stock crítico = bajos+agotados; Ganancia = del mes +
          potencial) para no saturar con cards de una sola cifra. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Productos"
          value={total}
          icon={Package}
          tone="neutral"
          hint={hasActiveFilters ? "en el filtro" : "en el catálogo"}
        />
        {/* Stock crítico — junta "stock bajo" y "agotados" (la salud de
            inventario que le importa a recepción) en un solo card. */}
        <StatListCard
          title={t.page.stockHealth.title}
          icon={PackageX}
          tone={
            totals.out_count > 0
              ? "danger"
              : totals.low_count > 0
                ? "warning"
                : "neutral"
          }
          rows={[
            { label: t.page.stockHealth.low, value: totals.low_count },
            { label: t.page.stockHealth.out, value: totals.out_count },
          ]}
          hint={
            totals.low_count === 0 && totals.out_count === 0
              ? t.page.stockHealth.allOk
              : undefined
          }
        />
        <StatCard
          title="Valor de stock"
          value={money.fmt(totals.total_value)}
          icon={PackagePlus}
          tone="success"
          hint="precio venta × existencias"
        />
        {/* Ganancia — del mes (realizada, sube al vender) + potencial sobre
            el stock (baja al vender), sin un "total" que mezcle flujo con
            inventario. El margen % va como chip en la potencial; el hint
            muestra la cobertura honesta cuando faltan costos. */}
        <StatListCard
          title={t.page.margin.cardTitle}
          icon={Coins}
          tone="success"
          rows={[
            {
              label: t.page.margin.monthRow,
              value: money.fmt(realizedMonth),
            },
            {
              label: t.page.margin.potentialRow,
              value: money.fmt(totals.potential_profit),
              chip:
                !money.hidden && totals.margin_pct != null
                  ? `${totals.margin_pct >= 0 ? "+" : ""}${totals.margin_pct.toFixed(0)}%`
                  : undefined,
            },
          ]}
          hint={
            totals.products_with_cost < totals.products_total
              ? t.page.margin.coverage(
                  totals.products_with_cost,
                  totals.products_total
                )
              : undefined
          }
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[280px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.page.searchPlaceholder}
            className="pl-9 pr-9 h-10"
            aria-label={t.page.searchPlaceholder}
          />
          {/* Botón limpiar búsqueda — aparece solo cuando hay texto.
              Patrón estándar de search inputs (Gmail, GitHub, etc); evita
              al operador tener que seleccionar todo + borrar. */}
          {search && (
            <button
              type="button"
              onClick={() => setSearch("")}
              className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-7 w-7 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
              aria-label="Limpiar búsqueda"
              title="Limpiar búsqueda"
            >
              <XIcon className="h-4 w-4" />
            </button>
          )}
        </div>

        <Select value={category || "_all"} onValueChange={(v) => setCategory(v === "_all" ? "" : v)}>
          <SelectTrigger className="h-10 w-[180px]">
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
          <SelectTrigger className="h-10 w-[160px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="active">{t.page.filters.statusActive}</SelectItem>
            <SelectItem value="inactive">{t.page.filters.statusInactive}</SelectItem>
            <SelectItem value="all">{t.page.filters.statusAll}</SelectItem>
          </SelectContent>
        </Select>

        <label className="flex items-center gap-2 cursor-pointer h-10 px-3 rounded-md border border-input hover:bg-muted">
          <Switch checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
          <span className="text-sm whitespace-nowrap">{t.page.filters.lowStockOnly}</span>
        </label>
      </div>

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.errors.loadList}</AlertDescription>
        </Alert>
      )}

      <SectionCard flush>
        {list.isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
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
              <DataTableTh className="w-12 pl-5" />
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
                label="Stock"
                column="stock"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
              <DataTableTh>Estado</DataTableTh>
              <DataTableTh className="w-24 text-right pr-5">Acciones</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {items.map((p) => (
                <DataTableRow
                  key={p.id}
                  onClick={() => setEditing(p)}
                  // Keyboard a11y: la fila completa funciona como botón.
                  // Tab la enfoca; Enter / Space disparan "Editar". Sin
                  // esto, los operadores con teclado solo (o screen
                  // readers) no podían interactuar con la tabla.
                  role="button"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setEditing(p);
                    }
                  }}
                  aria-label={`Editar ${p.name}`}
                  className={cn(
                    "group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1",
                    !p.active && "opacity-60"
                  )}
                >
                  <DataTableCell className="w-12 pl-5">
                    <div className="h-10 w-10 rounded-md border border-border bg-muted flex items-center justify-center overflow-hidden relative">
                      <span className="text-xs font-semibold text-muted-foreground">
                        {p.name.slice(0, 2).toUpperCase()}
                      </span>
                      <ProductPhoto
                        productId={p.id}
                        imageUrl={p.image_url}
                        className="absolute inset-0 h-full w-full object-cover"
                      />
                    </div>
                  </DataTableCell>
                  {/* Nombre — affordance visible para "click para editar":
                      hover muestra underline + cursor pointer. La fila
                      entera también dispara editar al click, esto solo
                      le da pista visual al operador. */}
                  <DataTableCell>
                    <span className="font-semibold text-foreground group-hover:underline underline-offset-4 decoration-muted-foreground/40">
                      {p.name}
                    </span>
                  </DataTableCell>
                  <DataTableCell className="text-muted-foreground">{p.category}</DataTableCell>
                  <DataTableCell className="text-right tabular font-medium text-foreground">
                    {formatMoney(p.price)}
                  </DataTableCell>
                  {/* Stock cell — clickeable cuando el producto está activo:
                      tocar el número abre el modal de ajuste directo. Es la
                      affordance natural ("para cambiar este número, tócalo")
                      y evita exigir que el operador encuentre el botón en
                      hover. stopPropagation evita disparar el row-click de
                      Editar. Keyboard: focusable + Enter/Space dispara ajuste. */}
                  <DataTableCell
                    className={cn("text-right tabular", stockColorClass(p))}
                    onClick={
                      p.active
                        ? (e) => {
                            e.stopPropagation();
                            setAdjusting(p);
                          }
                        : undefined
                    }
                    title={p.active ? t.page.rowAdjust : undefined}
                  >
                    {p.active ? (
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setAdjusting(p);
                        }}
                        onKeyDown={(e) => {
                          // Prevenimos que Enter/Space en este botón
                          // burbujeen al row (que dispararía editar).
                          if (e.key === "Enter" || e.key === " ") {
                            e.stopPropagation();
                          }
                        }}
                        className="font-semibold rounded px-1.5 py-0.5 -mx-1.5 hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors"
                        aria-label={`Ajustar stock de ${p.name}`}
                      >
                        {p.stock}
                      </button>
                    ) : (
                      <span className="font-semibold">{p.stock}</span>
                    )}
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
                  {/* Acciones — solo "Ajustar stock" como botón explícito.
                      Editar se accede via row-click / Enter / click en el
                      nombre (underline en hover). Quitamos el botón
                      Editar que vivía aquí en hover porque competía con
                      Ajustar y era invisible para touch/teclado. */}
                  <DataTableCell
                    className="text-right pr-3"
                    children={
                      <div
                        className="inline-flex items-center gap-1"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.active && (
                          <button
                            type="button"
                            onClick={() => setAdjusting(p)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter" || e.key === " ") {
                                e.stopPropagation();
                              }
                            }}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1 transition-colors"
                            title={t.page.rowAdjust}
                            aria-label={`${t.page.rowAdjust} de ${p.name}`}
                          >
                            <PackagePlus className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    }
                  />
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>

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

      <CreateDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        knownCategories={knownCategories}
      />
      <EditDialog
        product={editing}
        knownCategories={knownCategories}
        onClose={() => setEditing(null)}
        onAskDeactivate={(p) => {
          setEditing(null);
          setConfirmDeactivate(p);
        }}
        onAskReactivate={() => setEditing(null)}
        onCaptureCost={(p) => {
          setEditing(null);
          setAdjusting(p);
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
    </div>
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
        const data = e.details as Record<string, unknown> | null;
        setServerError((data?.exception as string | undefined) || t.form.errors.generic);
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
  knownCategories,
  onClose,
  onAskDeactivate,
  onAskReactivate,
  onCaptureCost,
}: {
  product: Product | null;
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
        const data = e.details as Record<string, unknown> | null;
        setServerError((data?.exception as string | undefined) || t.form.errors.generic);
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
                <Button
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

// ProductMarginLine — "Costo prom · Precio · Margen (d%)" en la ficha.
// Cuando el producto no tiene costo capturado muestra un enlace para
// capturarlo al resurtir (abre AdjustStockModal vía onCaptureCost). Respeta
// el ojo de visibilidad de dinero. El % se calcula client-side a partir del
// costo y precio; el monto del margen sí se enmascara.
function ProductMarginLine({
  product,
  onCaptureCost,
}: {
  product: Product;
  onCaptureCost(): void;
}) {
  const money = useMoneyVisibility();
  const cost = product.avg_unit_cost;
  const hasCost = typeof cost === "number";
  if (!hasCost) {
    return (
      <div className="rounded-lg border border-paper-300 bg-paper-50/60 dark:bg-ink-800/40 p-3 text-sm">
        <p className="text-xs font-medium uppercase tracking-wider text-ink-400 dark:text-ink-300 mb-1">
          {t.form.margin.heading}
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-ink-400 dark:text-ink-300">
            {t.form.margin.noCost}
          </span>
          <button
            type="button"
            onClick={onCaptureCost}
            className="font-medium text-brick-600 dark:text-brick-300 hover:underline"
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
    <div className="rounded-lg border border-paper-300 bg-paper-50/60 dark:bg-ink-800/40 p-3 text-sm">
      <p className="text-xs font-medium uppercase tracking-wider text-ink-400 dark:text-ink-300 mb-1">
        {t.form.margin.heading}
      </p>
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 tabular">
        <span className="text-ink-500 dark:text-ink-300">
          {t.form.margin.cost} {money.fmt(unitCost)}
        </span>
        <span className="text-ink-300">·</span>
        <span className="text-ink-500 dark:text-ink-300">
          {t.form.margin.price} {money.fmt(product.price)}
        </span>
        <span className="text-ink-300">·</span>
        <span className="font-semibold text-moss-700 dark:text-moss-100">
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
          <AlertDialogAction
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
