import { useEffect, useState } from "react";
import { Copy, Loader2, RefreshCw } from "lucide-react";
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
  generatePassword,
  useCreateOperator,
} from "@/hooks/useOperators";
import { ApiError } from "@/lib/api";
import { settings as t } from "@/strings/settings";

interface Props {
  open: boolean;
  onOpenChange(o: boolean): void;
}

export function OperatorCreateModal({ open, onOpenChange }: Props) {
  const create = useCreateOperator();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<{ email: string; password: string } | null>(null);

  useEffect(() => {
    if (open) {
      setFullName("");
      setEmail("");
      setPhone("");
      setPassword(generatePassword(6));
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
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
      setError(t.operators.errors.emailInvalid);
      return;
    }
    if (password.length < 6) {
      setError(t.operators.errors.passwordShort);
      return;
    }

    try {
      const res = await create.mutateAsync({
        full_name: fullName.trim(),
        email: email.trim().toLowerCase(),
        phone: phone.trim() || undefined,
        password,
      });
      setCreated({
        email: res.user.email,
        password: res.generated_password ?? password,
      });
      toast.success(t.operators.createForm.success);
    } catch (err) {
      if (err instanceof ApiError && err.code === "email_already_in_use") {
        setError(t.operators.errors.emailDuplicated);
      } else {
        setError(err instanceof ApiError ? err.message : t.operators.errors.generic);
      }
    }
  }

  function copyPassword() {
    if (!created) return;
    navigator.clipboard.writeText(`${created.email}\n${created.password}`).then(() => {
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
              <DialogDescription className="sr-only">Crear nuevo operador.</DialogDescription>
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
                <Label htmlFor="op-email">{t.operators.fields.email}</Label>
                <Input
                  id="op-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="op-phone">{t.operators.fields.phone}</Label>
                <Input
                  id="op-phone"
                  value={phone}
                  onChange={(e) => setPhone(e.target.value)}
                  placeholder="+52 ..."
                />
              </div>
              <div className="space-y-1">
                <Label htmlFor="op-password">{t.operators.fields.password}</Label>
                <div className="flex gap-2">
                  <Input
                    id="op-password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    className="font-mono tracking-wider"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={() => setPassword(generatePassword(6))}
                    title={t.operators.createForm.generatePassword}
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-muted-foreground">{t.operators.createForm.shareHint}</p>
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
              <DialogDescription>{t.operators.createForm.successHint}</DialogDescription>
            </DialogHeader>
            <div className="rounded-md border bg-muted/40 p-4 space-y-2 font-mono text-sm">
              <div>
                <span className="text-muted-foreground">Correo:</span>{" "}
                <span className="font-semibold">{created.email}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Contraseña:</span>{" "}
                <span className="font-semibold tracking-wider">{created.password}</span>
              </div>
            </div>
            <div className="flex justify-between pt-2">
              <Button variant="outline" onClick={copyPassword}>
                <Copy className="h-4 w-4" />
                {t.operators.createForm.copyPassword}
              </Button>
              <Button onClick={() => onOpenChange(false)}>{t.operators.createForm.done}</Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
