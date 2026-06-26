import { useEffect, useState } from "react";
import { Loader2, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAssignMemberNumber, type Dispatch } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { members as t } from "@/strings/members";

interface Props {
  memberId: string;
  memberName: string;
  /** Número de socio ya presente — cuando viene, abre mostrándolo para que el
   * operador lo lea / copie antes de decidir si regenera (ADR-010). */
  initialNumber?: number;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function AssignMemberNumberModal({ memberId, memberName, initialNumber, open, onOpenChange }: Props) {
  const assign = useAssignMemberNumber(memberId);
  const [number, setNumber] = useState<number | null>(null);
  // dispatch refleja el último resultado del envío por WhatsApp tras un
  // generate. Null en la apertura inicial (número existente sin acción)
  // porque el `initialNumber` ya fue notificado al inscribir.
  const [dispatch, setDispatch] = useState<Dispatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setDispatch(null);
      // Si el socio ya tiene número, lo mostramos tal cual sin re-rolar.
      // El operador decide regenerar con "Generar nuevo número".
      if (initialNumber) {
        setNumber(initialNumber);
      } else {
        setNumber(null);
        generate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialNumber]);

  async function generate() {
    setError(null);
    try {
      const res = await assign.mutateAsync();
      setNumber(res.member_number);
      setDispatch(res.dispatch ?? null);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.form.errors.generic);
      } else {
        setError(t.form.errors.generic);
      }
    }
  }

  async function copyNumber() {
    if (number == null) return;
    try {
      await navigator.clipboard.writeText(String(number));
      toast.success(t.memberNumber.copied);
    } catch {
      toast.error(t.form.errors.generic);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initialNumber ? t.memberNumber.titleChange : t.memberNumber.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground">{t.memberNumber.description}</p>

          <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-6 text-center space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              {t.memberNumber.label(memberName)}
            </div>
            <div className="text-5xl font-bold tracking-[0.4em] tabular-nums text-foreground">
              {assign.isPending && number == null ? (
                <Loader2 className="h-8 w-8 animate-spin inline-block" />
              ) : (
                number ?? "····"
              )}
            </div>
          </div>

          {dispatch && (
            <p className="text-xs text-center text-muted-foreground">
              {dispatch.dispatched && dispatch.recipient_phone
                ? t.memberNumber.sentToWhatsApp(dispatch.recipient_phone)
                : dispatch.skipped_reason === "whatsapp_not_connected"
                ? t.memberNumber.notSentNoWhatsApp
                : dispatch.skipped_reason === "no_member_phone"
                ? t.memberNumber.notSentNoPhone
                : t.memberNumber.notSent}
            </p>
          )}

          <p className="text-xs text-muted-foreground text-center">{t.memberNumber.disclaimer}</p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={generate}
              disabled={assign.isPending}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              {t.memberNumber.regenerate}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyNumber} disabled={number == null || assign.isPending} type="button">
                <Copy className="h-4 w-4" />
                {t.memberNumber.copy}
              </Button>
              <Button onClick={() => onOpenChange(false)} type="button">
                {t.memberNumber.done}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
