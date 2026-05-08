import { useState } from "react";
import { Loader2, Plus, Pencil, BadgeMinus } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ApiError } from "@/lib/api";
import { formatMoney } from "@/lib/utils";
import {
  useCreateMembershipType,
  useDeactivateMembershipType,
  useMembershipTypes,
  useUpdateMembershipType,
  type MembershipType,
  type UpsertMembershipTypeInput,
} from "@/hooks/useMembershipTypes";
import { members as t } from "@/strings/members";
import { MembershipTypeForm } from "@/components/settings/MembershipTypeForm";

export default function MembershipTypesPage() {
  const types = useMembershipTypes(true);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<MembershipType | null>(null);
  const [confirmDeactivate, setConfirmDeactivate] = useState<MembershipType | null>(null);

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t.types.pageTitle}
          </h1>
          <p className="text-sm text-muted-foreground">{t.types.pageSubtitle}</p>
        </div>
        <Button
          size="lg"
          onClick={() => setCreateOpen(true)}
          className="h-10 rounded-md font-semibold shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t.types.addNew}
        </Button>
      </div>

      {types.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.errors.loadTypes}</AlertDescription>
        </Alert>
      )}

      <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.types.columns.name}</TableHead>
              <TableHead>{t.types.columns.price}</TableHead>
              <TableHead>{t.types.columns.duration}</TableHead>
              <TableHead>{t.types.columns.status}</TableHead>
              <TableHead className="text-right">{t.types.columns.actions}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {types.isLoading ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin inline-block" />
                </TableCell>
              </TableRow>
            ) : (types.data ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="h-24 text-center text-muted-foreground">
                  Aún no hay membresías. Crea la primera.
                </TableCell>
              </TableRow>
            ) : (
              (types.data ?? []).map((p) => (
                <TableRow key={p.id} className={p.active ? "" : "opacity-60"}>
                  <TableCell className="font-medium">{p.name}</TableCell>
                  <TableCell>{formatMoney(p.price)}</TableCell>
                  <TableCell>{t.types.durationDays(p.duration_days)}</TableCell>
                  <TableCell>
                    {p.active ? (
                      <Badge variant="secondary">{t.types.statusActive}</Badge>
                    ) : (
                      <Badge variant="outline">{t.types.statusInactive}</Badge>
                    )}
                  </TableCell>
                  <TableCell className="text-right space-x-1">
                    <Button variant="ghost" size="sm" onClick={() => setEditing(p)}>
                      <Pencil className="h-4 w-4" />
                      {t.types.edit}
                    </Button>
                    {p.active && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDeactivate(p)}
                        className="text-destructive hover:text-destructive"
                      >
                        <BadgeMinus className="h-4 w-4" />
                        {t.types.deactivate}
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
      </div>

      <CreateDialog open={createOpen} onOpenChange={setCreateOpen} />
      <EditDialog
        type={editing}
        onClose={() => setEditing(null)}
      />
      <DeactivateConfirm
        type={confirmDeactivate}
        onClose={() => setConfirmDeactivate(null)}
      />
    </div>
  );
}

function CreateDialog({ open, onOpenChange }: { open: boolean; onOpenChange(o: boolean): void }) {
  const create = useCreateMembershipType();
  const [serverError, setServerError] = useState<string | null>(null);

  function handleClose(o: boolean) {
    if (!o) setServerError(null);
    onOpenChange(o);
  }

  async function submit(input: UpsertMembershipTypeInput) {
    setServerError(null);
    try {
      await create.mutateAsync(input);
      toast.success(t.types.form.success.created);
      handleClose(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.details as Record<string, unknown> | null;
        setServerError((data?.exception as string | undefined) || t.types.form.errors.generic);
      } else {
        setServerError(t.types.form.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.types.form.titleNew}</DialogTitle>
        </DialogHeader>
        <MembershipTypeForm
          submitting={create.isPending}
          onSubmit={submit}
          onCancel={() => handleClose(false)}
          serverError={serverError}
        />
      </DialogContent>
    </Dialog>
  );
}

function EditDialog({ type, onClose }: { type: MembershipType | null; onClose(): void }) {
  const update = useUpdateMembershipType(type?.id ?? "");
  const [serverError, setServerError] = useState<string | null>(null);

  async function submit(input: UpsertMembershipTypeInput) {
    if (!type) return;
    setServerError(null);
    try {
      await update.mutateAsync(input);
      toast.success(t.types.form.success.updated);
      onClose();
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.details as Record<string, unknown> | null;
        setServerError((data?.exception as string | undefined) || t.types.form.errors.generic);
      } else {
        setServerError(t.types.form.errors.generic);
      }
    }
  }

  return (
    <Dialog
      open={!!type}
      onOpenChange={(o) => {
        if (!o) {
          setServerError(null);
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.types.form.titleEdit}</DialogTitle>
        </DialogHeader>
        {type && (
          <MembershipTypeForm
            initial={type}
            submitting={update.isPending}
            onSubmit={submit}
            onCancel={onClose}
            serverError={serverError}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function DeactivateConfirm({ type, onClose }: { type: MembershipType | null; onClose(): void }) {
  const deactivate = useDeactivateMembershipType();

  async function confirm() {
    if (!type) return;
    try {
      await deactivate.mutateAsync(type.id);
      toast.success(t.types.form.success.deactivated);
      onClose();
    } catch {
      toast.error(t.types.form.errors.generic);
    }
  }

  return (
    <AlertDialog open={!!type} onOpenChange={(o) => !o && onClose()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{type ? t.types.deactivateConfirm.title(type.name) : ""}</AlertDialogTitle>
          <AlertDialogDescription>{t.types.deactivateConfirm.body}</AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={deactivate.isPending}>{t.form.cancel}</AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              confirm();
            }}
            disabled={deactivate.isPending}
            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
          >
            {deactivate.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
            {t.types.deactivateConfirm.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
