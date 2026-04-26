import { useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search, MoreHorizontal, BadgeCheck, AlertTriangle, XCircle, MinusCircle, DollarSign, LogIn } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import {
  useMembersList,
  useMemberStatusCounts,
  type AccessStatus,
  type MemberStatusFilter,
  type MemberSort,
  type SortDir,
} from "@/hooks/useMembers";
import { useMembershipTypes } from "@/hooks/useMembershipTypes";
import { useDebounce } from "@/hooks/useDebounce";
import { fmtDate, lastVisitLabel } from "@/lib/dates";
import { members as t } from "@/strings/members";
import { cn } from "@/lib/utils";
import { MemberDetailSheet } from "@/components/members/MemberDetailSheet";
import { MemberCreateDialog } from "@/components/members/MemberCreateDialog";

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

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

function accessIcon(access: AccessStatus, className: string) {
  switch (access) {
    case "allowed_active":
      return <BadgeCheck className={cn("text-success", className)} aria-label="Activo" />;
    case "allowed_expiring_soon":
      return <AlertTriangle className={cn("text-warning", className)} aria-label="Por vencer" />;
    case "denied_expired":
    case "denied_no_membership":
      return <XCircle className={cn("text-destructive", className)} aria-label="Vencido" />;
    case "denied_inactive":
      return <MinusCircle className={cn("text-muted-foreground", className)} aria-label="Inactivo" />;
  }
}

interface FilterPillProps {
  active: boolean;
  label: string;
  count?: number;
  onClick(): void;
}

function FilterPill({ active, label, count, onClick }: FilterPillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm transition-colors",
        active
          ? "border-primary bg-primary text-primary-foreground"
          : "border-border bg-background text-foreground hover:bg-muted"
      )}
    >
      <span>{label}</span>
      {count !== undefined && (
        <span
          className={cn(
            "rounded-full px-1.5 py-0.5 text-xs font-medium",
            active ? "bg-primary-foreground/20" : "bg-muted text-muted-foreground"
          )}
        >
          {count}
        </span>
      )}
    </button>
  );
}

export default function MembersPage() {
  const [search, setSearch] = useState("");
  const debouncedSearch = useDebounce(search, 300);

  const [statusFilter, setStatusFilter] = useState<MemberStatusFilter>("");
  const [planFilter, setPlanFilter] = useState<string>("");
  const [sortKey, setSortKey] = useState<SortKey>("expiry_asc");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(readPageSize());

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

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

        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm font-medium text-muted-foreground mr-1">{t.page.filterStateLabel}:</span>
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
        </div>

        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{t.page.filterPlanLabel}:</span>
            <Select value={planFilter || "_all"} onValueChange={(v) => setPlanFilter(v === "_all" ? "" : v)}>
              <SelectTrigger className="h-9 w-[200px]">
                <SelectValue placeholder={t.page.filterAllPlans} />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="_all">{t.page.filterAllPlans}</SelectItem>
                {(types.data ?? []).map((p) => (
                  <SelectItem key={p.id} value={p.id}>
                    {p.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium text-muted-foreground">{t.page.sortLabel}:</span>
            <Select value={sortKey} onValueChange={(v) => setSortKey(v as SortKey)}>
              <SelectTrigger className="h-9 w-[200px]">
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
              <TableHead className="w-16">{t.page.columns.photo}</TableHead>
              <TableHead>{t.page.columns.name}</TableHead>
              <TableHead>{t.page.columns.plan}</TableHead>
              <TableHead>{t.page.columns.expiry}</TableHead>
              <TableHead>{t.page.columns.lastVisit}</TableHead>
              <TableHead className="w-32 text-right">{t.page.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {list.isLoading && items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline-block" />
                </TableCell>
              </TableRow>
            ) : items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-32 text-center text-muted-foreground">
                  {(debouncedSearch || statusFilter || planFilter)
                    ? t.page.pagination.noResults
                    : t.page.pagination.empty}
                </TableCell>
              </TableRow>
            ) : (
              items.map(({ member, current_membership, access_status }) => (
                <TableRow
                  key={member.id}
                  className="cursor-pointer group"
                  onClick={() => setSelectedId(member.id)}
                >
                  <TableCell>
                    <Avatar className="h-9 w-9">
                      {member.photo_url && <AvatarImage src={member.photo_url} alt="" />}
                      <AvatarFallback className="text-xs">{initials(member.full_name)}</AvatarFallback>
                    </Avatar>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-2">
                      {accessIcon(access_status, "h-4 w-4")}
                      <span className="font-medium text-foreground">{member.full_name}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">
                      {member.phone}
                    </div>
                  </TableCell>
                  <TableCell>
                    {current_membership ? (
                      <Badge variant="secondary" className="font-normal">
                        {current_membership.type_name}
                      </Badge>
                    ) : (
                      <span className="text-xs text-muted-foreground">{t.page.rowActions.noPlan}</span>
                    )}
                  </TableCell>
                  <TableCell>
                    {current_membership ? fmtDate(current_membership.expiry_date) : "—"}
                  </TableCell>
                  <TableCell className="text-muted-foreground">
                    {lastVisitLabel(undefined, t.page.lastVisit)}
                  </TableCell>
                  <TableCell className="text-right">
                    <div
                      className="inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled aria-label={t.page.rowActions.pay}>
                            <DollarSign className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t.page.rowActions.pay}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8" disabled aria-label={t.page.rowActions.checkin}>
                            <LogIn className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t.page.rowActions.checkin}</TooltipContent>
                      </Tooltip>
                      <Tooltip>
                        <TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8"
                            onClick={() => setSelectedId(member.id)}
                            aria-label={t.page.rowActions.more}
                          >
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </TooltipTrigger>
                        <TooltipContent>{t.page.rowActions.more}</TooltipContent>
                      </Tooltip>
                    </div>
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span>{t.page.pagination.pageSize}:</span>
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
          <span>· {t.page.pagination.showing(from, to, total)}</span>
        </div>
        <div className="flex items-center gap-1">
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page <= 1 || list.isFetching}
          >
            {t.page.pagination.previous}
          </Button>
          <span className="text-sm px-3">
            {page} / {totalPages}
          </span>
          <Button
            variant="outline"
            size="sm"
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page >= totalPages || list.isFetching}
          >
            {t.page.pagination.next}
          </Button>
        </div>
      </div>

      <MemberDetailSheet
        memberId={selectedId}
        onClose={() => setSelectedId(null)}
        planMap={planMap}
      />

      <MemberCreateDialog open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}
