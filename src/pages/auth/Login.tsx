import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2, ShieldAlert, UserCircle2 } from "lucide-react";
import { AuthShell } from "@/components/shared/AuthShell";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PinPad } from "@/components/checkin/PinPad";
import { useLoginPIN, useOperatorsForLogin, type OperatorForLogin } from "@/hooks/useAuth";
import { ApiError, api } from "@/lib/api";
import { auth } from "@/strings/auth";
import { useAuthStore } from "@/stores/useAuthStore";
import { cn } from "@/lib/utils";

// Login renders the operators grid as the primary reception-screen
// credential. Each tile is one active user (owner + operators with PINs);
// tapping it opens the PIN pad modal. Email + password lives at
// /auth/login-email as a discreet recovery link at the bottom.
//
// Empty grid state: the laptop is paired but no operator has a PIN yet
// (typical right after redeem-installer). We show a card pointing the
// owner to the email-login path so they can sign in once and configure
// their PIN from the profile.
export default function Login() {
  const navigate = useNavigate();
  const operators = useOperatorsForLogin();
  const loginPIN = useLoginPIN();
  const setReadOnly = useAuthStore((s) => s.setReadOnly);
  const [selected, setSelected] = useState<OperatorForLogin | null>(null);
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [attempts, setAttempts] = useState(0);
  const [trialModal, setTrialModal] = useState(false);
  const [pairingChecked, setPairingChecked] = useState(false);

  // Guard inverso al de Welcome: si caes aquí (URL directa, refresh, history
  // del browser) pero el sidecar no tiene `sync_state.cached_login`, la
  // pantalla queda atorada en un empty state que no lleva a ningún lado
  // útil — la única acción real es ir al wizard de instalación.
  // Pregúntale al sidecar y si dice paired=false, devuelve al usuario a
  // /welcome. Mientras chequea mostramos el AuthShell vacío (no flicker).
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
        // Sidecar offline / endpoint missing → no podemos descartar pareo,
        // renderea Login (el usuario verá el empty state pero igual no
        // queremos forzarlo a /welcome si quizá la situación es transitoria).
      }
      if (!cancelled) setPairingChecked(true);
    })();
    return () => {
      cancelled = true;
    };
  }, [navigate]);

  function openOperator(op: OperatorForLogin) {
    if (!op.has_pin) {
      // Owner without a PIN yet — route to email-login. The fallback
      // ?email=hint hydrates the field; the post-login flow surfaces the
      // PIN-setup CTA from the operator's profile.
      navigate("/auth/login-email");
      return;
    }
    setSelected(op);
    setPin("");
    setError(null);
  }

  function closeModal() {
    setSelected(null);
    setPin("");
    setError(null);
  }

  async function submitPin() {
    if (!selected || pin.length !== 4) return;
    setError(null);
    try {
      const data = await loginPIN.mutateAsync({
        user_id: selected.user_id,
        pin,
      });
      const trialExpired =
        data.subscription_plan === "trial" &&
        data.trial_ends_at &&
        new Date(data.trial_ends_at).getTime() < Date.now();
      if (trialExpired) {
        setTrialModal(true);
        return;
      }
      if (!data.setup_completed) {
        navigate("/auth/setup-required", { replace: true });
      } else {
        navigate("/", { replace: true });
      }
    } catch (e) {
      setPin("");
      const next = attempts + 1;
      setAttempts(next);
      if (next >= 5) {
        // Soft lock — bounces to grid so the operator can try someone
        // else or use email-login. No persistent lockout: the desktop
        // is physical and there's no realistic remote-bruteforce vector.
        setSelected(null);
        setAttempts(0);
        setError(auth.pinLogin.errors.tooManyAttempts);
        return;
      }
      if (e instanceof ApiError && e.status === 401) {
        setError(auth.pinLogin.errors.invalid);
      } else {
        setError(auth.pinLogin.errors.generic);
      }
    }
  }

  function continueAfterTrial(readOnly: boolean) {
    setReadOnly(readOnly);
    setTrialModal(false);
    navigate("/", { replace: true });
  }

  const ops = operators.data ?? [];
  const isEmpty = !operators.isLoading && ops.length === 0;

  // No pintamos el grid (ni el empty-state confuso) hasta saber que el
  // sidecar está pareado. Si no lo está, el useEffect de arriba ya
  // disparó el navigate hacia /welcome y este return es transitorio.
  if (!pairingChecked) {
    return <AuthShell> </AuthShell>;
  }

  return (
    <AuthShell>
      <div className="space-y-1 mb-6 text-center">
        <h1 className="font-display text-3xl font-semibold text-foreground tracking-tight">
          {auth.pinLogin.title}
        </h1>
        <p className="text-muted-foreground">{auth.pinLogin.subtitle}</p>
      </div>

      {error && !selected && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {operators.isLoading && (
        <div className="flex justify-center py-10">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {operators.isError && (
        <Alert variant="destructive" className="mb-4">
          <AlertDescription>{auth.pinLogin.errors.loadFailed}</AlertDescription>
        </Alert>
      )}

      {!operators.isLoading && !operators.isError && (
        <>
          {isEmpty ? (
            <Card className="p-5 text-center space-y-3">
              <ShieldAlert className="h-10 w-10 mx-auto text-muted-foreground" />
              <p className="text-sm text-muted-foreground">
                {auth.pinLogin.emptyState}
              </p>
              <Button asChild className="w-full">
                <Link to="/auth/login-email">{auth.pinLogin.emailLoginCta}</Link>
              </Button>
            </Card>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {ops.map((op) => (
                <button
                  key={op.user_id}
                  type="button"
                  onClick={() => openOperator(op)}
                  className={cn(
                    "group flex flex-col items-center gap-2 rounded-xl border-2 border-border bg-card",
                    "px-3 py-5 transition-colors hover:border-primary hover:bg-primary/5",
                    "focus:outline-none focus:border-primary focus:ring-2 focus:ring-primary/20"
                  )}
                >
                  <UserCircle2 className="h-12 w-12 text-muted-foreground group-hover:text-primary transition-colors" />
                  <span className="text-sm font-semibold text-foreground line-clamp-2 text-center">
                    {op.full_name}
                  </span>
                  {op.role === "owner" && (
                    <span className="text-xs text-muted-foreground">Dueño</span>
                  )}
                  {!op.has_pin && (
                    <span className="text-xs font-medium text-amber-600 dark:text-amber-400">
                      {auth.pinLogin.setupBadge}
                    </span>
                  )}
                </button>
              ))}
            </div>
          )}

          <div className="mt-8 text-center">
            <Link
              to="/auth/login-email"
              className="text-sm text-muted-foreground hover:text-foreground underline-offset-4 hover:underline"
            >
              {auth.pinLogin.emailLoginCta}
            </Link>
          </div>
        </>
      )}

      <Dialog open={!!selected} onOpenChange={(open) => !open && closeModal()}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {selected ? auth.pinLogin.pinFor(selected.full_name) : ""}
            </DialogTitle>
            <DialogDescription>{auth.pinLogin.enterPin}</DialogDescription>
          </DialogHeader>
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          <PinPad
            value={pin}
            onChange={setPin}
            onSubmit={submitPin}
            disabled={loginPIN.isPending}
            size="lg"
          />
          <div className="text-center">
            <button
              type="button"
              onClick={closeModal}
              className="text-sm text-muted-foreground hover:text-foreground"
            >
              {auth.pinLogin.cancel}
            </button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={trialModal} onOpenChange={setTrialModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{auth.login.trialExpired.title}</DialogTitle>
            <DialogDescription>{auth.login.trialExpired.body}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-col sm:flex-row gap-2 justify-end">
            <Button variant="outline" onClick={() => continueAfterTrial(true)}>
              {auth.login.trialExpired.later}
            </Button>
            <Button onClick={() => continueAfterTrial(false)}>
              {auth.login.trialExpired.activate}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </AuthShell>
  );
}
