import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToggleMemberStatus, type MemberStatus } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { members as t } from "@/strings/members";

interface Props {
  memberId: string;
  memberName: string;
  currentStatus: MemberStatus;
  open: boolean;
  onOpenChange(open: boolean): void;
}

type SimpleStatus = "active" | "inactive";

function toSimple(s: MemberStatus): SimpleStatus {
  return s === "active" ? "active" : "inactive";
}

export function MemberStatusModal({ memberId, memberName, currentStatus, open, onOpenChange }: Props) {
  const toggle = useToggleMemberStatus(memberId);
  const [status, setStatus] = useState<SimpleStatus>(toSimple(currentStatus) === "active" ? "inactive" : "active");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setStatus(toSimple(currentStatus) === "active" ? "inactive" : "active");
      setReason("");
      setError(null);
    }
  }, [open, currentStatus]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await toggle.mutateAsync({ status, reason: reason.trim() || undefined });
      toast.success(t.status.success);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.form.errors.generic);
      } else {
        setError(t.form.errors.generic);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t.status.title} — {memberName}
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label>{t.status.label}</Label>
            <RadioGroup value={status} onValueChange={(v) => setStatus(v as SimpleStatus)} className="flex gap-4">
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="active" id="st-active" />
                <span>{t.status.options.active}</span>
              </label>
              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="inactive" id="st-inactive" />
                <span>{t.status.options.inactive}</span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="st-reason">{t.status.reasonLabel}</Label>
            <Textarea
              id="st-reason"
              rows={3}
              value={reason}
              placeholder={t.status.reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={toggle.isPending}>
              {t.form.cancel}
            </Button>
            <Button type="submit" disabled={toggle.isPending}>
              {toggle.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.status.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
