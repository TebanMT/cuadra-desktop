import { useEffect, useState } from "react";
import { AlertTriangle, Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  useConfirmTransferOwnership,
  useStartTransferOwnership,
} from "@/hooks/useGym";
import { useOperators } from "@/hooks/useOperators";
import { useAuthStore } from "@/stores/useAuthStore";
import { ApiError } from "@/lib/api";
import { settings as t } from "@/strings/settings";

interface Props {
  open: boolean;
  onOpenChange(o: boolean): void;
}

export function TransferOwnershipModal({ open, onOpenChange }: Props) {
  const operators = useOperators(false);
  const start = useStartTransferOwnership();
  const confirm = useConfirmTransferOwnership();
  const ownerEmail = useAuthStore((s) => s.user?.email ?? "");

  const [step, setStep] = useState<1 | 2>(1);
  const [targetID, setTargetID] = useState<string>("");
  const [otp, setOtp] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setTargetID("");
      setOtp("");
      setError(null);
    }
  }, [open]);

  const eligible = (operators.data?.items ?? []).filter(
    (op) => op.role === "operator" && op.active
  );

  async function startTransfer() {
    setError(null);
    if (!targetID) {
      setError(t.transfer.errors.targetRequired);
      return;
    }
    try {
      await start.mutateAsync({ target_user_id: targetID });
      setStep(2);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.transfer.errors.sendCode);
    }
  }

  async function confirmTransfer() {
    setError(null);
    if (!otp.trim()) {
      setError(t.transfer.errors.codeRequired);
      return;
    }
    try {
      await confirm.mutateAsync({ target_user_id: targetID, otp: otp.trim() });
      toast.success(t.transfer.success);
      onOpenChange(false);
      setTimeout(() => {
        window.location.reload();
      }, 800);
    } catch (err) {
      if (err instanceof ApiError && (err.code === "invalid_otp" || err.status === 400)) {
        setError(t.transfer.errors.codeInvalid);
      } else {
        setError(err instanceof ApiError ? err.message : t.transfer.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {step === 1 ? t.transfer.titleStep1 : t.transfer.titleStep2}
          </DialogTitle>
          <DialogDescription className="sr-only">
            Transferir ownership del gym.
          </DialogDescription>
        </DialogHeader>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {step === 1 && (
          <div className="space-y-4">
            <Alert variant="warning">
              <AlertTriangle className="h-4 w-4" />
              <AlertDescription>{t.transfer.warning}</AlertDescription>
            </Alert>

            <div className="space-y-1">
              <Label htmlFor="tx-target">{t.transfer.selectLabel}</Label>
              {eligible.length === 0 ? (
                <p className="text-sm text-muted-foreground py-2">
                  {t.transfer.selectEmpty}
                </p>
              ) : (
                <Select value={targetID} onValueChange={setTargetID}>
                  <SelectTrigger id="tx-target">
                    <SelectValue placeholder={t.transfer.selectPlaceholder} />
                  </SelectTrigger>
                  <SelectContent>
                    {eligible.map((op) => (
                      <SelectItem key={op.id} value={op.id}>
                        {op.full_name} · {op.email}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>

            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={start.isPending}>
                {t.transfer.cancel}
              </Button>
              <Button onClick={startTransfer} disabled={start.isPending || eligible.length === 0}>
                {start.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {t.transfer.next}
              </Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="space-y-4">
            <p className="text-sm">{t.transfer.sentCode(ownerEmail)}</p>
            <div className="space-y-1">
              <Label htmlFor="tx-otp">{t.transfer.codeLabel}</Label>
              <Input
                id="tx-otp"
                inputMode="numeric"
                maxLength={6}
                placeholder={t.transfer.codePlaceholder}
                value={otp}
                onChange={(e) => setOtp(e.target.value.replace(/\D/g, ""))}
                className="text-center text-2xl tracking-[0.5em] font-mono h-14"
                autoFocus
              />
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => onOpenChange(false)} disabled={confirm.isPending}>
                {t.transfer.cancel}
              </Button>
              <Button onClick={confirmTransfer} disabled={confirm.isPending}>
                {confirm.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {confirm.isPending ? t.transfer.confirming : t.transfer.confirm}
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
