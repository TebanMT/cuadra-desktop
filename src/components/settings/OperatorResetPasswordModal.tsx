import { useState } from "react";
import { Copy, Loader2 } from "lucide-react";
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
import { Button } from "@/components/ui/button";
import { useResetOperatorPassword, type Operator } from "@/hooks/useOperators";
import { ApiError } from "@/lib/api";
import { settings as t } from "@/strings/settings";

interface Props {
  operator: Operator | null;
  open: boolean;
  onOpenChange(o: boolean): void;
}

export function OperatorResetPasswordModal({ operator, open, onOpenChange }: Props) {
  const reset = useResetOperatorPassword(operator?.id ?? "");
  const [generated, setGenerated] = useState<{ password: string } | null>(null);

  async function doReset() {
    try {
      const res = await reset.mutateAsync();
      setGenerated({ password: res.password });
      toast.success(t.operators.resetPwd.success);
    } catch (err) {
      toast.error(err instanceof ApiError ? err.message : t.operators.errors.generic);
      onOpenChange(false);
    }
  }

  function copyPwd() {
    if (!generated || !operator) return;
    navigator.clipboard.writeText(`${operator.email}\n${generated.password}`).then(() => {
      toast.success(t.operators.createForm.copied);
    });
  }

  function close(o: boolean) {
    if (!o) {
      setGenerated(null);
      onOpenChange(false);
    }
  }

  if (!operator) return null;

  return (
    <>
      <AlertDialog open={open && !generated} onOpenChange={close}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.operators.resetPwd.title(operator.full_name)}</AlertDialogTitle>
            <AlertDialogDescription>{t.operators.resetPwd.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={reset.isPending}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doReset();
              }}
              disabled={reset.isPending}
            >
              {reset.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t.operators.resetPwd.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!generated} onOpenChange={close}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>✓ {t.operators.resetPwd.success}</DialogTitle>
            <DialogDescription>{t.operators.createForm.successHint}</DialogDescription>
          </DialogHeader>
          <div className="rounded-md border bg-muted/40 p-4 space-y-2 font-mono text-sm">
            <div>
              <span className="text-muted-foreground">Correo:</span>{" "}
              <span className="font-semibold">{operator.email}</span>
            </div>
            <div>
              <span className="text-muted-foreground">Contraseña:</span>{" "}
              <span className="font-semibold tracking-wider">{generated?.password}</span>
            </div>
          </div>
          <div className="flex justify-between pt-2">
            <Button variant="outline" onClick={copyPwd}>
              <Copy className="h-4 w-4" />
              {t.operators.createForm.copyPin}
            </Button>
            <Button onClick={() => close(false)}>{t.operators.createForm.done}</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
