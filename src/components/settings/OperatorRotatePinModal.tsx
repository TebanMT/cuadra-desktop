import { useState } from "react";
import { CheckCircle2, Copy, Loader2, MessageCircle } from "lucide-react";
import { toast } from "sonner";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useRotateOperatorPIN, type Operator } from "@/hooks/useOperators";
import { ApiError } from "@/lib/api";
import { settings as t } from "@/strings/settings";

interface Props {
  operator: Operator | null;
  open: boolean;
  onOpenChange(o: boolean): void;
}

export function OperatorRotatePinModal({ operator, open, onOpenChange }: Props) {
  const rotate = useRotateOperatorPIN(operator?.id ?? "");
  const [result, setResult] = useState<{
    pin: string;
    whatsappDelivery: boolean;
    phone: string;
  } | null>(null);

  async function doRotate() {
    if (!operator) return;
    try {
      const res = await rotate.mutateAsync();
      setResult({
        pin: res.pin,
        whatsappDelivery: res.whatsapp_delivery,
        phone: operator.phone ?? "",
      });
      toast.success(t.operators.rotatePin.success);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.operators.errors.generic);
      onOpenChange(false);
    }
  }

  function copyPin() {
    if (!result) return;
    navigator.clipboard.writeText(result.pin).then(() => {
      toast.success(t.operators.createForm.copied);
    });
  }

  function close(o: boolean) {
    if (!o) {
      setResult(null);
      onOpenChange(false);
    }
  }

  if (!operator) return null;

  return (
    <>
      <AlertDialog open={open && !result} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.operators.rotatePin.title(operator.full_name)}</AlertDialogTitle>
            <AlertDialogDescription>{t.operators.rotatePin.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={rotate.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doRotate();
              }}
              disabled={rotate.isPending}
            >
              {rotate.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t.operators.rotatePin.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={open && !!result} onOpenChange={close}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>✓ {t.operators.rotatePin.success}</DialogTitle>
            <DialogDescription>
              {t.operators.rotatePin.resultHint(operator.full_name)}
            </DialogDescription>
          </DialogHeader>
          {result && (
            <>
              <div className="rounded-md border bg-muted/40 p-6 space-y-3 text-center">
                <p className="text-xs uppercase tracking-wide text-muted-foreground">
                  {t.operators.createForm.pinLabel}
                </p>
                <p className="text-5xl font-mono font-bold tracking-[0.3em]">
                  {result.pin}
                </p>
              </div>
              {result.whatsappDelivery ? (
                <Alert>
                  <CheckCircle2 className="h-4 w-4" />
                  <AlertDescription>
                    {t.operators.createForm.whatsappSent(result.phone)}
                  </AlertDescription>
                </Alert>
              ) : (
                <Alert variant="warning">
                  <MessageCircle className="h-4 w-4" />
                  <AlertDescription>
                    {t.operators.createForm.whatsappSkipped}
                  </AlertDescription>
                </Alert>
              )}
              <div className="flex justify-between pt-2">
                <Button variant="outline" onClick={copyPin}>
                  <Copy className="h-4 w-4" />
                  {t.operators.createForm.copyPin}
                </Button>
                <Button onClick={() => close(false)}>{t.operators.createForm.done}</Button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
