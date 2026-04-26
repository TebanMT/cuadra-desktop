import { useEffect, useMemo, useState } from "react";
import { Loader2 } from "lucide-react";
import { addDays } from "date-fns";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useLockExpiry, type LockExpiryInput } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { fmtDate, fmtIso, parseDate } from "@/lib/dates";
import { members as t } from "@/strings/members";

interface Props {
  membershipId: string;
  memberName: string;
  currentExpiry: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

type Mode = "extend" | "set" | "reset";

export function LockExpiryModal({ membershipId, memberName, currentExpiry, open, onOpenChange }: Props) {
  const lock = useLockExpiry(membershipId);

  const [mode, setMode] = useState<Mode>("extend");
  const [days, setDays] = useState<string>("7");
  const [date, setDate] = useState<string>(currentExpiry);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode("extend");
      setDays("7");
      setDate(currentExpiry);
      setReason("");
      setError(null);
    }
  }, [open, currentExpiry]);

  const newExpiryPreview = useMemo(() => {
    if (mode === "extend") {
      const n = parseInt(days, 10);
      if (!Number.isFinite(n)) return null;
      const start = parseDate(currentExpiry);
      if (!start) return null;
      return fmtDate(addDays(start, n));
    }
    return null;
  }, [mode, days, currentExpiry]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (reason.trim().length < 5) {
      setError(t.lockExpiry.reasonRequired);
      return;
    }

    let payload: LockExpiryInput;
    if (mode === "extend") {
      const n = parseInt(days, 10);
      if (!Number.isFinite(n)) {
        setError(t.lockExpiry.daysRequired);
        return;
      }
      payload = { mode: "extend", days: n, reason: reason.trim() };
    } else if (mode === "set") {
      if (!date) {
        setError(t.lockExpiry.dateRequired);
        return;
      }
      payload = { mode: "set", new_expiry: date, reason: reason.trim() };
    } else {
      payload = { mode: "reset", reason: reason.trim() };
    }

    try {
      const res = await lock.mutateAsync(payload);
      toast.success(t.lockExpiry.success(fmtDate(res.new_expiry)));
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

  const minDate = fmtIso(new Date());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>
            {t.lockExpiry.title} — {memberName}
          </DialogTitle>
          <p className="text-sm text-muted-foreground">{t.lockExpiry.currentExpiry(fmtDate(currentExpiry))}</p>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-3">
            <div className="text-sm font-medium">{t.lockExpiry.question}</div>
            <RadioGroup value={mode} onValueChange={(v) => setMode(v as Mode)} className="space-y-3">
              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="extend" id="le-extend" />
                  <span>{t.lockExpiry.modes.extend}</span>
                </label>
                {mode === "extend" && (
                  <div className="pl-7 flex items-center gap-2">
                    <Input
                      type="number"
                      inputMode="numeric"
                      value={days}
                      onChange={(e) => setDays(e.target.value.replace(/[^\d-]/g, ""))}
                      className="w-24 h-9"
                    />
                    <span className="text-sm text-muted-foreground">{t.lockExpiry.daysSuffix}</span>
                    <span className="text-sm font-medium">{newExpiryPreview ?? "—"}</span>
                  </div>
                )}
              </div>

              <div className="space-y-2">
                <label className="flex items-center gap-2 cursor-pointer">
                  <RadioGroupItem value="set" id="le-set" />
                  <span>{t.lockExpiry.modes.set}</span>
                </label>
                {mode === "set" && (
                  <div className="pl-7">
                    <Input
                      type="date"
                      value={date}
                      min={minDate}
                      onChange={(e) => setDate(e.target.value)}
                      className="w-48 h-9"
                    />
                  </div>
                )}
              </div>

              <label className="flex items-center gap-2 cursor-pointer">
                <RadioGroupItem value="reset" id="le-reset" />
                <span>{t.lockExpiry.modes.reset}</span>
              </label>
            </RadioGroup>
          </div>

          <div className="space-y-2">
            <Label htmlFor="le-reason">{t.lockExpiry.reasonLabel} *</Label>
            <Textarea
              id="le-reason"
              rows={3}
              value={reason}
              placeholder={t.lockExpiry.reasonPlaceholder}
              onChange={(e) => setReason(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => onOpenChange(false)} disabled={lock.isPending}>
              {t.lockExpiry.cancel}
            </Button>
            <Button type="submit" disabled={lock.isPending}>
              {lock.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.lockExpiry.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
