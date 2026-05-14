import { useEffect, useState } from "react";
import { KeyRound, Loader2, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/useAuthStore";
import { useAssignSelfPIN, useClearSelfPIN, useUpdateMe } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { SectionCard } from "@/components/shared/PagePrimitives";
import { PinPad } from "@/components/checkin/PinPad";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useQueryClient } from "@tanstack/react-query";
import { auth as authStrings } from "@/strings/auth";

const NAME_LOOKS_LIKE_EMAIL = /[@]/;

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const setSession = useAuthStore((s) => s.setSession);
  const gym = useAuthStore((s) => s.gym);
  const update = useUpdateMe();
  const assignPIN = useAssignSelfPIN();
  const clearPIN = useClearSelfPIN();
  const qc = useQueryClient();

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState(user?.phone ?? "");
  const [error, setError] = useState<string | null>(null);
  // PIN dialog state. Two passes (enter → confirm) so a typo on the new
  // PIN doesn't lock the operator out of the kiosk for the rest of the day.
  const [pinDialogOpen, setPinDialogOpen] = useState(false);
  const [pinStep, setPinStep] = useState<"enter" | "confirm">("enter");
  const [pinFirst, setPinFirst] = useState("");
  const [pinSecond, setPinSecond] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);

  function openPinDialog() {
    setPinDialogOpen(true);
    setPinStep("enter");
    setPinFirst("");
    setPinSecond("");
    setPinError(null);
  }

  async function submitPinFirst() {
    if (pinFirst.length !== 4) return;
    setPinStep("confirm");
    setPinError(null);
  }

  async function submitPinSecond() {
    if (pinSecond.length !== 4) return;
    if (pinFirst !== pinSecond) {
      setPinError(authStrings.setupPin.errors.mismatch);
      setPinSecond("");
      setPinStep("enter");
      setPinFirst("");
      return;
    }
    try {
      await assignPIN.mutateAsync({ pin: pinFirst });
      if (user && gym) {
        setSession({ ...user, has_pin: true }, gym);
      }
      // Invalidate the operators-list cache so /auth/login picks up the
      // new has_pin badge state on next render.
      qc.invalidateQueries({ queryKey: ["auth", "operators"] });
      toast.success(authStrings.setupPin.successToast);
      setPinDialogOpen(false);
    } catch (e) {
      const msg = e instanceof ApiError ? e.message : authStrings.setupPin.errors.generic;
      setPinError(msg || authStrings.setupPin.errors.generic);
    }
  }

  async function removePIN() {
    try {
      await clearPIN.mutateAsync();
      if (user && gym) {
        setSession({ ...user, has_pin: false }, gym);
      }
      qc.invalidateQueries({ queryKey: ["auth", "operators"] });
      toast.success("PIN borrado.");
    } catch {
      toast.error("No pudimos borrar el PIN.");
    }
  }

  // Re-sync local form when the persisted user mutates (e.g. /me hydration
  // returns fresh data after first paint).
  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name);
  }, [user?.full_name]);
  useEffect(() => {
    setPhone(user?.phone ?? "");
  }, [user?.phone]);

  const looksWrong =
    !!user?.full_name && NAME_LOOKS_LIKE_EMAIL.test(user.full_name);

  function validate(): string | null {
    const trimmed = fullName.trim();
    if (trimmed.length < 3 || trimmed.length > 100) {
      return "Tu nombre debe tener entre 3 y 100 caracteres.";
    }
    if (NAME_LOOKS_LIKE_EMAIL.test(trimmed)) {
      return "Tu nombre no puede tener arroba (@). Escribe tu nombre, no el correo.";
    }
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    const v = validate();
    if (v) return setError(v);

    try {
      await update.mutateAsync({
        full_name: fullName.trim(),
        phone: phone.trim() || null,
      });
      toast.success("Perfil actualizado.");
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message || "No pudimos guardar. Vuelve a intentar.");
      } else {
        setError("No pudimos guardar. Vuelve a intentar.");
      }
    }
  }

  return (
    <div className="p-6 space-y-6 max-w-2xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          Mi perfil
        </h1>
        <p className="text-sm text-muted-foreground">
          Cómo te ven los demás operadores y aparece en tu sesión.
        </p>
      </div>

      {looksWrong && (
        <Alert variant="warning">
          <AlertDescription>
            Tu nombre actual parece un correo. Escribe tu nombre real abajo y
            guarda los cambios.
          </AlertDescription>
        </Alert>
      )}

      <SectionCard title="Datos personales">
        <form onSubmit={onSubmit} className="space-y-4" noValidate>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="space-y-2">
            <Label htmlFor="full_name">Nombre completo</Label>
            <Input
              id="full_name"
              autoFocus
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Ej. Esteban Mendiola"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="email">Correo electrónico</Label>
            <Input
              id="email"
              value={user?.email ?? ""}
              disabled
              className="opacity-60"
            />
            <p className="text-xs text-muted-foreground">
              Para cambiar el correo, contacta al dueño del gym.
            </p>
          </div>

          <div className="space-y-2">
            <Label htmlFor="phone">Teléfono (opcional)</Label>
            <Input
              id="phone"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="10 dígitos"
              inputMode="tel"
            />
          </div>

          <div className="flex justify-end pt-2">
            <Button
              type="submit"
              size="lg"
              disabled={update.isPending}
              className="rounded-md"
            >
              {update.isPending && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              Guardar cambios
            </Button>
          </div>
        </form>
      </SectionCard>

      <SectionCard title="PIN de recepción">
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Es lo que tocas en la pantalla de inicio para entrar rápido sin
            tipear tu correo y contraseña.
          </p>
          {user?.has_pin ? (
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={openPinDialog}
                disabled={assignPIN.isPending}
              >
                <KeyRound className="h-4 w-4 mr-2" /> Cambiar PIN
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={removePIN}
                disabled={clearPIN.isPending}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="h-4 w-4 mr-2" /> Borrar PIN
              </Button>
            </div>
          ) : (
            <Button
              type="button"
              onClick={openPinDialog}
              disabled={assignPIN.isPending}
            >
              <KeyRound className="h-4 w-4 mr-2" /> Crear PIN
            </Button>
          )}
        </div>
      </SectionCard>

      <Dialog open={pinDialogOpen} onOpenChange={setPinDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{authStrings.setupPin.title}</DialogTitle>
            <DialogDescription>
              {pinStep === "enter"
                ? authStrings.setupPin.subtitle
                : authStrings.setupPin.confirmLabel}
            </DialogDescription>
          </DialogHeader>
          {pinError && (
            <Alert variant="destructive">
              <AlertDescription>{pinError}</AlertDescription>
            </Alert>
          )}
          {pinStep === "enter" ? (
            <PinPad
              value={pinFirst}
              onChange={setPinFirst}
              onSubmit={submitPinFirst}
              disabled={assignPIN.isPending}
              size="lg"
            />
          ) : (
            <PinPad
              value={pinSecond}
              onChange={setPinSecond}
              onSubmit={submitPinSecond}
              disabled={assignPIN.isPending}
              size="lg"
            />
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
