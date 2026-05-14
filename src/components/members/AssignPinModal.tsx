import { useEffect, useState } from "react";
import { Loader2, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAssignPin, type PinDispatch } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { members as t } from "@/strings/members";

interface Props {
  memberId: string;
  memberName: string;
  /** Initial PIN already present on the member — when set, opens directly
   * showing that PIN so the operator can read / copy it before deciding
   * whether to regenerate. */
  initialPin?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function AssignPinModal({ memberId, memberName, initialPin, open, onOpenChange }: Props) {
  const assign = useAssignPin(memberId);
  const [pin, setPin] = useState<string | null>(null);
  // dispatch refleja el último resultado del envío por WhatsApp tras un
  // generate. Null en la apertura inicial (PIN existente sin acción)
  // porque el `initialPin` ya fue notificado al inscribir.
  const [dispatch, setDispatch] = useState<PinDispatch | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setError(null);
      setDispatch(null);
      // If the socio already has a PIN, show it as-is without re-rolling.
      // Operator decides via "Generar nuevo PIN" whether to regenerate.
      if (initialPin) {
        setPin(initialPin);
      } else {
        setPin(null);
        generate();
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, initialPin]);

  async function generate() {
    setError(null);
    try {
      const res = await assign.mutateAsync();
      setPin(res.pin);
      setDispatch(res.pin_dispatch ?? null);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.form.errors.generic);
      } else {
        setError(t.form.errors.generic);
      }
    }
  }

  async function copyPin() {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      toast.success(t.pin.copied);
    } catch {
      toast.error(t.form.errors.generic);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{initialPin ? t.pin.titleChange : t.pin.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <p className="text-sm text-muted-foreground">{t.pin.description}</p>

          <div className="rounded-lg border-2 border-primary/20 bg-primary/5 p-6 text-center space-y-2">
            <div className="text-sm font-medium text-muted-foreground">
              {t.pin.label(memberName)}
            </div>
            <div className="text-5xl font-bold tracking-[0.4em] tabular-nums text-foreground">
              {assign.isPending && !pin ? <Loader2 className="h-8 w-8 animate-spin inline-block" /> : pin || "····"}
            </div>
          </div>

          {dispatch && (
            <p className="text-xs text-center text-muted-foreground">
              {dispatch.dispatched && dispatch.recipient_phone
                ? t.pin.sentToWhatsApp(dispatch.recipient_phone)
                : dispatch.skipped_reason === "whatsapp_not_connected"
                ? t.pin.notSentNoWhatsApp
                : dispatch.skipped_reason === "no_member_phone"
                ? t.pin.notSentNoPhone
                : t.pin.notSent}
            </p>
          )}

          <p className="text-xs text-muted-foreground text-center">{t.pin.disclaimer}</p>

          <div className="flex flex-col-reverse sm:flex-row sm:justify-between gap-2 pt-2">
            <Button
              variant="outline"
              onClick={generate}
              disabled={assign.isPending}
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
              {t.pin.regenerate}
            </Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={copyPin} disabled={!pin || assign.isPending} type="button">
                <Copy className="h-4 w-4" />
                {t.pin.copy}
              </Button>
              <Button onClick={() => onOpenChange(false)} type="button">
                {t.pin.done}
              </Button>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
