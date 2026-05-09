import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Check, Copy, Download, Globe, KeyRound } from "lucide-react";
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
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [autoRedirected, setAutoRedirected] = useState(false);
  const [copied, setCopied] = useState(false);
  // Initial null = checking. Once resolved we either redirect (paired)
  // or render the install-flow steps. Hiding the flow until we know
  // avoids a flash of "Bienvenido" when in fact the laptop is already
  // paired and the operator should see Login.
  const [checkingPairing, setCheckingPairing] = useState(true);

  // If the installer dropped a `?bootstrap=` token in the launch URL,
  // jump straight to the redeem screen with the token pre-filled.
  useEffect(() => {
    const code = params.get("bootstrap");
    if (code && !autoRedirected) {
      setAutoRedirected(true);
      navigate(`/auth/redeem-installer?token=${encodeURIComponent(code)}`, { replace: true });
    }
  }, [params, navigate, autoRedirected]);

  // Pairing-status guard: ask the sidecar whether this laptop has a
  // cached_login row. If it does, the install flow doesn't apply —
  // send the operator to Login (with an optional `?email=` hint so
  // the email field is pre-filled). If the sidecar is unreachable we
  // fall through to the welcome view; redeem-installer requires the
  // sidecar anyway, so the operator will hit the same wall there.
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
          const qs = status.email ? `?email=${encodeURIComponent(status.email)}` : "";
          navigate(`/auth/login${qs}`, { replace: true });
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
    <AuthShell>
      <div className="space-y-1 mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Bienvenido a Tinta.
        </h1>
        <p className="text-muted-foreground">
          Tu recepción lista en 3 pasos.
        </p>
      </div>

      <div className="space-y-3">
        {/* Step 1 — create account on web */}
        <Card>
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold tabular">
                1
              </span>
              <Globe className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Crea tu cuenta en la web</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Abre la siguiente liga en tu celular o navegador y registra tu gimnasio.
              Cuando termines, te daremos un código de un solo uso para esta computadora.
            </p>
            <div className="flex items-center gap-1 rounded-md border border-border bg-muted/40 px-3 py-2 text-xs font-mono text-muted-foreground select-all overflow-x-auto">
              <span className="truncate flex-1">{SIGNUP_URL}</span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center justify-center h-7 w-7 rounded hover:bg-muted text-muted-foreground hover:text-foreground transition-colors shrink-0"
                aria-label="Copiar liga"
              >
                {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
              </button>
            </div>
            <Button asChild variant="default" className="w-full">
              <a href={SIGNUP_URL} target="_blank" rel="noreferrer">
                Crear cuenta ahora
              </a>
            </Button>
          </CardContent>
        </Card>

        {/* Step 2 — redeem the code */}
        <Card>
          <CardContent className="pt-5 pb-5 space-y-3">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-bold tabular">
                2
              </span>
              <Download className="h-5 w-5 text-primary" />
              <h2 className="font-semibold">Canjea tu código</h2>
            </div>
            <p className="text-sm text-muted-foreground">
              Después del registro la web te muestra un código de instalación. Pégalo aquí
              para que esta computadora quede vinculada a tu gimnasio (funciona offline
              después).
            </p>
            <Button asChild variant="outline" className="w-full">
              <Link to="/auth/redeem-installer">
                <KeyRound className="mr-2 h-4 w-4" />
                Tengo un código
              </Link>
            </Button>
          </CardContent>
        </Card>

        <div className="text-center text-sm text-muted-foreground pt-2">
          ¿Ya tienes cuenta en esta computadora?{" "}
          <Link to="/auth/login" className="text-primary hover:underline">
            Iniciar sesión
          </Link>
        </div>
        <div className="text-center text-xs text-muted-foreground">
          ¿Quieres ver los planes primero?{" "}
          <a
            href={`${DASHBOARD_URL}/pricing`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline"
          >
            Ver precios
          </a>
        </div>
      </div>
    </AuthShell>
  );
}
