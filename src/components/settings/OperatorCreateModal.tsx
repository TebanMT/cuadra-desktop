import { useEffect, useState } from "react";
import { CheckCircle2, Copy, Loader2, MessageCircle } from "lucide-react";
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
  DEFAULT_DIAL_CODE,
  PhoneInput,
  formatE164,
  phoneNumberValid,
} from "@/components/shared/PhoneInput";
import { useCreateOperator } from "@/hooks/useOperators";
import { ApiError } from "@/lib/api";
import { settings as t } from "@/strings/settings";

interface Props {
  open: boolean;
  onOpenChange(o: boolean): void;
}

type Result = {
  fullName: string;
  phone: string;
  pin: string;
  whatsappDelivery: boolean;
};

export function OperatorCreateModal({ open, onOpenChange }: Props) {
  const create = useCreateOperator();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState<string>(DEFAULT_DIAL_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Result | null>(null);

  useEffect(() => {
    if (open) {
      setFullName("");
      setEmail("");
      setPhoneDialCode(DEFAULT_DIAL_CODE);
      setPhoneNumber("");
      setError(null);
      setCreated(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (fullName.trim().length < 3) {
      setError(t.operators.errors.nameShort);
      return;
    }
    if (!phoneNumberValid(phoneDialCode, phoneNumber)) {
      setError(t.operators.errors.phoneRequired);
      return;
    }
    // Email opcional — solo se valida cuando viene poblado.
    const emailClean = email.trim();
    if (emailClean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      setError(t.operators.errors.emailInvalid);
      return;
    }

    try {
      const res = await create.mutateAsync({
        full_name: fullName.trim(),
        phone: formatE164(phoneDialCode, phoneNumber),
        email: emailClean ? emailClean.toLowerCase() : undefined,
      });
      setCreated({
        fullName: res.full_name,
        phone: res.phone,
        pin: res.pin,
        whatsappDelivery: res.whatsapp_delivery,
      });
      toast.success(t.operators.createForm.success);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.code === "email_already_in_use") {
          setError(t.operators.errors.emailDuplicated);
        } else if (err.code === "phone_taken_in_gym") {
          setError(t.operators.errors.phoneDuplicated);
        } else {
          setError(err.message);
        }
      } else {
        setError(t.operators.errors.generic);
      }
    }
  }

  function copyPin() {
    if (!created) return;
    navigator.clipboard.writeText(created.pin).then(() => {
      toast.success(t.operators.createForm.copied);
    });
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        {!created ? (
          <>
            <DialogHeader>
              <DialogTitle>{t.operators.createForm.title}</DialogTitle>
              <DialogDescription className="sr-only">
                Crear nuevo operador con PIN.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4" noValidate>
              {error && (
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
              )}
              <div className="space-y-1">
                <Label htmlFor="op-name">{t.operators.fields.fullName}</Label>
                <Input
                  id="op-name"
                  value={fullName}
                  onChange={(e) => setFullName(e.target.value)}
                  autoFocus
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="op-phone">{t.operators.fields.phone}</Label>
                <PhoneInput
                  id="op-phone"
                  dialCode={phoneDialCode}
                  number={phoneNumber}
                  onDialCodeChange={setPhoneDialCode}
                  onNumberChange={setPhoneNumber}
                />
                <p className="text-xs text-muted-foreground">
                  {t.operators.createForm.phoneHint}
                </p>
              </div>
              <div className="space-y-1">
                <Label htmlFor="op-email">{t.operators.fields.emailOptional}</Label>
                <Input
                  id="op-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="opcional@correo.com"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
                  disabled={create.isPending}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={create.isPending}>
                  {create.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                  {create.isPending
                    ? t.operators.createForm.submitting
                    : t.operators.createForm.submit}
                </Button>
              </div>
            </form>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>✓ {t.operators.createForm.success}</DialogTitle>
              <DialogDescription>
                {t.operators.createForm.successHint(created.fullName)}
              </DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted/40 p-6 space-y-3 text-center">
              <p className="text-xs uppercase tracking-wide text-muted-foreground">
                {t.operators.createForm.pinLabel}
              </p>
              <p className="text-5xl font-mono font-bold tracking-[0.3em]">
                {created.pin}
              </p>
              <p className="text-xs text-muted-foreground">
                {t.operators.createForm.pinHint}
              </p>
            </div>
            {created.whatsappDelivery ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  {t.operators.createForm.whatsappSent(created.phone)}
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
              <Button onClick={() => onOpenChange(false)}>
                {t.operators.createForm.done}
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
