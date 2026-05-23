import { useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  useUpdateMember,
  type Member,
  type UpdateMemberInput,
} from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { members as t } from "@/strings/members";
import { MemberForm, type MemberFormSubmitPayload } from "./MemberForm";

interface Props {
  memberId: string;
  initial: Member;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function MemberEditDialog({ memberId, initial, open, onOpenChange }: Props) {
  const update = useUpdateMember(memberId);
  const [serverError, setServerError] = useState<string | null>(null);

  function handleClose(next: boolean) {
    if (!next) setServerError(null);
    onOpenChange(next);
  }

  async function handleSubmit(p: MemberFormSubmitPayload) {
    setServerError(null);
    const v = p.values;
    const payload: UpdateMemberInput = {
      full_name: v.full_name.trim(),
      // v.phone ya viene en E.164 desde MemberForm (PhoneInput +
      // formatE164). Antes hacíamos slice(-10) para forzar 10 dígitos MX,
      // pero eso descartaba el código de país de números argentinos /
      // españoles / etc. que el selector ya admite.
      phone: v.phone,
      email: v.email.trim(),
      birthdate: v.birthdate,
      photo_url: v.photo_url,
      notes: v.notes.trim(),
      // En edit SÍ mandamos el campo (incluso ""), porque "" = "limpiar
      // captura" — el operador puede pulsar "Quitar" para volver a NULL.
      // Distingue de create donde omitir significa "no toques".
      gender: v.gender,
    };
    try {
      await update.mutateAsync(payload);
      toast.success(t.form.success.updated);
      handleClose(false);
    } catch (e) {
      if (e instanceof ApiError) {
        const data = e.details as Record<string, unknown> | null;
        setServerError((data?.exception as string | undefined) || t.form.errors.generic);
      } else {
        setServerError(t.form.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.form.titleEdit}</DialogTitle>
        </DialogHeader>
        <MemberForm
          mode="edit"
          memberId={memberId}
          initial={{
            full_name: initial.full_name,
            phone: initial.phone,
            email: initial.email ?? "",
            birthdate: initial.birthdate ?? "",
            photo_url: initial.photo_url ?? "",
            notes: initial.notes ?? "",
            gender: initial.gender ?? "",
          }}
          submitting={update.isPending}
          onSubmit={handleSubmit}
          onCancel={() => handleClose(false)}
          serverError={serverError}
        />
      </DialogContent>
    </Dialog>
  );
}
