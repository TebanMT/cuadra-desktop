import { PageContainer } from "@/components/shared/PagePrimitives";
import { memberView, type MemberView } from "@/lib/memberNavigation";
import { MemberBalances } from "@/components/members/MemberBalances";
import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import {
  AlertTriangle,
  ChevronLeft,
  ChevronRight,
  DollarSign,
  FileSpreadsheet,
  Loader2,
  MessageSquare,
  Phone,
  Plus,
  Search,
  Wallet,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { MemberPhotoLightbox } from "@/components/members/MemberPhotoLightbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  useMembersList,
  useMemberStatusCounts,
  type MemberListItem,
  type MemberSort,
  type SortDir,
} from "@/hooks/useMembers";
import { useMembershipTypes } from "@/hooks/useMembershipTypes";
import { useAttentionRequired } from "@/hooks/useReports";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { useDebounce } from "@/hooks/useDebounce";
import { useAuthStore } from "@/stores/useAuthStore";
import { whatsappUrl } from "@/lib/whatsapp";
import { VigenciaBadge } from "@/components/members/VigenciaBadge";
import { members as t } from "@/strings/members";
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
} from "@/components/shared/PagePrimitives";
import { HelpHint } from "@/components/shared/HelpHint";

type SortKey = "expiry_asc" | "expiry_desc" | "name_asc" | "name_desc" | "newest" | "oldest";

const SORT_MAP: Record<SortKey, { sort: MemberSort; dir: SortDir; label: keyof typeof t.page.sort }> = {
  expiry_asc: { sort: "expiry", dir: "asc", label: "expiryAsc" },
  expiry_desc: { sort: "expiry", dir: "desc", label: "expiryDesc" },
  name_asc: { sort: "name", dir: "asc", label: "nameAsc" },
  name_desc: { sort: "name", dir: "desc", label: "nameDesc" },
  newest: { sort: "created_at", dir: "desc", label: "newest" },
  oldest: { sort: "created_at", dir: "asc", label: "oldest" },
};

// Orden por defecto de cada vista mientras el operador no elija otro.
// - Todos: directorio por nombre. Ordenar por vencimiento ponía primero a
//   todos los socios sin membresía (el motor local ordena los vacíos al
//   principio), una pared de «Sin membresía» sin nada que atender.
// - Activos y Por vencer: el que vence antes, arriba (ahí no hay vacíos).
// - Sin vigencia: el que venció hace menos, arriba; es el más fácil de
//   recuperar. Los vacíos (sin membresía o sin primer pago) quedan al final.
const DEFAULT_SORT: Record<MemberView, SortKey> = {
  "": "name_asc",
  active: "expiry_asc",
  expiring_soon: "expiry_asc",
  lapsed: "expiry_desc",
  no_membership: "name_asc",
  unpaid_enrollment: "name_asc",
  expired: "expiry_desc",
  inactive: "name_asc",
  unrenewed: "name_asc",
  balance: "name_asc",
};

function sortLabel(key: SortKey, view: MemberView): string {
  if ((view === "expired" || view === "lapsed") && key === "expiry_desc") return t.page.sort.expiredRecentFirst;
  if ((view === "expired" || view === "lapsed") && key === "expiry_asc") return t.page.sort.expiredOldestFirst;
  return t.page.sort[SORT_MAP[key].label];
}

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
  return `$${Number(n).toLocaleString("es-MX", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

// La foto identifica a la persona; el estado vive en la columna «Vigencia»,
// con la misma insignia que la búsqueda, la ficha y el cobro.

export default function MembersPage() {
  const [params, setParams] = useSearchParams();
  const search = params.get("q") ?? "";
  function setSearch(value: string) {
    setParams(current => { const next = new URLSearchParams(current); if (value) next.set("q", value); else next.delete("q"); return next; }, { replace: true });
  }
  const debouncedSearch = useDebounce(search, 300);

  const statusFilter = memberView(params);
  const balances = statusFilter === "balance";
  function setStatusFilter(status: MemberView) {
    setParams(current => { const next = new URLSearchParams(current); if (status) next.set("status", status); else next.delete("status"); return next; });
  }
  const [planFilter, setPlanFilter] = useState<string>("");
  // null = el orden por defecto de la vista actual (DEFAULT_SORT). Una
  // elección explícita se respeta al cambiar de filtro.
  const [chosenSort, setChosenSort] = useState<SortKey | null>(null);
  const sortKey = chosenSort ?? DEFAULT_SORT[statusFilter];
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(readPageSize());

  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const readOnly = useAuthStore(s => s.readOnly);
  const isOwner = role === "owner";

  useEffect(() => {
    setPage(1);
  }, [debouncedSearch, statusFilter, planFilter, sortKey, pageSize]);

  const sortCfg = SORT_MAP[sortKey];

  const list = useMembersList({
    q: debouncedSearch || undefined,
    status: statusFilter === "balance" ? undefined : statusFilter || undefined,
    plan_id: planFilter || undefined,
    sort: sortCfg.sort,
    dir: sortCfg.dir,
    page,
    page_size: pageSize,
  }, !balances);

  const counts = useMemberStatusCounts();
  const types = useMembershipTypes(false);
  // Saldos completos del reporte compartido; el
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
    <PageContainer className="space-y-6">
      <PageHeader
        title="Socios"
        actions={
          <>
            <HelpHint topic="buscar-socio" task="buscar un socio y revisar su vigencia" />
            {isOwner && (
              <Button
                size="lg"
                variant="outline"
                disabled={readOnly}
                onClick={() => navigate("/members/import")}
                className="h-11 rounded-md font-semibold"
              >
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {t.import.cta.importFromExcel}
              </Button>
            )}
            <Button
              size="lg"
              disabled={readOnly} onClick={() => navigate("/members/new")}
              className="h-11 rounded-md font-semibold shadow-sm"
            >
              <Plus className="h-4 w-4 mr-2" />
              Nuevo socio
            </Button>
          </>
        }
      />

      <div className="flex flex-wrap gap-3">
        <div className="flex-1 min-w-[280px] max-w-md relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={balances ? "Buscar por nombre o teléfono…" : "Buscar por nombre, folio o teléfono…"}
            className="pl-9 h-11"
            aria-label="Buscar socio"
          />
        </div>

        {!balances && <Select value={planFilter || "_all"} onValueChange={(v) => setPlanFilter(v === "_all" ? "" : v)}>
          <SelectTrigger aria-label="Filtrar por plan" className="h-11 w-[180px]">
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
        </Select>}

        {!balances && <Select value={sortKey} onValueChange={(v) => setChosenSort(v as SortKey)}>
          <SelectTrigger aria-label="Ordenar socios" className="h-11 w-[220px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(SORT_MAP) as SortKey[]).map((key) => (
              <SelectItem key={key} value={key}>
                {sortLabel(key, statusFilter)}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>}
      </div>

      <div className="flex flex-wrap gap-3">
        <FilterPill
          label={t.page.states.all}
          count={counts.data?.total}
          active={statusFilter === ""}
          onClick={() => setStatusFilter("")}
        />
        <FilterPill
          label={t.page.states.active}
          count={counts.data?.active}
          active={statusFilter === "active"}
          onClick={() => setStatusFilter("active")}
        />
        <FilterPill
          label={t.page.states.expiringSoon}
          count={counts.data?.expiring_soon}
          active={statusFilter === "expiring_soon"}
          onClick={() => setStatusFilter("expiring_soon")}
        />
        <FilterPill
          label={t.page.states.lapsed}
          count={counts.data?.lapsed}
          active={statusFilter === "lapsed"}
          onClick={() => setStatusFilter("lapsed")}
        />
        <FilterPill
          label={t.page.states.noMembership}
          count={counts.data?.no_membership}
          active={statusFilter === "no_membership"}
          onClick={() => setStatusFilter("no_membership")}
        />
        <details className="group" open={statusFilter === "unpaid_enrollment" || statusFilter === "expired" || statusFilter === "inactive" || statusFilter === "unrenewed" || balances || undefined}>
          <summary className="cursor-pointer rounded-md px-3 py-3 text-sm font-medium">{t.page.states.more}</summary>
          <div className="flex flex-wrap gap-2 py-2">
        <FilterPill
          label={t.page.states.unpaidEnrollment}
          count={counts.data?.unpaid_enrollment}
          active={statusFilter === "unpaid_enrollment"}
          onClick={() => setStatusFilter("unpaid_enrollment")}
        />
        <FilterPill
          label={t.page.states.expired}
          count={counts.data?.expired}
          active={statusFilter === "expired"}
          onClick={() => setStatusFilter("expired")}
        />
        <FilterPill
          label={t.page.states.inactive}
          count={counts.data?.inactive}
          active={statusFilter === "inactive"}
          onClick={() => setStatusFilter("inactive")}
        />
        <FilterPill label={t.page.states.unrenewed} active={statusFilter === "unrenewed"} onClick={() => setStatusFilter("unrenewed")} />
        <FilterPill label={t.page.states.balance} count={attention.data?.pending_balance.length} active={balances} onClick={() => setStatusFilter("balance")} />
          </div>
        </details>
      </div>

      {/* Cada vista sin vigencia dice qué agrupa y qué se hace con ella,
          para que el conteo no se lea como otra cosa. */}
      {statusFilter === "expired" && (
        <p className="-mt-3 text-sm text-muted-foreground">
          {t.page.states.expiredHint}
          {sortKey === "expiry_desc" && <> {t.page.states.expiredHintRecentFirst}</>}
        </p>
      )}
      {statusFilter === "lapsed" && <p className="-mt-3 text-sm text-muted-foreground">{t.page.states.lapsedHint}</p>}
      {statusFilter === "no_membership" && <p className="-mt-3 text-sm text-muted-foreground">{t.page.states.noMembershipHint}</p>}
      {statusFilter === "unpaid_enrollment" && <p className="-mt-3 text-sm text-muted-foreground">{t.page.states.unpaidEnrollmentHint}</p>}

      {!balances && list.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.errors.loadList} <Button variant="link" onClick={() => void list.refetch()}>Reintentar</Button></AlertDescription>
        </Alert>
      )}

      {balances ? <MemberBalances search={debouncedSearch} /> : <section className="border-y">
        {list.isLoading && items.length === 0 ? (
          <div className="flex items-center justify-center py-16">
            <span role="status" className="flex items-center gap-2"><Loader2 aria-hidden="true" className="h-5 w-5 animate-spin text-muted-foreground" />Cargando socios…</span>
          </div>
        ) : list.error ? null : items.length === 0 ? (
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
                <Button disabled={readOnly} onClick={() => navigate("/members/new")} className="rounded-md">
                  <Plus className="h-4 w-4 mr-2" />
                  Nuevo socio
                </Button>
              )
            }
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh>Socio</DataTableTh>
              <DataTableTh>Plan</DataTableTh>
              <DataTableTh>Vigencia</DataTableTh>
              <DataTableTh className="w-32 text-right pr-5">Acciones</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {items.map((it) => (
                <MemberRow
                  key={it.member.id}
                  item={it}
                  onClick={() => navigate(`/members/${it.member.id}`)}
                  onPay={() => navigate(`/members/${it.member.id}?action=pay`)}
                  planMap={planMap}
                  debt={debtByMember.get(it.member.id) ?? 0}
                />
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </section>}

      {/* Pagination */}
      {!balances && items.length > 0 && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3 text-sm text-muted-foreground">
            <span>Por página</span>
            <Select value={String(pageSize)} onValueChange={(v) => changePageSize(parseInt(v, 10))}>
              <SelectTrigger aria-label="Socios por página" className="h-11 w-[80px]">
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
              className="h-11 w-11 p-0"
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
              className="h-11 w-11 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      )}

    </PageContainer>
  );
}

interface MemberRowProps {
  item: MemberListItem;
  onClick(): void;
  onPay(): void;
  planMap: Record<string, string>;
  debt: number;
}

function MemberRow({ item, onClick, onPay, debt }: MemberRowProps) {
  const m = item.member;
  const ms = item.current_membership;
  const money = useMoneyVisibility();
  const readOnly = useAuthStore(state => state.readOnly);
  const showPay = m.status === "active" && ["denied_expired", "denied_unpaid_enrollment", "allowed_expiring_soon", "denied_no_membership"].includes(item.access_status);
  const activate = item.access_status === "denied_no_membership";
  // Sin dígitos suficientes, wa.me abre un chat vacío: no ofrecemos el enlace.
  const whatsapp = whatsappUrl(m.phone);

  return (
    <DataTableRow onClick={onClick} className="group">
      <DataTableCell>
        <div className="flex items-center gap-3">
          <MemberPhotoLightbox memberId={m.id} fullName={m.full_name} hasPhoto={!!m.photo_url} avatarClassName="h-11 w-11" fallbackClassName="text-xs" stopPropagation />
          <div className="min-w-0">
        <div className="flex items-center gap-2 flex-wrap">
          <Link to={`/members/${m.id}`} onClick={event => event.stopPropagation()} className="font-semibold text-foreground hover:underline">{m.full_name}</Link>
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
        {/\d/.test(m.phone ?? "") && (
          <div className="text-xs text-muted-foreground mt-0.5 flex items-center gap-1">
            <Phone className="h-3 w-3" aria-hidden />
            <span className="tabular">{m.phone}</span>
          </div>
        )}
          </div>
        </div>
      </DataTableCell>

      {/* Plan */}
      <DataTableCell>
        {ms ? (
          <span className="text-sm text-foreground">{ms.type_name}</span>
        ) : (
          <span className="text-muted-foreground" aria-label="Sin plan asignado">—</span>
        )}
        {ms && (
          <div className="text-xs text-muted-foreground mt-0.5 tabular">
            {money.mask(fmtMoney(ms.price))}
          </div>
        )}
      </DataTableCell>

      <DataTableCell>
        <VigenciaBadge accessStatus={item.access_status} expiryDate={ms?.expiry_date} />
      </DataTableCell>

      {/* Actions */}
      <DataTableCell className="text-right pr-3">
        {/* Acciones siempre visibles (sin hover), de 44px, con el nombre del
            socio en su nombre accesible: hay una por fila. */}
        <div
          className="inline-flex items-center gap-1"
          onClick={(e) => e.stopPropagation()}
        >
          {whatsapp && (
            <a
              href={whatsapp}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center justify-center h-11 w-11 rounded-md text-muted-foreground hover:bg-accent hover:text-foreground transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              title="Abrir WhatsApp"
              aria-label={t.page.rowActions.whatsappFor(m.full_name)}
            >
              <MessageSquare className="h-4 w-4" aria-hidden />
            </a>
          )}
          {showPay && (
            <Button
              requiresWrite
              variant="ghost"
              className="text-primary hover:text-primary"
              onClick={onPay}
              disabled={readOnly}
              aria-label={activate ? t.page.rowActions.activateFor(m.full_name) : t.page.rowActions.payFor(m.full_name)}
            >
              <DollarSign aria-hidden />
              {activate ? t.page.rowActions.activate : t.page.rowActions.pay}
            </Button>
          )}
        </div>
      </DataTableCell>
    </DataTableRow>
  );
}
