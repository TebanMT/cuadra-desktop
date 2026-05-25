import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useVerifyOperatorPassword } from "@/hooks/useCheckin";
import { ApiError } from "@/lib/api";
import { checkin as t } from "@/strings/checkin";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  onAuthorized(): void;
}

export function KioskExitDialog({ open, onOpenChange, onAuthorized }: Props) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const verify = useVerifyOperatorPassword();

  useEffect(() => {
    if (open) {
      setPassword("");
      setError(null);
    }
  }, [open]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!password) return;
    setError(null);
    try {
      await verify.mutateAsync({ password });
      onAuthorized();
      onOpenChange(false);
    } catch (err) {
      // Distinguir tres modos de falla. El handler del sidecar
      // (auth_controller_sidecar.handleVerifyPassword) NUNCA hace round-trip
      // al cloud — todo es contra el cache local SQLite, así que "sin
      // internet" no es una excusa válida. Las únicas causas de error son:
      //
      //   1. 401 invalid_credentials — contraseña incorrecta (el operador
      //      se equivocó). Mensaje clásico.
      //   2. 401 no_cache — el sidecar nunca tuvo un login con internet,
      //      no hay password_hash que comparar. El operador tiene que
      //      conectarse al menos una vez con red antes de poder salir.
      //   3. No-ApiError (fetch falló, sidecar no arranca, timeout) — el
      //      proceso del sidecar no responde. Pre-fix devolvíamos
      //      "contraseña incorrecta" y el operador re-intentaba password,
      //      perdía tiempo y se frustraba.
      if (err instanceof ApiError) {
        if (err.status === 401 && err.code === "auth.verify.errors.no_cache") {
          setError(t.kiosk.exitNoCache);
        } else if (err.status === 401) {
          setError(t.kiosk.exitWrongPassword);
        } else {
          setError(t.kiosk.exitGenericError);
        }
      } else {
        // TypeError / abort / timeout — el sidecar no es accesible.
        setError(t.kiosk.exitOffline);
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-sm">
        <DialogHeader>
          <DialogTitle>{t.kiosk.exitTitle}</DialogTitle>
          <DialogDescription>{t.kiosk.exitDescription}</DialogDescription>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="kiosk-pass">{t.kiosk.exitPasswordLabel}</Label>
            <Input
              id="kiosk-pass"
              type="password"
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
            />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              disabled={verify.isPending}
            >
              {t.kiosk.exitCancel}
            </Button>
            <Button type="submit" disabled={verify.isPending || !password}>
              {verify.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {t.kiosk.exitSubmit}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
