import { PageContainer } from "@/components/shared/PagePrimitives";
import { useState } from "react";
import {
  Loader2,
  Plus,
  KeyRound,
  MoreHorizontal,
  Pencil,
  Power,
  RefreshCcw,
} from "lucide-react";
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
import { OperatorRotatePinModal } from "@/components/settings/OperatorRotatePinModal";
import {
  operatorLimitError,
  useOperatorCapacity,
  useToggleOperatorActive,
  type Operator,
} from "@/hooks/useOperators";
import { useAuthStore } from "@/stores/useAuthStore";
import { ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { settings as t } from "@/strings/settings";
import { PERMISSIONS } from "@/lib/permissions";
import { Link } from "react-router-dom";
import { SettingsBackLink } from "@/components/settings/SettingsBackLink";

// Aviso suave antes del cupo Plus (el cupo vive en useOperatorCapacity).
const SOFT_WARN = 5;
const LIMIT_NOTE_ID = "operators-limit-note";

export default function OperatorsPage() {
  // El servidor cuenta sólo a los operadores activos (CountOperatorsByGym);
  // el dueño y los desactivados no ocupan lugar. useOperatorCapacity cuenta
  // igual para que el cupo coincida con la lista y con lo que el servidor
  // acepta, aquí y en el alta.
  const { list, capacity } = useOperatorCapacity();
  const me = useAuthStore((s) => s.user);
  const [createOpen, setCreateOpen] = useState(false);
  const [editing, setEditing] = useState<Operator | null>(null);
  const [resetting, setResetting] = useState<Operator | null>(null);
  const [rotatingPIN, setRotatingPIN] = useState<Operator | null>(null);
  const [confirmToggle, setConfirmToggle] = useState<Operator | null>(null);

  const items = list.data?.items ?? [];
  const capacityKnown = capacity != null;
  const isPlus = capacity?.isPlus ?? false;
  const hardLimit = capacity?.limit ?? 0;
  const usedCount = capacity?.used ?? 0;
  const inactiveCount = capacity?.inactive ?? 0;
  const atLimit = capacity?.full ?? false;

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-1">
      <SettingsBackLink />
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div className="space-y-1">
          <h1
            className="text-3xl font-bold text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            {t.operators.title}
          </h1>
          <p className="text-sm text-muted-foreground">
            {capacityKnown ? t.operators.capacity(hardLimit, usedCount, inactiveCount) : "Consulta el equipo y los accesos disponibles."}
          </p>
        </div>
        <Button requiresWrite
          size="lg"
          onClick={() => setCreateOpen(true)}
          disabled={!capacityKnown || atLimit}
          aria-describedby={atLimit ? LIMIT_NOTE_ID : undefined}
          className="rounded-md font-semibold"
        >
          <Plus aria-hidden="true" className="h-4 w-4" />
          {t.operators.create}
        </Button>
      </div>
      </div>
      <div className="space-y-4">

      {atLimit && (
        <Alert variant="warning">
          <AlertDescription id={LIMIT_NOTE_ID}>
            {isPlus ? (
              t.operators.hardLimit
            ) : (
              <>
                {t.operators.standardLimit} Para revisar el acceso,{" "}
                <Link
                  to="/help"
                  className="font-semibold underline underline-offset-2"
                >
                  consulta a soporte
                </Link>
                .
              </>
            )}
          </AlertDescription>
        </Alert>
      )}
      {/* SOFT_WARN sólo aplica al cap Plus — en Standard el cap es 1 y el
          warning sería ruido (siempre se dispara antes de la creación). */}
      {isPlus && usedCount >= SOFT_WARN && usedCount < hardLimit && (
        <Alert>
          <AlertDescription>{t.operators.softWarning}</AlertDescription>
        </Alert>
      )}

      {list.isLoading && (
        <div role="status" className="flex items-center justify-center gap-3 py-20 text-muted-foreground">
          <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin" />
          Consultando operadores…
        </div>
      )}

      {list.error && (
        <Alert variant="destructive">
          <AlertDescription className="space-y-3">
            <p>{capacityKnown ? "No pudimos actualizar los operadores. Mostramos la última información disponible." : t.operators.loadError}</p>
            <Button variant="outline" disabled={list.isFetching} onClick={() => void list.refetch()}>
              {list.isFetching ? "Reintentando…" : "Reintentar operadores"}
            </Button>
          </AlertDescription>
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
                    <TableRow key={op.id}>
                      <TableCell className="font-medium">{op.full_name}</TableCell>
                      <TableCell className="text-sm text-muted-foreground">{op.email || t.operators.noEmail}</TableCell>
                      <TableCell className="hidden md:table-cell text-sm">
                        {t.operators.role[op.role]}
                        {op.role === "operator" && op.permissions && (
                          <div className="text-xs text-muted-foreground">
                            {`${op.permissions.length} de ${PERMISSIONS.length} permisos`}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-wrap items-center gap-1">
                          {op.active ? (
                            op.must_change_password ? (
                              <Badge variant="warning">{t.operators.status.pendingPassword}</Badge>
                            ) : (
                              <Badge variant="success">{t.operators.status.active}</Badge>
                            )
                          ) : (
                            <Badge variant="secondary">{t.operators.status.inactive}</Badge>
                          )}
                          {op.role === "operator" && op.has_pin && (
                            <Badge variant="outline">{t.operators.status.pin}</Badge>
                          )}
                          {op.role === "operator" && !op.has_pin && !op.phone && (
                            <Badge variant="warning">{t.operators.status.legacyPending}</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell text-xs text-muted-foreground">
                        {op.last_login_at ? fmtDate(op.last_login_at) : "—"}
                      </TableCell>
                      <TableCell className="text-right">
                        {op.role === "operator" ? (
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <Button requiresWrite variant="ghost" size="icon" aria-label={`Acciones de ${op.full_name}`}>
                                <MoreHorizontal className="h-4 w-4" />
                              </Button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end">
                              <DropdownMenuItem onClick={() => setEditing(op)}>
                                <Pencil className="h-4 w-4 mr-2" />
                                {t.operators.actions.edit}
                              </DropdownMenuItem>
                              <DropdownMenuItem onClick={() => setRotatingPIN(op)}>
                                <RefreshCcw className="h-4 w-4 mr-2" />
                                {t.operators.actions.rotatePin}
                              </DropdownMenuItem>
                              {op.email && (
                                <DropdownMenuItem onClick={() => setResetting(op)}>
                                  <KeyRound className="h-4 w-4 mr-2" />
                                  {t.operators.actions.resetPasswordLegacy}
                                </DropdownMenuItem>
                              )}
                              <DropdownMenuSeparator />
                              <DropdownMenuItem
                                onClick={() => {
                                  if (isSelf) {
                                    toast.error(t.operators.errors.cantToggleSelf);
                                    return;
                                  }
                                  setConfirmToggle(op);
                                }}
                                // Activar a alguien con el cupo lleno lo rechazaría el
                                // servidor: se dice antes, en el mismo menú.
                                disabled={isSelf || (!op.active && atLimit)}
                                title={!op.active && atLimit ? t.operators.activateAtLimit : undefined}
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
      <OperatorRotatePinModal
        operator={rotatingPIN}
        open={!!rotatingPIN}
        onOpenChange={(o) => !o && setRotatingPIN(null)}
      />
      <ToggleConfirm
        operator={confirmToggle}
        open={!!confirmToggle}
        onOpenChange={(o) => !o && setConfirmToggle(null)}
      />
    </PageContainer>
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
      // Con el cupo lleno, la explicación de Tinta en vez del mensaje del servidor.
      if (operatorLimitError(err)) toast.error(t.operators.activateAtLimit);
      else toast.error(err instanceof ApiError ? err.message : t.operators.errors.generic);
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
          <AlertDialogAction requiresWrite
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
