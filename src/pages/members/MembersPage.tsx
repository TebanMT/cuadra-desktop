import { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  CircleDollarSign,
  DollarSign,
  FileSpreadsheet,
  Loader2,
  MessageSquare,
  MoreVertical,
  Phone,
  Plus,
  Search,
  Users,
  UserX,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberPhotoLightbox } from "@/components/members/MemberPhotoLightbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useMembersList,
  useMemberStatusCounts,
  type MemberListItem,
  type MemberStatusFilter,
  type MemberSort,
  type SortDir,
} from "@/hooks/useMembers";
import { useMembershipTypes } from "@/hooks/useMembershipTypes";
import { useAttentionRequired } from "@/hooks/useReports";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuthStore } from "@/stores/useAuthStore";
import { daysFromToday } from "@/lib/dates";
import { members as t } from "@/strings/members";
import { cn } from "@/lib/utils";
import { StatCard } from "@/components/shared/StatCard";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableTh,
  EmptyState,
  FilterPill,
  PageHeader,
  SectionCard,
} from "@/components/shared/PagePrimitives";

type SortKey = "expiry_asc" | "expiry_desc" | "name_asc" | "name_desc" | "newest" | "oldest";

const SORT_MAP: Record<SortKey, { sort: MemberSort; dir: SortDir; label: keyof typeof t.page.sort }> = {
  expiry_asc: { sort: "expiry", dir: "asc", label: "expiryAsc" },
  expiry_desc: { sort: "expiry", dir: "desc", label: "expiryDesc" },
  name_asc: { sort: "name", dir: "asc", label: "nameAsc" },
  name_desc: { sort: "name", dir: "desc", label: "nameDesc" },
  newest: { sort: "created_at", dir: "desc", label: "newest" },
  oldest: { sort: "created_at", dir: "asc", label: "oldest" },
};

const PAGE_SIZE_KEY = "members:page-size";
const DEFAULT_PAGE_SIZE = 25;
const PAGE_SIZE_OPTIONS = [25, 50, 100];

function readPageSize(): number {
  if (typeof window === "undefined") return DEFAULT_PAGE_SIZE;
  const raw = window.localStorage.getItem(PAGE_SIZE_KEY);
  const n = raw ? parseInt(raw, 10) : NaN;
  return PAGE_SIZE_OPTIONS.includes(n) ? n : DEFAULT_PAGE_SIZE;
}

function persistPageSize(size: number) {
  if (typeof window !== "undefined") window.localStorage.setItem(PAGE_SIZE_KEY, String(size));
}

function fmtMoney(n: number | undefined): string {
  if (n === undefined || n === null) return "—";
  return `$${Number(n).toLocaleString("es-MX", { maximumFractionDigits: 0 })}`;
}

function fmtDayMonth(value: string | undefined): string {
  if (!value) return "—";
  const d = value.includes("T") ? parseISO(value) : parseISO(`${value}T00:00:00`);
  return format(d, "d MMM", { locale: es });
}

// El color del avatar ya no depende del estado de membresía. Es hash
// del nombre — color de identidad, no de status. El estado se comunica
// por el Badge (pill) a la derecha del nombre.
// Lógica vive en `lib/avatar.ts::getAvatarPalette()`.

interface StatusInfo {
  label: string;
  variant: "success" | "warning" | "destructive" | "secondary" | "outline";
  detail: React.ReactNode;
}

function statusInfo(item: MemberListItem): StatusInfo {
  const ms = item.current_membership;
  // daysFromToday tolera undefined → null; sólo úsalo cuando hay expiry.
  const days = ms?.expiry_date ? daysFromToday(ms.expiry_date) : null;
  switch (item.access_status) {
    case "allowed_active":
      return {
        label: "Activo",
        variant: "success",
        detail: ms?.expiry_date ? `Renueva ${fmtDayMonth(ms.expiry_date)}` : "—",
      };
    case "allowed_expiring_soon": {
      const n = days ?? 0;
      return {
        label: "Por vencer",
        variant: "warning",
        detail: n === 0 ? "Vence hoy" : n === 1 ? "Vence mañana" : `Vence en ${n} días`,
      };
    }
    case "denied_expired": {
      const n = Math.abs(days ?? 0);
      return {
        label: "Vencido",
        variant: "destructive",
        detail: n === 0 ? "Vence hoy" : n === 1 ? "1 día vencido" : `${n} días vencido`,
      };
    }
    case "denied_unpaid_enrollment":
      // Socio inscrito sin primer pago — la membresía existe en
      // pending_payment. Mismo bucket visual que vencidos (acción:
      // cobrar) pero con copy distinta para que el operador entienda.
      return {
        label: "Sin primer pago",
        variant: "destructive",
        detail: "Cobrar para activar",
      };
    case "denied_no_membership":
      return { label: "Sin plan", variant: "outline", detail: "Aún no se ha cobrado" };
    case "denied_inactive":
      return { label: "Inactivo", variant: "secondary", detail: "Dado de baja" };
  }
}

export default function MembersPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>("");
  const [planFilter, setPlanFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("expiry_asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(readPageSize());

  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = role === "owner";

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, planFilter, sortKey, pageSize]);

  const sortCfg = SORT_MAP[sortKey];

  const list = useMembersList({
    q: debouncedSearch || undefined,
    status: statusFilter || undefined,
    plan_id: planFilter || undefined,
    sort: sortCfg.sort,
    dir: sortCfg.dir,
    page,
    page_size: pageSize,
  });

  const counts = useMemberStatusCounts();
  const types = useMembershipTypes(false);
  // Deuda por socio para el chip "Debe $X" de la fila. Sale de la lista
  // de deudores de Atención requerida (completa, no paginada) — el
  // listado de socios no trae este dato y agregarlo ahí cruzaría bounded
  // contexts (members consultando payments); el join se hace aquí.
  const attention = useAttentionRequired();
  const debtByMember = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of attention.data?.pending_balance ?? []) {
      map.set(d.member_id, d.balance);
    }
    return map;
  }, [attention.data]);

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const from = total === 0 ? 0 : (page - 1) * pageSize + 1;
  const to = Math.min(page * pageSize, total);

  const planMap = useMemo(() => {
    const map: Record<string, string> = {};
    (types.data ?? []).forEach((p) => (map[p.id] = p.name));
    return map;
  }, [types.data]);

  function changePageSize(newSize: number) {
    setPageSize(newSize);
    persistPageSize(newSize);
  }

  const hasFilters = !!(debouncedSearch || statusFilter || planFilter);

  // Estimated revenue at risk = sum of overdue + expiring_soon current_membership prices
  // (we don't have it from API, fallback to count-based)
  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title="Socios"
        subtitle="Base de datos de socios del gym"
        actions={
          <>
            {isOwner && (
              <Button
                size="lg"
                variant="outline"
                onClick={() => navigate("/members/import")}
                className="h-10 rounded-md font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {t.import.cta.importFromExcel}
              </Button>
            )}
            <Button
              size="lg"
              onClick={() => navigate("/members/new")}
              className="h-10 rounded-md font-semibold shadow-sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo socio
            </Button>
          </>
        }
      />

      {/* Stats */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Total socios"
          value={counts.data?.total ?? "—"}
          icon={Users}
          tone="neutral"
          hint="todos los registrados"
        />
        <StatCard
          title="Activos"
          value={counts.data?.active ?? "—"}
          icon={Users}
          tone="success"
          hint="con membresía vigente"
        />
        <StatCard
          title="Por vencer"
          value={counts.data?.expiring_soon ?? "—"}
          icon={CircleDollarSign}
          tone={counts.data && counts.data.expiring_soon > 0 ? "warning" : "neutral"}
          hint="próximos 7 días"
        />
        <StatCard
          title="Vencidos"
          value={counts.data?.expired ?? "—"}
          icon={UserX}
          tone={counts.data && counts.data.expired > 0 ? "danger" : "neutral"}
          hint="por recuperar"
        />
      </div>

      {/* Filters / search */}
      <div className="flex flex-wrap gap-3">
        <FilterPill
          label="Todos"
          count={counts.data?.total}
          active={statusFilter === ""}
          onClick={() => setStatusFilter("")}
        />
        <FilterPill
          label="Activos"
          count={counts.data?.active}
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
        />
        <FilterPill
          label="Por vencer"
          count={counts.data?.expiring_soon}
          active={statusFilter === "expiring_soon"}
          onClick={() => setStatusFilter("expiring_soon")}
        />
        <FilterPill
          label="Vencidos"
          count={counts.data?.expired}
          active={statusFilter === "expired"}
          onClick={() => setStatusFilter("expired")}
        />
        <FilterPill
          label="Inactivos"
          count={counts.data?.inactive}
          active={statusFilter === "inactive"}
          onClick={() => setStatusFilter("inactive")}
        />
      </div>

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[280px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nombre, folio o teléfono…"
            className="pl-9 h-10"
            aria-label="Buscar socio"
          />
        </div>

        <Select value={planFilter || "_all"} onValueChange={(v) => setPlanFilter(v === "_all" ? "" : v)}>
          <SelectTrigger className="h-10 w-[180px]">
            <SelectValue placeholder="Todos los planes" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todos los planes</SelectItem>
            {(types.data ?? []).map((p) => (
              <SelectItem key={p.id} value={p.id}>
                {p.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>

        <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
          <SelectTrigger className="h-10 w-[200px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_MAP) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {t.page.sort[SORT_MAP[key].label]}
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

      {/* Table */}
      <SectionCard flush>
        {list.isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={hasFilters ? <Search className="h-5 w-5" /> : <AlertTriangle className="h-5 w-5" />}
            title={hasFilters ? "Sin resultados" : "Aún no hay socios"}
            hint={
              hasFilters
                ? "Prueba con otro nombre, folio o teléfono."
                : "Empieza registrando tu primer socio."
            }
            action={
              !hasFilters && (
                <Button onClick={() => navigate("/members/new")} className="rounded-md">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo socio
                </Button>
              )
            }
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh className="w-12" />
              <DataTableTh>Socio</DataTableTh>
              <DataTableTh>Plan</DataTableTh>
              <DataTableTh>Vencimiento</DataTableTh>
              <DataTableTh>Estado</DataTableTh>
              <DataTableTh className="w-32 text-right pr-5">Acciones</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {items.map((it) => (
                <MemberRow
                  key={it.member.id}
                  item={it}
                  onClick={() => navigate(`/members/${it.member.id}`)}
                  planMap={planMap}
                  debt={debtByMember.get(it.member.id) ?? 0}
                />
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>

      {/* Pagination */}
      {items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <Select value={String(pageSize)} onValueChange={(v) => changePageSize(parseInt(v, 10))}>
              <SelectTrigger className="h-8 w-[80px]">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {PAGE_SIZE_OPTIONS.map((s) => (
                  <SelectItem key={s} value={String(s)}>
                    {s}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <span className="tabular">
              Mostrando {from}–{to} de {total}
            </span>
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || list.isFetching}
              aria-label="Anterior"
              className="h-8 w-8 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <span className="text-sm tabular px-2">
              {page} / {totalPages}
            </span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || list.isFetching}
              aria-label="Siguiente"
              className="h-8 w-8 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </div>
  );
}

interface MemberRowProps {
  item: MemberListItem;
  onClick(): void;
  planMap: Record<string, string>;
  debt: number;
}

function MemberRow({ item, onClick, debt }: MemberRowProps) {
  const m = item.member;
  const ms = item.current_membership;
  const status = statusInfo(item);
  const money = useMoneyVisibility();
  const showPay =
    item.access_status === "denied_expired" ||
    item.access_status === "denied_unpaid_enrollment" ||
    item.access_status === "allowed_expiring_soon";

  return (
    <DataTableRow onClick={onClick} className="group">
      {/* Avatar — clic abre lightbox con la foto en grande sin navegar
          al detalle (stopPropagation evita el row-click). El color del
          fallback sigue siendo por hash del nombre, NO por estado. */}
      <DataTableCell className="w-12 pl-5 pr-0">
        <MemberPhotoLightbox
          memberId={m.id}
          fullName={m.full_name}
          avatarClassName="h-10 w-10"
          fallbackClassName="text-xs"
          stopPropagation
        />
      </DataTableCell>

      {/* Member */}
      <DataTableCell>
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-foreground">{m.full_name}</span>
          <span className="font-mono text-xs text-muted-foreground tabular">
            #{m.folio}
          </span>
          {/* Chip sólo cuando debe — una columna "Saldo" mostraría "—"
              para el 95% de los socios. Mismo lenguaje visual que el chip
              del POS; el clic del row lleva al perfil, donde vive Abonar. */}
          {debt > 0 && (
            <span className="inline-flex items-center gap-1 rounded-full bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100 px-2 py-0.5 text-xs font-medium tabular">
              <Wallet className="h-3 w-3" />
              {money.mask(`Debe ${fmtMoney(debt)}`)}
            </span>
          )}
        </div>
        {m.phone && (
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Phone className="h-3 w-3" />
            <span className="tabular">{m.phone}</span>
          </div>
        )}
      </DataTableCell>

      {/* Plan */}
      <DataTableCell>
        {ms ? (
          <span className="text-sm text-foreground">{ms.type_name}</span>
        ) : (
          <span className="text-xs text-muted-foreground">Sin plan</span>
        )}
        {ms && (
          <div className="text-xs text-muted-foreground mt-0.5 tabular">
            {money.mask(fmtMoney(ms.price))}
          </div>
        )}
      </DataTableCell>

      {/* Expiry */}
      <DataTableCell>
        <div className="text-sm text-foreground tabular">
          {ms ? fmtDayMonth(ms.expiry_date) : "—"}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{status.detail}</div>
      </DataTableCell>

      {/* Status */}
      <DataTableCell>
        <Badge variant={status.variant}>{status.label}</Badge>
      </DataTableCell>

      {/* Actions */}
      <DataTableCell className="text-right pr-3">
        <div
          className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          {m.phone && (
            <a
              href={`https://wa.me/${m.phone.replace(/[^0-9]/g, "")}`}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-success/10 hover:text-success transition-colors"
              title="WhatsApp"
            >
              <MessageSquare className="h-4 w-4" />
            </a>
          )}
          {showPay && (
            <button
              type="button"
              onClick={onClick}
              className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-primary/10 hover:text-primary transition-colors"
              title="Cobrar"
              aria-label="Cobrar"
            >
              <DollarSign className="h-4 w-4" />
            </button>
          )}
          <button
            type="button"
            onClick={onClick}
            className="inline-flex items-center justify-center h-8 w-8 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
            title="Ver detalle"
            aria-label="Ver detalle"
          >
            <MoreVertical className="h-4 w-4" />
          </button>
        </div>
      </DataTableCell>
    </DataTableRow>
  );
}
