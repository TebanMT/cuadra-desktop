import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, MessageCircle } from "lucide-react";
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
import { DEFAULT_DIAL_CODE, formatE164 } from "@/components/shared/PhoneInput";
import {
  operatorLimitError,
  useCreateOperator,
  useOperatorCapacity,
} from "@/hooks/useOperators";
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
  open: boolean;
  onOpenChange(o: boolean): void;
}

type Result = {
  fullName: string;
  phone: string;
  pin: string;
  whatsappDelivery: boolean;
};

const ID_PREFIX = "op";
const EMPTY: OperatorIdentity = { fullName: "", dialCode: DEFAULT_DIAL_CODE, phoneNumber: "", email: "" };

export function OperatorCreateModal({ open, onOpenChange }: Props) {
  const create = useCreateOperator();
  const focusField = useOperatorFieldFocus(ID_PREFIX, create.isPending);
  const { list, capacity } = useOperatorCapacity();
  const [identity, setIdentity] = useState<OperatorIdentity>(EMPTY);
  const [fieldErrors, setFieldErrors] = useState<OperatorFieldErrors>({});
  // A new operator starts without permissions; the owner turns on the ones
  // this person needs.
  const [permissions, setPermissions] = useState<Permission[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  // The server rejected the create because the quota filled up meanwhile.
  const [limitHit, setLimitHit] = useState<"plus" | "standard" | null>(null);
  const [created, setCreated] = useState<Result | null>(null);

  useEffect(() => {
    if (open) {
      setIdentity(EMPTY);
      setFieldErrors({});
      setPermissions([]);
      setFormError(null);
      setLimitHit(null);
      setCreated(null);
      // The list may be up to 30 s old: confirm the quota before the owner
      // fills the form. Data already known stays visible meanwhile.
      void list.refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const full = limitHit ?? (capacity?.full ? (capacity.isPlus ? "plus" : "standard") : null);

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
    if (!capacity) return;

    const invalid = validateOperatorIdentity(identity);
    if (invalid) {
      setFieldErrors({ [invalid.field]: invalid.message });
      focusField(invalid.field);
      return;
    }
    setFieldErrors({});

    const emailClean = identity.email.trim();
    try {
      const res = await create.mutateAsync({
        full_name: identity.fullName.trim(),
        phone: formatE164(identity.dialCode, identity.phoneNumber),
        email: emailClean ? emailClean.toLowerCase() : undefined,
        permissions,
      });
      setCreated({
        fullName: res.full_name,
        phone: res.phone,
        pin: res.pin,
        whatsappDelivery: res.whatsapp_delivery,
      });
      toast.success(t.operators.createForm.success);
    } catch (err) {
      const limit = operatorLimitError(err);
      if (limit) {
        setLimitHit(limit);
        void list.refetch();
        return;
      }
      const mapped = operatorSaveError(err);
      if (mapped.field) {
        setFieldErrors({ [mapped.field]: mapped.message });
        focusField(mapped.field);
      } else {
        setFormError(mapped.message);
      }
    }
  }

  function copyPin() {
    if (!created) return;
    navigator.clipboard.writeText(created.pin).then(() => {
      toast.success(t.operators.createForm.copied);
    });
  }

  const pending = create.isPending;

  return (
    <Dialog open={open} busy={pending} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-w-xl flex-col gap-0 overflow-hidden p-0">
        {created ? (
          <>
            <DialogHeader className="shrink-0 space-y-1.5 px-6 pb-4 pt-6">
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 aria-hidden="true" className="h-5 w-5 shrink-0 text-success-text" />
                {t.operators.createForm.success}
              </DialogTitle>
              <DialogDescription>
                {t.operators.createForm.successHint(created.fullName)}
              </DialogDescription>
            </DialogHeader>
            <div className="min-h-0 space-y-4 overflow-y-auto px-6 pb-5">
              <div className="space-y-3 rounded-lg border bg-muted/40 p-6 text-center">
                <p className="text-sm font-medium text-muted-foreground">
                  {t.operators.createForm.pinLabel}
                </p>
                <p className="font-display text-5xl tabular tracking-[0.3em]">{created.pin}</p>
                <p className="text-sm text-muted-foreground">{t.operators.createForm.pinHint}</p>
              </div>
              {created.whatsappDelivery ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>{t.operators.createForm.whatsappSent(created.phone)}</AlertDescription>
                </Alert>
              ) : (
                <Alert variant="warning">
                  <MessageCircle className="h-4 w-4" />
                  <AlertDescription>{t.operators.createForm.whatsappSkipped}</AlertDescription>
                </Alert>
              )}
            </div>
            <div className="flex shrink-0 justify-between gap-2 border-t bg-background px-6 py-4">
              <Button variant="outline" onClick={copyPin}>
                <Copy className="h-4 w-4" />
                {t.operators.createForm.copyPin}
              </Button>
              <Button onClick={() => onOpenChange(false)}>{t.operators.createForm.done}</Button>
            </div>
          </>
        ) : full ? (
          <>
            <DialogHeader className="shrink-0 space-y-1.5 px-6 pb-4 pt-6">
              <DialogTitle>{t.operators.createForm.fullTitle}</DialogTitle>
              <DialogDescription>
                {full === "plus" ? t.operators.hardLimit : t.operators.standardLimit}
              </DialogDescription>
            </DialogHeader>
            <div className="flex shrink-0 justify-end px-6 pb-6">
              <Button onClick={() => onOpenChange(false)}>{t.operators.createForm.fullDone}</Button>
            </div>
          </>
        ) : (
          <>
            <DialogHeader className="shrink-0 space-y-1.5 border-b px-6 py-5">
              <DialogTitle>{t.operators.createForm.title}</DialogTitle>
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                <DialogDescription>
                  {capacity
                    ? t.operators.createForm.seat(capacity.free)
                    : list.isError
                      ? t.operators.createForm.seatUnknown
                      : t.operators.createForm.checkingSeat}
                </DialogDescription>
                {!capacity && list.isError && (
                  <Button
                    type="button"
                    variant="link"
                    className="h-auto p-0 text-sm"
                    disabled={list.isFetching}
                    onClick={() => void list.refetch()}
                  >
                    {t.operators.createForm.retrySeat}
                  </Button>
                )}
              </div>
            </DialogHeader>
            <form onSubmit={submit} noValidate className="flex min-h-0 flex-col">
              <div className="min-h-0 space-y-8 overflow-y-auto px-6 py-5">
                <OperatorIdentityFields
                  idPrefix={ID_PREFIX}
                  value={identity}
                  errors={fieldErrors}
                  onChange={changeIdentity}
                  phoneHint={t.operators.createForm.phoneHint}
                  disabled={pending}
                  autoFocus
                />
                <OperatorPermissionsFields value={permissions} onChange={setPermissions} disabled={pending} />
              </div>
              <div className="shrink-0 space-y-3 border-t bg-background px-6 py-4">
                {formError && (
                  <Alert variant="destructive" className="py-3">
                    <AlertDescription>{formError}</AlertDescription>
                  </Alert>
                )}
                <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-3">
                  <p className="min-w-0 text-sm" aria-live="polite">
                    <span className="text-muted-foreground">{t.operators.permissions.summaryLabel}</span>{" "}
                    <span className="font-medium text-foreground">{permissionsSummary(permissions)}</span>
                  </p>
                  <div className="ml-auto flex gap-2">
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={pending}>
                      Cancelar
                    </Button>
                    <Button requiresWrite type="submit" disabled={pending || !capacity}>
                      {pending && <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />}
                      {pending ? t.operators.createForm.submitting : t.operators.createForm.submit}
                    </Button>
                  </div>
                </div>
              </div>
            </form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
