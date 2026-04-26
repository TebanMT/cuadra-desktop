import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useCreateMember, type CreateMemberInput } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { members as t } from "@/strings/members";
import { MemberForm, type MemberFormSubmitPayload } from "./MemberForm";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

interface DuplicateInfo {
  existing_member_id?: string;
  existing_member_name?: string;
  existing_expiry?: string;
}

export function MemberCreateDialog({ open, onOpenChange }: Props) {
  const create = useCreateMember();
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ payload: CreateMemberInput; info: DuplicateInfo } | null>(null);

  function reset() {
    setServerError(null);
    setDuplicate(null);
  }

  function handleClose(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  function buildPayload(p: MemberFormSubmitPayload, allowDup: boolean): CreateMemberInput {
    const v = p.values;
    return {
      full_name: v.full_name.trim(),
      phone: v.phone.replace(/\D/g, "").slice(-10),
      email: v.email.trim() || undefined,
      birthdate: v.birthdate || undefined,
      photo_url: v.photo_url || undefined,
      notes: v.notes.trim() || undefined,
      membership_type_id: v.membership_type_id,
      start_date: v.start_date || undefined,
      allow_duplicate_phone: allowDup,
      charge_first_payment: v.charge_first_payment,
      payment_method: v.charge_first_payment && v.payment_method ? v.payment_method : undefined,
    };
  }

  async function submit(payload: CreateMemberInput, name: string) {
    try {
      setServerError(null);
      const res = await create.mutateAsync(payload);
      toast.success(t.form.success.created(name, fmtDate(res.expiry_date)));
      handleClose(false);
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const data = e.details as Record<string, unknown> | null;
        const exception = (data?.exception as string | undefined) || "";
        if (exception.toLowerCase().includes("phone") || exception.toLowerCase().includes("teléfono") || exception.toLowerCase().includes("duplicate")) {
          setDuplicate({
            payload,
            info: {
              existing_member_id: data?.existing_member_id as string | undefined,
              existing_member_name: data?.existing_member_name as string | undefined,
              existing_expiry: data?.existing_expiry as string | undefined,
            },
          });
          return;
        }
        setServerError(exception || t.form.errors.generic);
        return;
      }
      setServerError(t.form.errors.generic);
    }
  }

  function handleSubmit(p: MemberFormSubmitPayload) {
    const payload = buildPayload(p, false);
    submit(payload, p.values.full_name);
  }

  function createAnyway() {
    if (!duplicate) return;
    const payload = { ...duplicate.payload, allow_duplicate_phone: true };
    setDuplicate(null);
    submit(payload, payload.full_name);
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.form.titleNew}</DialogTitle>
        </DialogHeader>

        {duplicate ? (
          <div className="space-y-4 py-2">
            <div className="space-y-2">
              <h3 className="font-semibold text-base">{t.form.duplicate.title}</h3>
              <p className="text-sm text-muted-foreground">
                {t.form.duplicate.bodyPrefix}
                <strong className="text-foreground">
                  {duplicate.info.existing_member_name ?? "otro socio"}
                </strong>
                {duplicate.info.existing_expiry && (
                  <> (vence {fmtDate(duplicate.info.existing_expiry)})</>
                )}
                .
              </p>
            </div>
            <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
              <Button variant="outline" onClick={() => setDuplicate(null)}>
                {t.form.cancel}
              </Button>
              {duplicate.info.existing_member_id && (
                <Button variant="outline" onClick={() => handleClose(false)}>
                  {t.form.duplicate.seeExisting}
                </Button>
              )}
              <Button onClick={createAnyway}>{t.form.duplicate.createAnyway}</Button>
            </div>
          </div>
        ) : (
          <MemberForm
            mode="create"
            submitting={create.isPending}
            onSubmit={handleSubmit}
            onCancel={() => handleClose(false)}
            serverError={serverError}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
