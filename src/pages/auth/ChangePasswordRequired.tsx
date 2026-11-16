import { useState } from "react";
import { AuthShell } from "@/components/shared/AuthShell";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { useLogout, useRequestPasswordReset } from "@/hooks/useAuth";
import { useAuthStore } from "@/stores/useAuthStore";

/** The existing reset service verifies ownership and clears the temporary-password flag. */
export default function ChangePasswordRequired() {
  const email = useAuthStore(s => s.user?.email);
  const reset = useRequestPasswordReset();
  const logout = useLogout();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  async function requestLink() {
    if (!email || reset.isPending) return;
    setError(null);
    try { await reset.mutateAsync({ email }); setSent(true); }
    catch { setError("No pudimos solicitar el enlace. Revisa la conexión e intenta de nuevo."); }
  }
  return <AuthShell hideTagline><div className="space-y-5">
    <h1 className="font-display text-3xl">Cambia tu contraseña temporal</h1>
    <p className="text-muted-foreground">Para continuar, solicita un enlace en tu correo y elige una contraseña de al menos 8 caracteres. Este paso requiere internet.</p>
    {error && <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>}
    {sent ? <div role="status" className="space-y-2"><p>Solicitud recibida. Revisa el correo de tu cuenta y la carpeta de correo no deseado.</p><p className="text-sm text-muted-foreground">Después de cambiarla, cierra esta sesión e inicia con la contraseña nueva.</p></div>
      : <p className="break-words font-medium">{email || "No hay un correo registrado. Solicita ayuda al dueño del gimnasio."}</p>}
    <Button className="w-full" disabled={!email || reset.isPending || logout.isPending} onClick={() => void requestLink()}>{reset.isPending ? "Solicitando enlace…" : sent ? "Solicitar otro enlace" : "Solicitar enlace para cambiarla"}</Button>
    <Button variant="outline" className="w-full" disabled={logout.isPending || reset.isPending} onClick={() => logout.mutate()}>{logout.isPending ? "Cerrando sesión…" : "Cerrar sesión"}</Button>
  </div></AuthShell>;
}
