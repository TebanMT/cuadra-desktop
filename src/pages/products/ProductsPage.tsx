import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, Pencil, BadgeMinus, BadgePlus, PackagePlus } from "lucide-react";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
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

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold tracking-tight">{t.page.title}</h1>
        <Button size="lg" onClick={() => setCreateOpen(true)}>
          <Plus className="h-4 w-4 mr-2" />
          {t.page.new}
        </Button>
      </div>

      <div className="space-y-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.page.searchPlaceholder}
            className="pl-9"
            aria-label={t.page.searchPlaceholder}
          />
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{t.page.filters.categoryLabel}:</span>
            <Select value={category || "_all"} onValueChange={(v) => setCategory(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[180px]">
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
          </div>

          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{t.page.filters.statusLabel}:</span>
            <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as ProductStatusFilter)}>
              <SelectTrigger className="h-9 w-[180px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="active">{t.page.filters.statusActive}</SelectItem>
                <SelectItem value="inactive">{t.page.filters.statusInactive}</SelectItem>
                <SelectItem value="all">{t.page.filters.statusAll}</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer">
            <Switch checked={lowStockOnly} onCheckedChange={setLowStockOnly} />
            <span className="text-sm">{t.page.filters.lowStockOnly}</span>
          </label>
        </div>
      </div>

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.errors.loadList}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-md border bg-background">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-16" />
              <TableHead>{t.page.columns.name}</TableHead>
              <TableHead>{t.page.columns.category}</TableHead>
              <TableHead className="text-right">{t.page.columns.price}</TableHead>
              <TableHead className="text-right">{t.page.columns.stock}</TableHead>
              <TableHead>{t.page.columns.status}</TableHead>
              <TableHead className="w-48 text-right">{t.page.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline-block" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                  {debouncedSearch || category || lowStockOnly
                    ? t.page.noResults
                    : t.page.empty}
                </TableCell>
              </TableRow>
            ) : (
              items.map((p) => (
                <TableRow
                  key={p.id}
                  className={cn("cursor-pointer group", !p.active && "opacity-60")}
                  onClick={() => setEditing(p)}
                >
                  <TableCell>
                    <div className="h-9 w-9 rounded-md border bg-muted flex items-center justify-center overflow-hidden">
                      {p.photo_url ? (
                        <img src={p.photo_url} alt="" className="h-full w-full object-cover" />
                      ) : (
                        <span className="text-xs font-medium text-muted-foreground">
                          {p.name.slice(0, 2).toUpperCase()}
                        </span>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell className="text-muted-foreground">{p.category}</TableCell>
                  <TableCell className="text-right tabular-nums">{formatMoney(p.price)}</TableCell>
                  <TableCell className={cn("text-right tabular-nums", stockColorClass(p))}>
                    {p.stock}
                    {p.min_stock > 0 && (
                      <span className="ml-1 text-xs text-muted-foreground">/ {p.min_stock}</span>
                    )}
                  </TableCell>
                  <TableCell>{p.active ? stockBadge(p) : <Badge variant="outline">{t.page.badges.inactive}</Badge>}</TableCell>
                  <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                    <div className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {p.active && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setAdjusting(p)}
                        >
                          <PackagePlus className="h-4 w-4" />
                          {t.page.rowAdjust}
                        </Button>
                      )}
                      <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                        <Pencil className="h-4 w-4" />
                        {t.page.rowEdit}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((n) => Math.max(1, n - 1))}
            disabled={page <= 1 || list.isFetching}
          >
            Anterior
          </Button>
          <span className="text-sm px-3">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((n) => Math.min(totalPages, n + 1))}
            disabled={page >= totalPages || list.isFetching}
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
