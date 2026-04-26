import { useEffect, useState } from "react";
import { Loader2, Copy, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useAssignPin } from "@/hooks/useMembers";
import { ApiError } from "@/lib/api";
import { members as t } from "@/strings/members";

interface Props {
  memberId: string;
  memberName: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function AssignPinModal({ memberId, memberName, open, onOpenChange }: Props) {
  const assign = useAssignPin(memberId);
  const [pin, setPin] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setPin(null);
      setError(null);
      generate();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  async function generate() {
    setError(null);
    try {
      const res = await assign.mutateAsync();
      setPin(res.pin);
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
          <DialogTitle>{t.pin.title}</DialogTitle>
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
