import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/shared/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRedeemInstallerBootstrap } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";

export default function RedeemInstaller() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const redeem = useRedeemInstallerBootstrap();

  const [token, setToken] = useState(params.get("token") ?? "");
  const [error, setError] = useState<string | null>(null);
  const [autoTried, setAutoTried] = useState(false);

  // If the URL carried `?token=…` (e.g. installer-dropped, deep link), fire
  // once automatically. Subsequent edits require the operator to click.
  useEffect(() => {
    const initial = params.get("token");
    if (initial && !autoTried) {
      setAutoTried(true);
      void submit(initial);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function submit(value: string) {
    setError(null);
    try {
      const data = await redeem.mutateAsync({ token: value.trim() });
      if (!data.setup_completed) {
        // Si el dueño redime el token sin haber completado setup en el
        // dashboard, lo mandamos a la pantalla terminal que lo manda al
        // dashboard web a terminar el wizard.
        navigate("/auth/setup-required", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.status === 410) {
          setError("Este código ya fue usado o caducó. Pide uno nuevo desde el dashboard.");
        } else if (e.status === 404) {
          setError("Código no reconocido. Verifica que lo copiaste completo.");
        } else if (e.status === 503) {
          setError("Sin internet. El primer canjeo necesita conexión al cloud.");
        } else {
          setError(e.message || "No pudimos canjear el código.");
        }
      } else {
        setError("Error inesperado. Reintenta en un momento.");
      }
    }
  }

  function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!token.trim()) return;
    void submit(token);
  }

  return (
    <AuthShell>
      <div className="space-y-1 mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Conecta esta computadora.
        </h1>
        <p className="text-muted-foreground">
          Pega el código que te dio el dashboard.
        </p>
      </div>

      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="token">Código</Label>
          <Input
            id="token"
            value={token}
            onChange={(e) => setToken(e.target.value)}
            placeholder="cb_install_…"
            autoFocus
            disabled={redeem.isPending}
            spellCheck={false}
            autoComplete="off"
          />
        </div>

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <Button type="submit" className="w-full" disabled={redeem.isPending || !token.trim()}>
          {redeem.isPending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          Canjear y entrar
        </Button>

        <div className="text-center text-sm text-muted-foreground">
          <Link to="/welcome" className="text-primary hover:underline">
            ← Volver
          </Link>
        </div>
      </form>
    </AuthShell>
  );
}
