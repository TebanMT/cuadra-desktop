import { useEffect, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { AuthShell } from "@/components/shared/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useLogin } from "@/hooks/useAuth";
import { ApiError, api } from "@/lib/api";
import { auth } from "@/strings/auth";
import { useAuthStore } from "@/stores/useAuthStore";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

// LoginEmail is the fallback email+password sign-in for desktop after the
// auth-refactor v0.7. The primary flow is the PIN grid at /auth/login; this
// page only shows up when the operator taps "Iniciar sesión con correo"
// from the grid (PIN olvidado, primer login antes de tener PIN configurado,
// owner setting up their PIN for the first time).
export default function LoginEmail() {
  const navigate = useNavigate();
  const login = useLogin();
  const setReadOnly = useAuthStore((s) => s.setReadOnly);

  // Welcome.tsx pasa `?email=` cuando detecta que el laptop ya está
  // pareado — pre-llenamos el campo así el operador solo tipea la
  // contraseña. Si el operador quiere loguearse con otro mail, igual
  // puede borrarlo. Sin override, el campo arranca vacío como antes.
  const [searchParams] = useSearchParams();
  const initialEmail = searchParams.get("email") ?? "";
  const [email, setEmail] = useState(initialEmail);
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [remember, setRemember] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [trialModal, setTrialModal] = useState(false);
  const [pairingChecked, setPairingChecked] = useState(false);

  // Mismo guard que /auth/login (PIN grid): si caes acá sin pareo previo
  // (URL directa, refresh tras reset), ningún login funcionará porque el
  // sidecar no tiene users locales. Devolver a /welcome es la única
  // ruta productiva.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const status = await api.get<{ paired: boolean }>(
          "/api/v1/auth/pairing-status",
          { skipAuth: true, retry: 0 }
        );
        if (cancelled) return;
        if (!status.paired) {
          navigate("/welcome", { replace: true });
          return;
        }
      } catch {
        // Sidecar offline / unreachable — dejamos pasar; mejor mostrar
        // el form y dejar que el intento de login surfacee el error
        // real, que un redirect optimista a /welcome.
      }
      if (!cancelled) setPairingChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const data = await login.mutateAsync({ email, password, remember });

      if (data.must_change_password) {
        navigate("/auth/change-password", { replace: true });
        return;
      }

      const trialExpired =
        data.subscription_plan === "trial" &&
        data.trial_ends_at &&
        new Date(data.trial_ends_at).getTime() < Date.now();

      if (trialExpired) {
        setTrialModal(true);
        return;
      }

      if (!data.setup_completed) {
        // El setup del gym vive en el dashboard web, no acá. Mandamos
        // al user a una pantalla con CTA externo al dashboard.
        navigate("/auth/setup-required", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e) {
      const msg = errorMessage(e);
      setError(msg);
    }
  }

  function continueAfterTrial(readOnly: boolean) {
    setReadOnly(readOnly);
    setTrialModal(false);
    navigate("/", { replace: true });
  }

  if (!pairingChecked) {
    return <AuthShell> </AuthShell>;
  }

  return (
    <AuthShell>
      <div className="mb-2 -mt-2 text-left">
        <Link
          to="/auth/login"
          className="text-sm text-muted-foreground hover:text-foreground"
        >
          {auth.login.backToPin}
        </Link>
      </div>
      <div className="space-y-1 mb-8 text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          Bienvenido de vuelta.
        </h1>
        <p className="text-muted-foreground">Entra a tu Tinta.</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="email">{auth.login.emailLabel}</Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={login.isPending}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">{auth.login.passwordLabel}</Label>
            <Link to="/auth/forgot-password" className="text-sm text-primary hover:underline">
              {auth.login.forgot}
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPwd ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={login.isPending}
              className="pr-10"
            />
            <button
              type="button"
              onClick={() => setShowPwd((v) => !v)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
              aria-label={showPwd ? "Ocultar contraseña" : "Mostrar contraseña"}
            >
              {showPwd ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
            </button>
          </div>
        </div>

        <label className="flex items-center gap-2 select-none cursor-pointer">
          <Checkbox checked={remember} onCheckedChange={(v) => setRemember(!!v)} />
          <span className="text-sm">{auth.login.rememberMe}</span>
        </label>

        <Button type="submit" size="lg" className="w-full" disabled={login.isPending}>
          {login.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : auth.login.submit}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          ¿No tienes cuenta?{" "}
          {/*
            La creación de cuenta vive en el dashboard web, no acá. Abrimos
            en el browser del sistema (target=_blank) en vez de routear a
            una página interna del desktop. Patrón same-as Welcome.tsx.
          */}
          <a
            href={`${import.meta.env.VITE_DASHBOARD_URL || "https://entinta.app"}/auth/signup`}
            target="_blank"
            rel="noreferrer"
            className="text-primary hover:underline font-medium"
          >
            Crea la tuya
          </a>
        </p>
      </form>

      <Dialog open={trialModal} onOpenChange={setTrialModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{auth.login.trialExpired.title}</DialogTitle>
            <DialogDescription>{auth.login.trialExpired.body}</DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={() => continueAfterTrial(true)}>
              {auth.login.trialExpired.later}
            </Button>
            <Button onClick={() => continueAfterTrial(false)}>
              {auth.login.trialExpired.activate}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AuthShell>
  );
}

function errorMessage(e: unknown): string {
  if (e instanceof ApiError) {
    if (e.status === 401 || e.status === 404) return auth.login.errors.invalidCredentials;
    if (e.status === 403) return auth.login.errors.inactive;
    if (e.status === 429) return auth.login.errors.rateLimit;
  }
  if (e instanceof TypeError) return auth.login.errors.offline;
  return auth.login.errors.generic;
}
