import { useState } from "react";
import { CheckCircle2, AlertTriangle, AlertCircle, RefreshCw } from "lucide-react";
import { formatDistanceToNow } from "date-fns";
import { es } from "date-fns/locale";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useSyncStatus, useTriggerSync, levelOf, type SyncStatus } from "@/hooks/useSyncStatus";
import { cn } from "@/lib/utils";
import { shell } from "@/strings/shell";

export function SyncIndicator() {
  const [open, setOpen] = useState(false);
  const { data } = useSyncStatus();
  const trigger = useTriggerSync();
  const level = levelOf(data);

  const Icon =
    level === "ok"
      ? CheckCircle2
      : level === "syncing"
      ? RefreshCw
      : level === "warn"
      ? AlertTriangle
      : AlertCircle;
  const colorClass =
    level === "ok"
      ? "text-success"
      : level === "syncing"
      ? "text-muted-foreground"
      : level === "warn"
      ? "text-warning"
      : "text-destructive";

  const label =
    level === "ok"
      ? shell.sync.online
      : level === "syncing"
      ? shell.sync.syncing
      : level === "warn"
      ? shell.sync.offline
      : shell.sync.error;

  return (
    <div className="flex items-center gap-1">
      <button
        onClick={() => setOpen(true)}
        className={cn(
          "flex items-center gap-2 rounded-md px-3 py-1.5 text-sm hover:bg-accent transition-colors",
          colorClass
        )}
        aria-label="Estado de sincronización"
      >
        <Icon className={cn("h-4 w-4", level === "syncing" && "animate-spin")} />
        <span className="hidden md:inline">{label}</span>
      </button>
      <button
        onClick={() => trigger.mutate()}
        disabled={trigger.isPending}
        className="flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-accent hover:text-foreground transition-colors disabled:opacity-50"
        aria-label={shell.sync.triggerNow}
        title={shell.sync.triggerNow}
      >
        <RefreshCw className={cn("h-4 w-4", trigger.isPending && "animate-spin")} />
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Icon className={cn("h-5 w-5", colorClass)} />
              {shell.sync.detailsTitle}
            </DialogTitle>
            <DialogDescription>{label}</DialogDescription>
          </DialogHeader>
          <SyncDetail status={data} />
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SyncDetail({ status }: { status?: SyncStatus | null }) {
  return (
    <dl className="space-y-3 text-sm">
      <Row label={shell.sync.lastSync}>
        {status?.last_synced_at
          ? formatDistanceToNow(new Date(status.last_synced_at), { addSuffix: true, locale: es })
          : shell.sync.never}
      </Row>
      <Row label={shell.sync.pending}>{status?.queue_pending_count ?? 0}</Row>
      <Row label={shell.sync.lastError}>
        {status?.last_error || shell.sync.none}
      </Row>
    </dl>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className="font-medium text-right">{children}</dd>
    </div>
  );
}
