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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useOverrideCheckin, checkinErrorMessage, type CheckinEvent } from "@/hooks/useCheckin";
import { checkin as t } from "@/strings/checkin";

interface Props {
  memberId: string;
  memberName: string;
  originalCheckinId?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
  onSuccess(ev: CheckinEvent): void;
}

export function OverrideDialog({
  memberId,
  memberName,
  originalCheckinId,
  open,
  onOpenChange,
  onSuccess,
}: Props) {
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const override = useOverrideCheckin();

  useEffect(() => {
    if (open) {
      setReason("");
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (reason.trim().length < 5) {
      setError(t.override.reasonRequired);
      return;
    }
    try {
      const res = await override.mutateAsync({
        member_id: memberId,
        reason: reason.trim(),
        ...(originalCheckinId ? { original_checkin_id: originalCheckinId } : {}),
      });
      toast.success(t.override.success(memberName));
      onSuccess(res);
      onOpenChange(false);
    } catch (err) {
      setError(checkinErrorMessage(err, t.override.reasonRequired));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.override.title(memberName)}</DialogTitle>
          <DialogDescription>{t.override.description}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="override-reason">{t.override.reasonLabel}</Label>
            <Textarea
              id="override-reason"
              autoFocus
              rows={3}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t.override.reasonPlaceholder}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={override.isPending}
            >
              {t.override.cancel}
            </Button>
            <Button type="submit" disabled={override.isPending}>
              {override.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.override.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
