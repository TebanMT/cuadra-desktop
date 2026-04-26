import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  RadioGroup,
  RadioGroupItem,
} from "@/components/ui/radio-group";
import {
  useMarkContactAttempt,
  useMarkLost,
  type ContactAttemptInput,
} from "@/hooks/useReports";
import { ApiError } from "@/lib/api";
import { attention as t } from "@/strings/attention";

interface Props {
  open: boolean;
  onOpenChange(o: boolean): void;
  memberID: string;
  memberName: string;
  onSuccess?(): void;
}

export function ContactAttemptModal({ open, onOpenChange, memberID, memberName, onSuccess }: Props) {
  const mark = useMarkContactAttempt(memberID);
  const markLost = useMarkLost(memberID);

  const [channel, setChannel] = useState<ContactAttemptInput["channel"]>("whatsapp");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmLost, setConfirmLost] = useState(false);

  useEffect(() => {
    if (open) {
      setChannel("whatsapp");
      setNote("");
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await mark.mutateAsync({
        channel,
        note: note.trim() || undefined,
      });
      toast.success(t.contactModal.success);
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.contactModal.error);
    }
  }

  async function doMarkLost() {
    setError(null);
    try {
      await markLost.mutateAsync({});
      toast.success(t.contactModal.successLost(memberName));
      setConfirmLost(false);
      onSuccess?.();
      onOpenChange(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : t.contactModal.error);
      setConfirmLost(false);
    }
  }

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>{t.contactModal.title(memberName)}</DialogTitle>
            <DialogDescription className="sr-only">
              Registrar intento de contacto.
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4" noValidate>
            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}
            <div className="space-y-2">
              <Label>{t.contactModal.channelLabel}</Label>
              <RadioGroup
                value={channel}
                onValueChange={(v) => setChannel(v as ContactAttemptInput["channel"])}
                className="grid grid-cols-2 gap-2"
              >
                {(
                  Object.entries(t.contactModal.channels) as [
                    ContactAttemptInput["channel"],
                    string,
                  ][]
                ).map(([k, label]) => (
                  <Label
                    key={k}
                    htmlFor={`ch-${k}`}
                    className="flex items-center gap-2 rounded-md border px-3 py-2 cursor-pointer hover:bg-muted/40"
                  >
                    <RadioGroupItem value={k} id={`ch-${k}`} />
                    <span>{label}</span>
                  </Label>
                ))}
              </RadioGroup>
            </div>
            <div className="space-y-1">
              <Label htmlFor="ca-note">{t.contactModal.noteLabel}</Label>
              <Textarea
                id="ca-note"
                rows={3}
                value={note}
                placeholder={t.contactModal.notePlaceholder}
                onChange={(e) => setNote(e.target.value)}
              />
            </div>
            <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between pt-2">
              <Button
                type="button"
                variant="ghost"
                className="text-destructive hover:bg-destructive/10"
                onClick={() => setConfirmLost(true)}
                disabled={mark.isPending || markLost.isPending}
              >
                {t.contactModal.markLost}
              </Button>
              <Button type="submit" disabled={mark.isPending}>
                {mark.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {mark.isPending ? t.contactModal.submitting : t.contactModal.submit}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmLost} onOpenChange={setConfirmLost}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{t.contactModal.confirmLost.title(memberName)}</AlertDialogTitle>
            <AlertDialogDescription>{t.contactModal.confirmLost.body}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={markLost.isPending}>
              {t.contactModal.confirmLost.cancel}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                doMarkLost();
              }}
              disabled={markLost.isPending}
              className="bg-destructive hover:bg-destructive/90"
            >
              {markLost.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              {t.contactModal.confirmLost.confirm}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
