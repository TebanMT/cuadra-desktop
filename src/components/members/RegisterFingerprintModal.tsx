import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Loader2, Fingerprint, Check, AlertCircle, AlertTriangle } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { cn } from "@/lib/utils";
import { useRegisterFingerprint, type CollisionMember } from "@/hooks/useBiometric";
import { checkin as t } from "@/strings/checkin";

type Stage = "consent" | "capturing";

interface Props {
  memberId: string;
  memberName: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function RegisterFingerprintModal({ memberId, memberName, open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const [stage, setStage] = useState<Stage>("consent");
  const [accepted, setAccepted] = useState(false);

  const fp = useRegisterFingerprint(memberId, {
    onSuccess: () => {
      toast.success(t.fingerprint.success);
      onOpenChange(false);
    },
  });

  useEffect(() => {
    if (open) {
      setStage("consent");
      setAccepted(false);
      fp.reset();
    } else {
      fp.cancel();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  function startCapture() {
    setStage("capturing");
    fp.start();
  }

  function close() {
    fp.cancel();
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(true) : close())}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.fingerprint.title(memberName)}</DialogTitle>
        </DialogHeader>

        {stage === "consent" ? (
          <ConsentStep
            accepted={accepted}
            onChange={setAccepted}
            onCancel={close}
            onAccept={startCapture}
          />
        ) : (
          <CaptureStep
            done={fp.progress.captures_done}
            total={fp.progress.captures_total}
            status={fp.progress.status}
            error={fp.progress.error}
            collisionMember={fp.progress.collisionMember}
            onCancel={close}
            onSeeExisting={(id) => {
              close();
              navigate(`/members/${id}`);
            }}
            onRetry={() => {
              fp.reset();
              startCapture();
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function ConsentStep({
  accepted,
  onChange,
  onAccept,
  onCancel,
}: {
  accepted: boolean;
  onChange(v: boolean): void;
  onAccept(): void;
  onCancel(): void;
}) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border bg-muted/50 p-4 text-sm space-y-2">
        <p className="font-semibold">{t.fingerprint.consentTitle}</p>
        <ul className="list-disc pl-5 space-y-1 text-muted-foreground">
          {t.fingerprint.consentBody.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      </div>

      <label className="flex items-start gap-2 cursor-pointer text-sm">
        <Checkbox
          checked={accepted}
          onCheckedChange={(v) => onChange(v === true)}
          className="mt-0.5"
          aria-label={t.fingerprint.consentCheckbox}
        />
        <span>{t.fingerprint.consentCheckbox}</span>
      </label>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="outline" onClick={onCancel} type="button">
          {t.fingerprint.cancel}
        </Button>
        <Button onClick={onAccept} disabled={!accepted} type="button">
          {t.fingerprint.consentAccept}
        </Button>
      </div>
    </div>
  );
}

function CaptureStep({
  done,
  total,
  status,
  error,
  collisionMember,
  onCancel,
  onSeeExisting,
  onRetry,
}: {
  done: number;
  total: number;
  status: "idle" | "waiting" | "capturing" | "success" | "failed";
  error?: string;
  collisionMember?: CollisionMember;
  onCancel(): void;
  onSeeExisting(id: string): void;
  onRetry(): void;
}) {
  const failed = status === "failed";
  const success = status === "success";
  const collision = failed && error === "collision" && collisionMember;

  // Collision: the captured finger matches an enrolled template for another
  // socio. Show a distinct triangular warning + steer the operator toward the
  // existing profile or cancelling out.
  if (collision && collisionMember) {
    return (
      <div className="space-y-4">
        <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full ring-8 bg-warning/10 text-warning ring-warning/30">
          <AlertTriangle className="h-20 w-20" strokeWidth={1.4} />
        </div>
        <p className="text-center font-medium">{t.fingerprint.errorCollision(collisionMember.name)}</p>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onCancel} type="button">
            {t.fingerprint.collisionCancel}
          </Button>
          <Button onClick={() => onSeeExisting(collisionMember.id)} type="button">
            {t.fingerprint.seeExisting(collisionMember.name)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {failed && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {error === "reader"
              ? t.fingerprint.errorReader
              : error === "capture"
              ? t.fingerprint.errorCapture
              : error === "timeout"
              ? t.fingerprint.errorTimeout
              : t.fingerprint.errorGeneric}
          </AlertDescription>
        </Alert>
      )}

      <div
        className={cn(
          "mx-auto flex h-44 w-44 items-center justify-center rounded-full ring-8 transition-colors",
          failed
            ? "bg-destructive/10 text-destructive ring-destructive/30"
            : success
            ? "bg-success/10 text-success ring-success/30"
            : "bg-primary/10 text-primary ring-primary/20"
        )}
      >
        {success ? (
          <Check className="h-20 w-20" strokeWidth={3} />
        ) : status === "capturing" ? (
          <Loader2 className="h-20 w-20 animate-spin" />
        ) : (
          <Fingerprint className="h-20 w-20" strokeWidth={1.4} />
        )}
      </div>

      <div className="text-center space-y-1">
        <p className="font-medium">
          {status === "capturing"
            ? t.fingerprint.processing
            : status === "waiting"
            ? (t.fingerprint.captureByIndex[done] ?? t.fingerprint.waitingPlace)
            : status === "success"
            ? t.fingerprint.success
            : failed
            ? ""
            : t.fingerprint.instruction}
        </p>
        {/* La sesión de enroll del sidecar pide `required_samples`
            dedazos (hoy 3); con total 1 el contador sería ruido. */}
        {total > 1 && (
          <p className="text-2xl font-bold tabular-nums">{t.fingerprint.capturesLabel(done, total)}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {failed ? (
          <>
            <Button variant="outline" onClick={onCancel} type="button">
              {t.fingerprint.cancel}
            </Button>
            <Button onClick={onRetry} type="button">
              {t.fingerprint.start}
            </Button>
          </>
        ) : (
          <Button variant="outline" onClick={onCancel} type="button">
            {t.fingerprint.cancel}
          </Button>
        )}
      </div>
    </div>
  );
}
