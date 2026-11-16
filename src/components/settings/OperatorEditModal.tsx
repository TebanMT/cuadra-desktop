import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { DEFAULT_DIAL_CODE, formatE164, splitE164 } from "@/components/shared/PhoneInput";
import { useUpdateOperator, type Operator } from "@/hooks/useOperators";
import type { Permission } from "@/lib/permissions";
import { OperatorPermissionsFields } from "@/components/settings/OperatorPermissionsFields";
import { OperatorIdentityFields } from "@/components/settings/OperatorIdentityFields";
import {
  operatorSaveError,
  permissionsSummary,
  useOperatorFieldFocus,
  validateOperatorIdentity,
  type OperatorFieldErrors,
  type OperatorIdentity,
} from "@/components/settings/operatorForm";
import { settings as t } from "@/strings/settings";

interface Props {
  operator: Operator | null;
  open: boolean;
  onOpenChange(o: boolean): void;
}

const ID_PREFIX = "op-edit";
const EMPTY: OperatorIdentity = { fullName: "", dialCode: DEFAULT_DIAL_CODE, phoneNumber: "", email: "" };

export function OperatorEditModal({ operator, open, onOpenChange }: Props) {
  const update = useUpdateOperator(operator?.id ?? "");
  const focusField = useOperatorFieldFocus(ID_PREFIX, update.isPending);
  const [identity, setIdentity] = useState<OperatorIdentity>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<OperatorFieldErrors>({});
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [permissionsTouched, setPermissionsTouched] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    if (open && operator) {
      const split = splitE164(operator.phone ?? "");
      setIdentity({
        fullName: operator.full_name,
        dialCode: split.dialCode,
        phoneNumber: split.number,
        email: operator.email,
      });
      setPermissions(operator.permissions ?? []);
      setPermissionsTouched(false);
      setFieldErrors({});
      setFormError(null);
    }
  }, [open, operator]);

  // The owner always has every permission; only operators get the switches.
  const editsPermissions = operator?.role === "operator";

  // Un operador es "legacy pendiente migrar" cuando no tiene PIN y
  // tampoco tiene teléfono. Forzar phone+PIN lo migra al modelo nuevo.
  const isLegacyPending = !!operator && !operator.has_pin && !operator.phone;

  function changeIdentity(next: OperatorIdentity) {
    setFieldErrors((prev) => {
      const rest = { ...prev };
      if (next.fullName !== identity.fullName) delete rest.name;
      if (next.dialCode !== identity.dialCode || next.phoneNumber !== identity.phoneNumber) delete rest.phone;
      if (next.email !== identity.email) delete rest.email;
      return rest;
    });
    setIdentity(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setFormError(null);
    if (!operator) return;

    const invalid = validateOperatorIdentity(identity);
    if (invalid) {
      setFieldErrors({ [invalid.field]: invalid.message });
      focusField(invalid.field);
      return;
    }
    setFieldErrors({});

    try {
      await update.mutateAsync({
        full_name: identity.fullName.trim(),
        // "" significa "limpiar el correo" — el BE lo permite para operators.
        email: identity.email.trim().toLowerCase(),
        phone: formatE164(identity.dialCode, identity.phoneNumber),
        // A response without permissions (older sidecar) is not "none":
        // only send them when we know them or the owner changed them.
        ...(editsPermissions && (operator.permissions || permissionsTouched) ? { permissions } : {}),
      });
      toast.success(t.operators.editForm.success);
      onOpenChange(false);
    } catch (err) {
      const mapped = operatorSaveError(err);
      if (mapped.field) {
        setFieldErrors({ [mapped.field]: mapped.message });
        focusField(mapped.field);
      } else {
        setFormError(mapped.message);
      }
    }
  }

  const pending = update.isPending;

  return (
    <Dialog open={open} busy={pending} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-xl flex-col gap-0 overflow-hidden p-0">
        <DialogHeader className="shrink-0 border-b px-6 py-5">
          <DialogTitle>{t.operators.edit}</DialogTitle>
          <DialogDescription className="sr-only">Editar operador.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
          <div className="min-h-0 space-y-8 overflow-y-auto px-6 py-5">
            {isLegacyPending && (
              <Alert variant="warning">
                <AlertDescription>{t.operators.editForm.legacyMigrate}</AlertDescription>
              </Alert>
            )}
            <OperatorIdentityFields
              idPrefix={ID_PREFIX}
              value={identity}
              errors={fieldErrors}
              onChange={changeIdentity}
              disabled={pending}
              autoFocus
            />
            {editsPermissions && (
              <OperatorPermissionsFields
                value={permissions}
                onChange={(next) => {
                  setPermissions(next);
                  setPermissionsTouched(true);
                }}
                disabled={pending}
                editing
              />
            )}
          </div>
          <div className="shrink-0 space-y-3 border-t bg-background px-6 py-4">
            {formError && (
              <Alert variant="destructive" className="py-3">
                <AlertDescription>{formError}</AlertDescription>
              </Alert>
            )}
            <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
              {editsPermissions && (
                <p className="min-w-0 text-sm" aria-live="polite">
                  <span className="text-muted-foreground">{t.operators.permissions.summaryLabel}</span>{" "}
                  <span className="font-medium text-foreground">{permissionsSummary(permissions)}</span>
                </p>
              )}
              <div className="ml-auto flex gap-2">
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                  Cancelar
                </Button>
                <Button requiresWrite type="submit" disabled={pending}>
                  {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                  {pending ? t.operators.editForm.submitting : t.operators.editForm.submit}
                </Button>
              </div>
            </div>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
