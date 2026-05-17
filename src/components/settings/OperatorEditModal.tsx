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
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DEFAULT_DIAL_CODE,
  PhoneInput,
  formatE164,
  phoneNumberValid,
  splitE164,
} from "@/components/shared/PhoneInput";
import { useUpdateOperator, type Operator } from "@/hooks/useOperators";
import { ApiError } from "@/lib/api";
import { settings as t } from "@/strings/settings";

interface Props {
  operator: Operator | null;
  open: boolean;
  onOpenChange(o: boolean): void;
}

export function OperatorEditModal({ operator, open, onOpenChange }: Props) {
  const update = useUpdateOperator(operator?.id ?? "");
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phoneDialCode, setPhoneDialCode] = useState<string>(DEFAULT_DIAL_CODE);
  const [phoneNumber, setPhoneNumber] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && operator) {
      setFullName(operator.full_name);
      setEmail(operator.email);
      const split = splitE164(operator.phone ?? "");
      setPhoneDialCode(split.dialCode);
      setPhoneNumber(split.number);
      setError(null);
    }
  }, [open, operator]);

  // Un operador es "legacy pendiente migrar" cuando no tiene PIN y
  // tampoco tiene teléfono. Forzar phone+PIN lo migra al modelo nuevo.
  const isLegacyPending = !!operator && !operator.has_pin && !operator.phone;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!operator) return;

    if (fullName.trim().length < 3) {
      setError(t.operators.errors.nameShort);
      return;
    }
    if (!phoneNumberValid(phoneDialCode, phoneNumber)) {
      setError(t.operators.errors.phoneRequired);
      return;
    }
    // Email opcional — solo validamos cuando viene no-vacío.
    const emailClean = email.trim();
    if (emailClean && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(emailClean)) {
      setError(t.operators.errors.emailInvalid);
      return;
    }

    try {
      await update.mutateAsync({
        full_name: fullName.trim(),
        // "" significa "limpiar el correo" — el BE lo permite para operators.
        email: emailClean.toLowerCase(),
        phone: formatE164(phoneDialCode, phoneNumber),
      });
      toast.success(t.operators.editForm.success);
      onOpenChange(false);
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

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle>{t.operators.edit}</DialogTitle>
          <DialogDescription className="sr-only">Editar operador.</DialogDescription>
        </DialogHeader>
        <form onSubmit={submit} className="space-y-4" noValidate>
          {isLegacyPending && (
            <Alert variant="warning">
              <AlertDescription>{t.operators.editForm.legacyMigrate}</AlertDescription>
            </Alert>
          )}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <div className="space-y-1">
            <Label htmlFor="op-edit-name">{t.operators.fields.fullName}</Label>
            <Input
              id="op-edit-name"
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-edit-phone">{t.operators.fields.phone}</Label>
            <PhoneInput
              id="op-edit-phone"
              dialCode={phoneDialCode}
              number={phoneNumber}
              onDialCodeChange={setPhoneDialCode}
              onNumberChange={setPhoneNumber}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-edit-email">{t.operators.fields.emailOptional}</Label>
            <Input
              id="op-edit-email"
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
              disabled={update.isPending}
            >
              Cancelar
            </Button>
            <Button type="submit" disabled={update.isPending}>
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {update.isPending ? t.operators.editForm.submitting : t.operators.editForm.submit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
