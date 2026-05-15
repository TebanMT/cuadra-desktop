import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CircleDollarSign,
  Layers,
  Loader2,
  Plus,
  Receipt,
  Search,
  Wallet,
  X as XIcon,
} from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
import { useDebounce } from "@/hooks/useDebounce";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { fmtDate } from "@/lib/dates";
import {
  useCreateExpense,
  useDeleteExpense,
  useExpensesList,
  useUpdateExpense,
  type Expense,
  type ExpenseSortColumn,
  type ListExpensesInput,
  type SortDirection,
} from "@/hooks/useExpenses";
import {
  EXPENSE_CATEGORIES,
  EXPENSE_PAYMENT_METHODS,
  expenses as t,
  type ExpenseCategory,
  type ExpensePaymentMethod,
} from "@/strings/expenses";
import { common } from "@/strings/common";
import { ExpenseForm, type ExpenseFormSubmitPayload } from "@/components/expenses/ExpenseForm";

const PAGE_SIZE = 50;

// firstOfMonth / today — defaults para el filtro de rango. La página
// arranca enseñando el mes en curso porque es el caso 90% del dueño
// "cuánto llevo gastado este mes".
function firstOfMonth(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-01`;
}
function todayStr(): string {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function SortableHeader({
  label,
  column,
  sortBy,
  sortDir,
  onClick,
  align = "left",
}: {
  label: string;
  column: ExpenseSortColumn;
  sortBy: ExpenseSortColumn;
  sortDir: SortDirection;
  onClick: (col: ExpenseSortColumn) => void;
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

export default function ExpensesPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);
  const [from, setFrom] = useState<string>(firstOfMonth());
  const [to, setTo] = useState<string>(todayStr());
  const [category, setCategory] = useState<ExpenseCategory | "">("");
  const [method, setMethod] = useState<ExpensePaymentMethod | "">("");
  const [page, setPage] = useState(1);
  const [sortBy, setSortBy] = useState<ExpenseSortColumn>("date");
  const [sortDir, setSortDir] = useState<SortDirection>("desc");

  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);

  const money = useMoneyVisibility();

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, from, to, category, method, sortBy, sortDir]);

  const toggleSort = (col: ExpenseSortColumn) => {
    if (sortBy === col) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
    } else {
      setSortBy(col);
      // Default desc para fecha y monto, asc para categórica.
      setSortDir(col === "date" || col === "amount" ? "desc" : "asc");
    }
  };

  // Filtros activos comparados contra el default de la página (mes en
  // curso, sin categoría/método/búsqueda). Si todo está en default no
  // mostramos el chip "Limpiar filtros".
  const defaultFrom = firstOfMonth();
  const defaultTo = todayStr();
  const hasActiveFilters =
    !!debouncedSearch ||
    !!category ||
    !!method ||
    from !== defaultFrom ||
    to !== defaultTo;

  const clearAllFilters = () => {
    setSearch("");
    setFrom(defaultFrom);
    setTo(defaultTo);
    setCategory("");
    setMethod("");
  };

  const filters: ListExpensesInput = {
    q: debouncedSearch || undefined,
    category: category || undefined,
    payment_method: method || undefined,
    from: from || undefined,
    to: to || undefined,
    sort: sortBy,
    dir: sortDir,
    page,
    page_size: PAGE_SIZE,
  };

  const list = useExpensesList(filters);
  const items = useMemo(() => list.data?.items ?? [], [list.data]);
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const totals = list.data?.totals ?? {
    total: 0,
    cash_total: 0,
    non_cash_total: 0,
    dominant_category: "",
    dominant_category_total: 0,
  };

  const dominantLabel =
    totals.dominant_category && totals.dominant_category in t.categories
      ? t.categories[totals.dominant_category as ExpenseCategory]
      : t.page.stats.noneDominant;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={t.page.title}
        subtitle={t.page.subtitle}
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

      {/* Stats — sobre el filtro completo, no la página. */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        <StatCard
          title={t.page.stats.total}
          value={money.fmt(totals.total)}
          icon={CircleDollarSign}
          tone={totals.total > 0 ? "danger" : "neutral"}
          hint={`${fmtDate(from)} — ${fmtDate(to)}`}
        />
        <StatCard
          title={t.page.stats.cashVsNonCash}
          value={money.fmt(totals.cash_total)}
          icon={Wallet}
          tone="neutral"
          hint={t.page.stats.nonCashLabel(money.fmt(totals.non_cash_total))}
        />
        <StatCard
          title={t.page.stats.dominant}
          value={dominantLabel}
          icon={Layers}
          tone="neutral"
          hint={totals.dominant_category ? money.fmt(totals.dominant_category_total) : "—"}
        />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[240px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.page.searchPlaceholder}
            className="pl-9 pr-9 h-10"
            aria-label={t.page.searchPlaceholder}
          />
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

        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="from-date">
            {t.page.filters.fromLabel}
          </label>
          <Input
            id="from-date"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-10 w-[150px]"
          />
        </div>
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground" htmlFor="to-date">
            {t.page.filters.toLabel}
          </label>
          <Input
            id="to-date"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-10 w-[150px]"
          />
        </div>

        <Select
          value={category || "_all"}
          onValueChange={(v) => setCategory(v === "_all" ? "" : (v as ExpenseCategory))}
        >
          <SelectTrigger className="h-10 w-[180px]">
            <SelectValue placeholder={t.page.filters.categoryAll} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">{t.page.filters.categoryAll}</SelectItem>
            {EXPENSE_CATEGORIES.map((c) => (
              <SelectItem key={c} value={c}>
                {t.categories[c]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select
          value={method || "_all"}
          onValueChange={(v) => setMethod(v === "_all" ? "" : (v as ExpensePaymentMethod))}
        >
          <SelectTrigger className="h-10 w-[160px]">
            <SelectValue placeholder={t.page.filters.methodAll} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">{t.page.filters.methodAll}</SelectItem>
            {EXPENSE_PAYMENT_METHODS.map((m) => (
              <SelectItem key={m} value={m}>
                {t.methods[m]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
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
            icon={<Receipt className="h-5 w-5" />}
            title={hasActiveFilters ? t.page.noResults : t.page.empty}
            hint={
              hasActiveFilters
                ? "Prueba con otros filtros o limpia la búsqueda."
                : "Empieza registrando tu primer gasto."
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
              <SortableHeader
                label={t.page.columns.date}
                column="date"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label={t.page.columns.category}
                column="category"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <DataTableTh>{t.page.columns.description}</DataTableTh>
              <SortableHeader
                label={t.page.columns.method}
                column="payment_method"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
              />
              <SortableHeader
                label={t.page.columns.amount}
                column="amount"
                sortBy={sortBy}
                sortDir={sortDir}
                onClick={toggleSort}
                align="right"
              />
            </DataTableHead>
            <DataTableBody>
              {items.map((e) => (
                <DataTableRow
                  key={e.id}
                  onClick={() => setEditing(e)}
                  role="button"
                  tabIndex={0}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter" || ev.key === " ") {
                      ev.preventDefault();
                      setEditing(e);
                    }
                  }}
                  aria-label={`Editar gasto del ${fmtDate(e.expense_date)}`}
                  className="group cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-1"
                >
                  <DataTableCell className="pl-5 tabular text-muted-foreground">
                    {fmtDate(e.expense_date)}
                  </DataTableCell>
                  <DataTableCell>
                    <span className="font-semibold text-foreground group-hover:underline underline-offset-4 decoration-muted-foreground/40">
                      {t.categories[e.category]}
                    </span>
                  </DataTableCell>
                  <DataTableCell className="text-muted-foreground">
                    {e.description || "—"}
                  </DataTableCell>
                  <DataTableCell className="text-muted-foreground">
                    {t.methods[e.payment_method]}
                  </DataTableCell>
                  <DataTableCell className="text-right pr-5 tabular font-bold text-foreground">
                    {money.fmt(e.amount)}
                  </DataTableCell>
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

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditDialog
        expense={editing}
        onClose={() => setEditing(null)}
        onAskDelete={(e) => {
          setEditing(null);
          setConfirmDelete(e);
        }}
      />
      <DeleteConfirm
        expense={confirmDelete}
        onClose={() => setConfirmDelete(null)}
      />
    </div>
  );
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const create = useCreateExpense();
  const [serverError, setServerError] = useState<string | null>(null);

  function handleClose(o: boolean) {
    if (!o) setServerError(null);
    onOpenChange(o);
  }

  async function submit(payload: ExpenseFormSubmitPayload) {
    setServerError(null);
    try {
      await create.mutateAsync(payload);
      toast.success(t.form.success.created);
      handleClose(false);
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
        <ExpenseForm
          mode="create"
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
  expense,
  onClose,
  onAskDelete,
}: {
  expense: Expense | null;
  onClose(): void;
  onAskDelete(e: Expense): void;
}) {
  const update = useUpdateExpense(expense?.id ?? "");
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(payload: ExpenseFormSubmitPayload) {
    if (!expense) return;
    setServerError(null);
    try {
      await update.mutateAsync(payload);
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

  return (
    <Dialog
      open={!!expense}
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
        {expense && (
          <>
            <ExpenseForm
              mode="edit"
              initial={{
                expense_date: expense.expense_date,
                amount: String(expense.amount),
                category: expense.category,
                payment_method: expense.payment_method,
                description: expense.description ?? "",
              }}
              submitting={update.isPending}
              onSubmit={submit}
              onCancel={onClose}
              serverError={serverError}
            />
            <div className="flex justify-between border-t pt-4 mt-2">
              <Button
                variant="ghost"
                size="sm"
                className="text-destructive hover:text-destructive"
                onClick={() => onAskDelete(expense)}
              >
                {t.page.rowDelete}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeleteConfirm({ expense, onClose }: { expense: Expense | null; onClose(): void }) {
  const del = useDeleteExpense();

  async function confirm() {
    if (!expense) return;
    try {
      await del.mutateAsync(expense.id);
      toast.success(t.form.success.deleted);
      onClose();
    } catch {
      toast.error(t.form.errors.generic);
    }
  }

  return (
    <AlertDialog open={!!expense} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{t.page.deleteConfirm.title}</AlertDialogTitle>
          <AlertDialogDescription>{t.page.deleteConfirm.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={del.isPending}>{common.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={del.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {del.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.page.deleteConfirm.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
