import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { useAlerts, useUpdateAlert, type AlertConfig, type AlertKey } from "@/hooks/useNotifications";
import { ApiError } from "@/lib/api";
import { settings as t } from "@/strings/settings";

export default function AlertsPage() {
  const list = useAlerts();

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.alerts.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.alerts.subtitle}</p>
      </div>

      {list.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.alerts.loadError}</AlertDescription>
        </Alert>
      )}

      {list.data && (
        <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm">
          <ul className="divide-y divide-border">
            {list.data.items.map((cfg) => (
              <AlertRow key={cfg.key} cfg={cfg} />
            ))}
          </ul>
        </div>
      )}
    </div>
  );
}

function AlertRow({ cfg }: { cfg: AlertConfig }) {
  const update = useUpdateAlert(cfg.key as AlertKey);
  const meta = t.alerts.keys[cfg.key];

  async function toggle(checked: boolean) {
    try {
      await update.mutateAsync({ enabled: checked });
      toast.success(t.alerts.saved);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.alerts.saveError);
    }
  }

  return (
    <li className="flex items-start gap-4 px-5 py-4">
      <div className="flex-1 min-w-0">
        <p className="font-semibold">{meta?.title ?? cfg.key}</p>
        <p className="text-sm text-muted-foreground mt-0.5">
          {meta?.description ?? cfg.description}
        </p>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {update.isPending && <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />}
        <Switch
          checked={cfg.enabled}
          onCheckedChange={toggle}
          disabled={update.isPending}
        />
      </div>
    </li>
  );
}
