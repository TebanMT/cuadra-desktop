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
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open && operator) {
      setFullName(operator.full_name);
      setEmail(operator.email);
      setPhone(operator.phone ?? "");
      setError(null);
    }
  }, [open, operator]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!operator) return;

    if (fullName.trim().length < 3) {
      setError(t.operators.errors.nameShort);
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.operators.errors.emailInvalid);
      return;
    }

    try {
      await update.mutateAsync({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || null,
      });
      toast.success(t.operators.editForm.success);
      onOpenChange(false);
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_already_in_use") {
        setError(t.operators.errors.emailDuplicated);
      } else {
        setError(err instanceof ApiError ? err.message : t.operators.errors.generic);
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
            <Label htmlFor="op-edit-email">{t.operators.fields.email}</Label>
            <Input
              id="op-edit-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="op-edit-phone">{t.operators.fields.phone}</Label>
            <Input
              id="op-edit-phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+52 ..."
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
