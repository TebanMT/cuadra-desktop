import { useMemo, useState } from "react";
import { Loader2, Plus, Pencil, BadgeMinus, RotateCcw } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import {
  usePromotions,
  useCreatePromotion,
  useUpdatePromotion,
  useDeactivatePromotion,
  useReactivatePromotion,
  type Promotion,
  type UpsertPromotionInput,
} from "@/hooks/usePromotions";
import {
  promotions as t,
  promotionKindLabels,
  appliesToLabels,
  formatPromotionValue,
} from "@/strings/promotions";
import { PromotionForm } from "./PromotionForm";

// Estado visual de una promo en la tabla. "Programada" = aún no entró
// en vigencia; "Expirada" = la fecha de fin ya pasó pero sigue active.
// "Vigente" = active + dentro de ventana (o sin ventana). "Desactivada"
// = active=false.
type PromotionDisplayStatus = "active" | "future" | "expired" | "inactive";


function displayStatus(p: Promotion): PromotionDisplayStatus {
  if (!p.active) return "inactive";
  const today = todayIso();
  if (p.valid_from && today < p.valid_from) return "future";
  if (p.valid_until && today > p.valid_until) return "expired";
  return "active";
}

function statusLabel(s: PromotionDisplayStatus): string {
  return t.status[s];
}

function statusVariant(s: PromotionDisplayStatus): "default" | "secondary" | "outline" | "destructive" {
  switch (s) {
    case "active":
      return "default";
    case "future":
      return "secondary";
    case "expired":
      return "outline";
    case "inactive":
      return "outline";
  }
}

export function PromotionsTab() {
  const [includeInactive, setIncludeInactive] = useState(false);
  const promosQuery = usePromotions({ includeInactive });
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Promotion | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<Promotion | null>(null);
  const reactivate = useReactivatePromotion();

  const rows = useMemo(() => promosQuery.data ?? [], [promosQuery.data]);

  function handleReactivate(p: Promotion) {
    reactivate.mutate(p.id, {
      onSuccess: () => toast.success(t.form.success.reactivated),
      onError: () => toast.error(t.form.errors.generic),
    });
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-xl">{t.page.subtitle}</p>
        <div className="flex items-center gap-3">
          <label className="flex items-center gap-2 text-sm">
            <Switch
              checked={includeInactive}
              onCheckedChange={(v) => setIncludeInactive(!!v)}
            />
            <span>{t.page.showInactive}</span>
          </label>
          <Button onClick={() => setCreateOpen(true)} className="h-9">
            <Plus className="h-4 w-4 mr-2" />
            {t.page.addNew}
          </Button>
        </div>
      </div>

      {promosQuery.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.form.errors.generic}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.columns.name}</TableHead>
              <TableHead>{t.columns.kind}</TableHead>
              <TableHead>{t.columns.value}</TableHead>
              <TableHead>{t.columns.appliesTo}</TableHead>
              <TableHead>{t.columns.code}</TableHead>
              <TableHead>{t.columns.status}</TableHead>
              <TableHead className="text-right">{t.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {promosQuery.isLoading ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline-block" />
                </TableCell>
              </TableRow>
            ) : rows.length === 0 ? (
              <TableRow>
                <TableCell colSpan={7} className="h-24 text-center text-muted-foreground">
                  {t.page.empty}
                </TableCell>
              </TableRow>
            ) : (
              rows.map((p) => {
                const st = displayStatus(p);
                return (
                  <TableRow key={p.id} className={p.active ? "" : "opacity-60"}>
                    <TableCell className="font-medium">{p.name}</TableCell>
                    <TableCell className="text-sm">{promotionKindLabels[p.kind]}</TableCell>
                    <TableCell className="text-sm">
                      {formatPromotionValue(p.kind, p.value, p.companion_count)}
                    </TableCell>
                    <TableCell className="text-sm">{appliesToLabels[p.applies_to]}</TableCell>
                    <TableCell className="text-sm font-mono">
                      {p.code ? p.code.toUpperCase() : "—"}
                    </TableCell>
                    <TableCell>
                      <Badge variant={statusVariant(st)}>{statusLabel(st)}</Badge>
                    </TableCell>
                    <TableCell className="text-right space-x-1">
                      <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                        <Pencil className="h-4 w-4" />
                      </Button>
                      {p.active ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setConfirmDeactivate(p)}
                          className="text-destructive hover:text-destructive"
                        >
                          <BadgeMinus className="h-4 w-4" />
                        </Button>
                      ) : (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => handleReactivate(p)}
                          disabled={reactivate.isPending}
                        >
                          <RotateCcw className="h-4 w-4" />
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      <CreatePromoDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditPromoDialog promo={editing} onClose={() => setEditing(null)} />
      <DeactivateConfirm
        promo={confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
      />
    </div>
  );
}

function CreatePromoDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange(o: boolean): void;
}) {
  const create = useCreatePromotion();
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(input: UpsertPromotionInput) {
    setServerError(null);
    try {
      await create.mutateAsync(input);
      toast.success(t.form.success.created);
      onOpenChange(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.details as Record<string, unknown> | null;
        const msg = (data?.exception as string | undefined) || t.form.errors.generic;
        setServerError(msg.includes("código") ? t.form.errors.duplicateCode : msg);
      } else {
        setServerError(t.form.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) setServerError(null); onOpenChange(o); }}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.form.titleNew}</DialogTitle>
        </DialogHeader>
        <PromotionForm
          submitting={create.isPending}
          serverError={serverError}
          onSubmit={submit}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditPromoDialog({
  promo,
  onClose,
}: {
  promo: Promotion | null;
  onClose(): void;
}) {
  const update = useUpdatePromotion(promo?.id ?? "");
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(input: UpsertPromotionInput) {
    if (!promo) return;
    setServerError(null);
    try {
      await update.mutateAsync(input);
      toast.success(t.form.success.updated);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.details as Record<string, unknown> | null;
        const msg = (data?.exception as string | undefined) || t.form.errors.generic;
        setServerError(msg.includes("código") ? t.form.errors.duplicateCode : msg);
      } else {
        setServerError(t.form.errors.generic);
      }
    }
  }

  return (
    <Dialog
      open={!!promo}
      onOpenChange={(o) => {
        if (!o) {
          setServerError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.form.titleEdit}</DialogTitle>
        </DialogHeader>
        {promo && (
          <PromotionForm
            initial={promo}
            submitting={update.isPending}
            serverError={serverError}
            onSubmit={submit}
            onCancel={onClose}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeactivateConfirm({
  promo,
  onClose,
}: {
  promo: Promotion | null;
  onClose(): void;
}) {
  const deactivate = useDeactivatePromotion();

  async function confirm() {
    if (!promo) return;
    try {
      await deactivate.mutateAsync(promo.id);
      toast.success(t.form.success.deactivated);
      onClose();
    } catch {
      toast.error(t.form.errors.generic);
    }
  }

  return (
    <AlertDialog open={!!promo} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {promo ? t.deactivateConfirm.title(promo.name) : ""}
          </AlertDialogTitle>
          <AlertDialogDescription>{t.deactivateConfirm.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deactivate.isPending}>
            {t.form.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={deactivate.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deactivate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {t.deactivateConfirm.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
