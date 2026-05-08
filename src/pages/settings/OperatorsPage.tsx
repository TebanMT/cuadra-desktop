import { useState } from "react";
import { Loader2, Plus, KeyRound, MoreHorizontal, Pencil, Power } from "lucide-react";
import { toast } from "sonner";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";
import { OperatorCreateModal } from "@/components/settings/OperatorCreateModal";
import { OperatorEditModal } from "@/components/settings/OperatorEditModal";
import { OperatorResetPasswordModal } from "@/components/settings/OperatorResetPasswordModal";
import {
  useOperators,
  useToggleOperatorActive,
  type Operator,
} from "@/hooks/useOperators";
import { useAuthStore } from "@/stores/useAuthStore";
import { ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { settings as t } from "@/strings/settings";

const HARD_LIMIT = 10;
const SOFT_WARN = 5;

export default function OperatorsPage() {
  const list = useOperators(true);
  const me = useAuthStore((s) => s.user);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Operator | null>(null);
  const [resetting, setResetting] = useState<Operator | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Operator | null>(null);

  const items = list.data?.items ?? [];
  const operators = items.filter((o) => o.role === "operator");
  const activeCount = operators.filter((o) => o.active).length;

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t.operators.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t.operators.subtitle(HARD_LIMIT, activeCount)}
          </p>
        </div>
        <Button
          size="lg"
          onClick={() => setCreateOpen(true)}
          disabled={activeCount >= HARD_LIMIT}
          className="h-10 rounded-md font-semibold shadow-sm"
        >
          <Plus className="h-4 w-4 mr-2" />
          {t.operators.create}
        </Button>
      </div>
      <div className="space-y-4">

      {activeCount >= HARD_LIMIT && (
        <Alert variant="warning">
          <AlertDescription>{t.operators.hardLimit}</AlertDescription>
        </Alert>
      )}
      {activeCount >= SOFT_WARN && activeCount < HARD_LIMIT && (
        <Alert>
          <AlertDescription>{t.operators.softWarning}</AlertDescription>
        </Alert>
      )}

      {list.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.operators.loadError}</AlertDescription>
        </Alert>
      )}

      {list.data && (
        <div className="rounded-xl border border-border bg-card text-card-foreground shadow-sm overflow-hidden">
          <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>{t.operators.columns.name}</TableHead>
                  <TableHead>{t.operators.columns.email}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t.operators.columns.role}
                  </TableHead>
                  <TableHead>{t.operators.columns.status}</TableHead>
                  <TableHead className="hidden md:table-cell">
                    {t.operators.columns.lastLogin}
                  </TableHead>
                  <TableHead className="text-right">{t.operators.columns.actions}</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {items.map((op) => {
                  const isSelf = op.id === me?.user_id;
                  return (
                    <TableRow key={op.id} className={!op.active ? "opacity-60" : undefined}>
                      <TableCell className="font-medium">{op.full_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{op.email}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {t.operators.role[op.role]}
                      </TableCell>
                      <TableCell>
                        {op.active ? (
                          op.must_change_password ? (
                            <Badge variant="warning">{t.operators.status.pendingPassword}</Badge>
                          ) : (
                            <Badge variant="success">{t.operators.status.active}</Badge>
                          )
                        ) : (
                          <Badge variant="secondary">{t.operators.status.inactive}</Badge>
                        )}
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {op.last_login_at ? fmtDate(op.last_login_at) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {op.role === "operator" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button variant="ghost" size="icon">
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditing(op)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                {t.operators.actions.edit}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setResetting(op)}>
                                <KeyRound className="h-4 w-4 mr-2" />
                                {t.operators.actions.resetPassword}
                              </DropdownMenuItem>
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  if (isSelf) {
                                    toast.error(t.operators.errors.cantToggleSelf);
                                    return;
                                  }
                                  setConfirmToggle(op);
                                }}
                                disabled={isSelf}
                              >
                                <Power className="h-4 w-4 mr-2" />
                                {op.active
                                  ? t.operators.actions.deactivate
                                  : t.operators.actions.activate}
                              </DropdownMenuItem>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        ) : (
                          <span className="text-xs text-muted-foreground">—</span>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
          </TableBody>
        </Table>
        </div>
      )}
      </div>

      <OperatorCreateModal open={createOpen} onOpenChange={setCreateOpen} />
      <OperatorEditModal
        operator={editing}
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
      />
      <OperatorResetPasswordModal
        operator={resetting}
        open={!!resetting}
        onOpenChange={(o) => !o && setResetting(null)}
      />
      <ToggleConfirm
        operator={confirmToggle}
        open={!!confirmToggle}
        onOpenChange={(o) => !o && setConfirmToggle(null)}
      />
    </div>
  );
}

function ToggleConfirm({
  operator,
  open,
  onOpenChange,
}: {
  operator: Operator | null;
  open: boolean;
  onOpenChange(o: boolean): void;
}) {
  const toggle = useToggleOperatorActive(operator?.id ?? "");

  if (!operator) return null;
  const willDeactivate = operator.active;

  async function doToggle() {
    try {
      await toggle.mutateAsync({ active: !operator.active });
      toast.success(
        willDeactivate ? t.operators.deactivate.success : t.operators.activate.success
      );
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.operators.errors.generic);
    }
  }

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>
            {willDeactivate
              ? t.operators.deactivate.title(operator.full_name)
              : t.operators.activate.title(operator.full_name)}
          </AlertDialogTitle>
          <AlertDialogDescription>
            {willDeactivate ? t.operators.deactivate.body : t.operators.activate.body}
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel disabled={toggle.isPending}>
            {t.operators.deactivate.cancel}
          </AlertDialogCancel>
          <AlertDialogAction
            onClick={(e) => {
              e.preventDefault();
              doToggle();
            }}
            disabled={toggle.isPending}
            className={willDeactivate ? "bg-destructive hover:bg-destructive/90" : undefined}
          >
            {toggle.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
            {willDeactivate ? t.operators.deactivate.confirm : t.operators.activate.confirm}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
