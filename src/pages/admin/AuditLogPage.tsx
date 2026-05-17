import { useEffect, useMemo, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AUDIT_ENTITY_TYPES,
  useAuditLog,
  type AuditLogEntry,
} from "@/hooks/useAuditLog";
import { useOperators } from "@/hooks/useOperators";
import { useAuthStore } from "@/stores/useAuthStore";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";
import { PlusFeatureLock } from "@/components/shared/PlusFeatureLock";
import { History } from "lucide-react";
import { messaging as t } from "@/strings/messaging";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";

const PAGE_SIZE = 50;

export default function AuditLogPage() {
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.gym?.subscription_plan);
  const isPlus = canAccessPlusFeatures(plan);
  const operators = useOperators(true);

  const [entityType, setEntityType] = useState<string>("");
  const [actorID, setActorID] = useState<string>("");
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<AuditLogEntry | null>(null);

  const filters = useMemo(
    () => ({
      entity_type: entityType || undefined,
      actor_id: actorID || undefined,
      from: from || undefined,
      to: to || undefined,
      page,
      page_size: PAGE_SIZE,
    }),
    [entityType, actorID, from, to, page]
  );

  const list = useAuditLog(filters);

  useEffect(() => {
    setPage(1);
  }, [entityType, actorID, from, to]);

  if (role !== "owner") {
    return (
      <div className="p-8 max-w-2xl">
        <Alert variant="warning">
          <AlertDescription>{t.audit.notAuthorized}</AlertDescription>
        </Alert>
      </div>
    );
  }
  if (!isPlus) {
    return (
      <PlusFeatureLock
        icon={History}
        title="Bitácora es parte de Plus"
        body="Consulta el historial completo de cambios del gym: quién hizo qué, cuándo y desde dónde. Disponible al mejorar a Plus."
      />
    );
  }

  function resetFilters() {
    setEntityType("");
    setActorID("");
    setFrom("");
    setTo("");
  }

  const items = list.data?.items ?? [];
  const total = list.data?.total ?? 0;
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.audit.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.audit.subtitle}</p>
      </div>
      <div className="space-y-4">

      <Card>
        <CardContent className="pt-5 pb-5 space-y-4">
          <div className="grid gap-3 grid-cols-2 md:grid-cols-4">
            <div>
              <Label className="text-xs">{t.audit.filters.entity}</Label>
              <Select value={entityType} onValueChange={(v) => setEntityType(v === "_all" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t.audit.filters.entityAll} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{t.audit.filters.entityAll}</SelectItem>
                  {AUDIT_ENTITY_TYPES.map((e) => (
                    <SelectItem key={e.code} value={e.code}>
                      {e.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t.audit.filters.actor}</Label>
              <Select value={actorID} onValueChange={(v) => setActorID(v === "_all" ? "" : v)}>
                <SelectTrigger className="h-9">
                  <SelectValue placeholder={t.audit.filters.actorAll} />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="_all">{t.audit.filters.actorAll}</SelectItem>
                  {(operators.data?.items ?? []).map((op) => (
                    <SelectItem key={op.id} value={op.id}>
                      {op.full_name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-xs">{t.audit.filters.from}</Label>
              <Input
                type="date"
                className="h-9"
                value={from}
                onChange={(e) => setFrom(e.target.value)}
              />
            </div>
            <div>
              <Label className="text-xs">{t.audit.filters.to}</Label>
              <Input
                type="date"
                className="h-9"
                value={to}
                onChange={(e) => setTo(e.target.value)}
              />
            </div>
          </div>
          <div className="flex justify-end">
            <Button variant="ghost" size="sm" onClick={resetFilters}>
              {t.audit.filters.reset}
            </Button>
          </div>
        </CardContent>
      </Card>

      {list.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.audit.loadError}</AlertDescription>
        </Alert>
      )}

      {list.data && (
        <Card>
          <CardContent className="p-0">
            {items.length === 0 ? (
              <p className="text-sm text-muted-foreground py-12 text-center">
                {t.audit.empty}
              </p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>{t.audit.columns.when}</TableHead>
                    <TableHead>{t.audit.columns.who}</TableHead>
                    <TableHead>{t.audit.columns.what}</TableHead>
                    <TableHead>{t.audit.columns.entity}</TableHead>
                    <TableHead className="text-right">{t.audit.columns.actions}</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {items.map((entry) => (
                    <TableRow
                      key={entry.id}
                      className="cursor-pointer"
                      onClick={() => setDetail(entry)}
                    >
                      <TableCell className="text-sm whitespace-nowrap">
                        {format(parseISO(entry.created_at), "d MMM HH:mm", { locale: es })}
                      </TableCell>
                      <TableCell className="text-sm">
                        {entry.actor_name ?? <span className="text-muted-foreground">sistema</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{entry.action}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">
                        <span className="text-muted-foreground">{entry.entity_type}</span>
                        {entry.entity_id && (
                          <span className="font-mono text-xs ml-2">
                            {entry.entity_id.slice(0, 8)}…
                          </span>
                        )}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button variant="ghost" size="icon">
                          <Eye className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-2 text-sm">
          <span className="text-muted-foreground">{t.audit.pagination.page(page, totalPages)}</span>
          <Button
            variant="outline"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage((p) => Math.max(1, p - 1))}
          >
            {t.audit.pagination.prev}
          </Button>
          <Button
            variant="outline"
            size="sm"
            disabled={page >= totalPages}
            onClick={() => setPage((p) => p + 1)}
          >
            {t.audit.pagination.next}
          </Button>
        </div>
      )}

      <DetailModal entry={detail} onClose={() => setDetail(null)} />
      </div>
    </div>
  );
}

function DetailModal({ entry, onClose }: { entry: AuditLogEntry | null; onClose(): void }) {
  return (
    <Dialog open={!!entry} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
        {entry && (
          <>
            <DialogHeader>
              <DialogTitle>{t.audit.detail.title}</DialogTitle>
              <DialogDescription className="space-y-1">
                <div>
                  <span className="font-mono text-xs">{entry.action}</span> ·{" "}
                  {format(parseISO(entry.created_at), "d MMM yyyy HH:mm:ss", { locale: es })}
                </div>
                <div>
                  {entry.actor_name && <>Por: <strong>{entry.actor_name}</strong> · </>}
                  {entry.entity_type}
                  {entry.entity_id && (
                    <span className="font-mono text-xs ml-2">{entry.entity_id}</span>
                  )}
                </div>
              </DialogDescription>
            </DialogHeader>
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                {t.audit.detail.changes}
              </p>
              <pre className="rounded-md border bg-muted/40 p-3 text-xs font-mono overflow-x-auto whitespace-pre-wrap">
                {entry.changes
                  ? JSON.stringify(entry.changes, null, 2)
                  : t.audit.detail.empty}
              </pre>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
