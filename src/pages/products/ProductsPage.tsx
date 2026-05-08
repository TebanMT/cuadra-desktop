import { useEffect, useMemo, useState } from "react";
import {
  Loader2,
  Plus,
  Search,
  Pencil,
  BadgeMinus,
  BadgePlus,
  Package,
  PackageOpen,
  PackagePlus,
  PackageX,
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
import { StatCard } from "@/components/shared/StatCard";
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
  type ProductStatusFilter,
  type UpsertProductInput,
} from "@/hooks/useProducts";
import { useDebounce } from "@/hooks/useDebounce";
import { ApiError } from "@/lib/api";
import { cn, formatMoney } from "@/lib/utils";
import { ProductForm, type ProductFormSubmitPayload } from "@/components/products/ProductForm";
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

export default function ProductsPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [category, setCategory] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>("active");
  const [lowStockOnly, setLowStockOnly] = useState(false);
  const [page, setPage] = useState(1);

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Product | null>(null);
  const [adjusting, setAdjusting] = useState<Product | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Product | null>(null);

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, category, statusFilter, lowStockOnly]);

  const filters: ListProductsInput = {
    q: debouncedSearch || undefined,
    category: category || undefined,
    status: statusFilter,
    low_stock: lowStockOnly || undefined,
    page,
    page_size: PAGE_SIZE,
  };

  const list = useProductsList(filters);
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  const knownCategories = useMemo(() => {
    const set = new Set<string>(DEFAULT_CATEGORIES);
    items.forEach((p) => set.add(p.category));
    return Array.from(set);
  }, [items]);

  const lowCount = items.filter((p) => p.active && stockLevel(p) === "low").length;
  const outCount = items.filter((p) => p.active && stockLevel(p) === "out").length;
  const totalValue = items
    .filter((p) => p.active)
    .reduce((acc, p) => acc + p.price * p.stock, 0);

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

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Productos"
          value={total || items.length}
          icon={Package}
          tone="neutral"
          hint="catálogo activo"
        />
        <StatCard
          title="Stock bajo"
          value={lowCount}
          icon={PackageOpen}
          tone={lowCount > 0 ? "warning" : "neutral"}
          hint="por debajo del mínimo"
        />
        <StatCard
          title="Agotados"
          value={outCount}
          icon={PackageX}
          tone={outCount > 0 ? "danger" : "neutral"}
          hint="sin existencias"
        />
        <StatCard
          title="Valor de stock"
          value={formatMoney(totalValue)}
          icon={PackagePlus}
          tone="success"
          hint="precio venta × existencias"
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[280px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.page.searchPlaceholder}
            className="pl-9 h-10"
            aria-label={t.page.searchPlaceholder}
          />
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
            title={debouncedSearch || category || lowStockOnly ? t.page.noResults : t.page.empty}
            hint={
              !debouncedSearch && !category && !lowStockOnly
                ? "Empezá agregando tu primer producto."
                : undefined
            }
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh className="w-12 pl-5" />
              <DataTableTh>Producto</DataTableTh>
              <DataTableTh>Categoría</DataTableTh>
              <DataTableTh className="text-right">Precio</DataTableTh>
              <DataTableTh className="text-right">Stock</DataTableTh>
              <DataTableTh>Estado</DataTableTh>
              <DataTableTh className="w-32 text-right pr-5">Acciones</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {items.map((p) => (
                <DataTableRow
                  key={p.id}
                  onClick={() => setEditing(p)}
                  className={cn("group", !p.active && "opacity-60")}
                >
                  <DataTableCell className="w-12 pl-5">
                    <div className="h-10 w-10 rounded-md border border-border bg-muted flex items-center justify-center overflow-hidden">
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-semibold text-muted-foreground">
                          {p.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <span className="font-semibold text-foreground">{p.name}</span>
                  </DataTableCell>
                  <DataTableCell className="text-muted-foreground">{p.category}</DataTableCell>
                  <DataTableCell className="text-right tabular font-medium text-foreground">
                    {formatMoney(p.price)}
                  </DataTableCell>
                  <DataTableCell className={cn("text-right tabular", stockColorClass(p))}>
                    <span className="font-semibold">{p.stock}</span>
                    {p.min_stock > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">/ {p.min_stock}</span>
                    )}
                  </DataTableCell>
                  <DataTableCell>
                    {p.active ? (
                      stockBadge(p)
                    ) : (
                      <Badge variant="outline">{t.page.badges.inactive}</Badge>
                    )}
                  </DataTableCell>
                  <DataTableCell
                    className="text-right pr-3"
                    children={
                      <div
                        className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                        onClick={(e) => e.stopPropagation()}
                      >
                        {p.active && (
                          <button
                            type="button"
                            onClick={() => setAdjusting(p)}
                            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
                            title={t.page.rowAdjust}
                            aria-label={t.page.rowAdjust}
                          >
                            <PackagePlus className="h-4 w-4" />
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => setEditing(p)}
                          className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                          title={t.page.rowEdit}
                          aria-label={t.page.rowEdit}
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
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
      const input: UpsertProductInput = payload.values;
      const created = await create.mutateAsync(input);
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
}: {
  product: Product | null;
  knownCategories: string[];
  onClose(): void;
  onAskDeactivate(p: Product): void;
  onAskReactivate(p: Product): void;
}) {
  const update = useUpdateProduct(product?.id ?? "");
  const reactivate = useReactivateProduct();
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(payload: ProductFormSubmitPayload) {
    if (!product) return;
    setServerError(null);
    try {
      await update.mutateAsync(payload.values);
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
              initial={{
                name: product.name,
                category: product.category,
                price: String(product.price),
                stock: String(product.stock),
                min_stock: String(product.min_stock),
                photo_url: product.photo_url ?? "",
              }}
              knownCategories={knownCategories}
              submitting={update.isPending}
              onSubmit={submit}
              onCancel={onClose}
              serverError={serverError}
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
