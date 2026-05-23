import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Check, Copy, Globe, KeyRound } from "lucide-react";
import { toast } from "sonner";
import { AuthShell } from "@/components/shared/AuthShell";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { api } from "@/lib/api";

const DASHBOARD_URL =
  (import.meta.env.VITE_DASHBOARD_URL as string | undefined) ?? "https://entinta.app";
const SIGNUP_URL = `${DASHBOARD_URL}/auth/signup`;

interface PairingStatus {
  paired: boolean;
  email?: string;
  gym_name?: string;
}

export default function Welcome() {
  const navigate = useNavigate();
  const [copied, setCopied] = useState(false);
  // Initial null = checking. Once resolved we either redirect (paired)
  // or render the install-flow steps. Hiding the flow until we know
  // avoids a flash of "Bienvenido" when in fact the laptop is already
  // paired and the operator should see Login.
  const [checkingPairing, setCheckingPairing] = useState(true);

  // Pairing-status guard: ask the sidecar whether this laptop has a
  // cached_login row. If paired, route to the PIN grid (default after the
  // auth-refactor) — it'll either show the owner/operators with PINs or
  // an empty-state link to email-login when nobody has a PIN yet. We no
  // longer pass `?email=` since the grid hides email by design; the
  // email-login fallback page falls back to a blank field, which is fine
  // (the operator only reaches email-login when they need to recover and
  // typing their email once is acceptable).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.get<PairingStatus>(
          "/api/v1/auth/pairing-status",
          { skipAuth: true, retry: 0 }
        );
        if (cancelled) return;
        if (status.paired) {
          navigate("/auth/login", { replace: true });
          return;
        }
      } catch {
        // Sidecar offline or endpoint missing (older sidecar build).
        // Render the welcome steps as-is — old behavior.
      }
      if (!cancelled) setCheckingPairing(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  // While we don't know yet, render an empty AuthShell to avoid the
  // welcome-then-redirect flicker. AuthShell already shows the brand
  // chrome so the user sees the app, just not the wrong steps.
  if (checkingPairing) {
    return <AuthShell> </AuthShell>;
  }

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(SIGNUP_URL);
      setCopied(true);
      toast.success("Liga copiada al portapapeles.");
      setTimeout(() => setCopied(false), 2500);
    } catch {
      toast.error("No pudimos copiar la liga.");
    }
  }

  return (
    // hideFooter oculta el texto editorial "Hecho para gyms de barrio…" del
    // AuthShell — esa línea suma ~50px que en laptops 1280x800 empuja al
    // scroll. El link "¿Cómo funciona Tinta?" sigue visible (vive fuera de
    // ese guard en el shell), así que la ruta de descubrimiento se mantiene.
    <AuthShell hideFooter>
      <div className="space-y-1 mb-6 text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Bienvenido a Tinta.
        </h1>
        <p className="text-muted-foreground text-sm">
          Vincula esta computadora con tu gimnasio.
        </p>
      </div>

      <div className="space-y-3">
        {/*
          Acción primaria: canjear código. Es lo que necesita el caso
          frecuente (dueño que ya tiene cuenta web, o armador instalando la
          laptop del cliente). El CTA filled atrae la mirada inmediatamente;
          el dueño que sí tiene código no necesita leer más.
        */}
        <Card className="border-primary/40">
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <KeyRound className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">¿Ya tienes tu código?</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Lo recibiste al crear tu cuenta en la web. Pégalo aquí para
              vincular esta computadora — después funciona offline.
            </p>
            <Button asChild variant="default" className="w-full">
              <Link to="/auth/redeem-installer">
                Canjear código
              </Link>
            </Button>
          </CardContent>
        </Card>

        {/*
          Acción secundaria: crear cuenta. El dueño primerizo todavía la
          encuentra (está visible, con su propio CTA) pero no domina la
          pantalla. Copy más corto que la versión anterior — el botón ya
          lleva al signup, no hace falta repetir las instrucciones aquí.
        */}
        <Card>
          <CardContent className="pt-4 pb-4 space-y-3">
            <div className="flex items-center gap-2">
              <Globe className="h-5 w-5 text-muted-foreground" />
              <h2 className="font-semibold text-foreground">¿Aún no tienes cuenta?</h2>
            </div>
            <p className="text-sm text-muted-foreground leading-relaxed">
              Regístrate desde tu celular o navegador. Al terminar te damos
              el código para esta computadora.
            </p>
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-3 py-1.5 text-xs font-mono text-muted-foreground select-all overflow-x-auto">
              <span className="truncate flex-1">{SIGNUP_URL}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center h-6 w-6 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Copiar liga"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button asChild variant="outline" className="w-full">
              <a href={SIGNUP_URL} target="_blank" rel="noreferrer">
                Crear cuenta en la web
              </a>
            </Button>
          </CardContent>
        </Card>

      </div>
    </AuthShell>
  );
}
