import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/shared/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useSignup } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { auth } from "@/strings/auth";

export default function Step1Account() {
  const navigate = useNavigate();
  const signup = useSignup();
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [emailExists, setEmailExists] = useState(false);

  function validate(): string | null {
    if (fullName.trim().length < 3 || fullName.length > 100) return "Tu nombre debe tener entre 3 y 100 caracteres.";
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return auth.signup.errors.emailFormat;
    if (pwd.length < 8) return auth.signup.errors.passwordShort;
    if (pwd !== confirm) return auth.signup.errors.passwordMismatch;
    return null;
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setEmailExists(false);
    const v = validate();
    if (v) return setError(v);

    try {
      await signup.mutateAsync({ full_name: fullName.trim(), email, password: pwd });
      navigate("/setup/step-2", { replace: true });
    } catch (e) {
      if (e instanceof ApiError && (e.status === 409 || e.code === "email_exists")) {
        setEmailExists(true);
        setError(auth.signup.errors.emailExists);
        return;
      }
      if (e instanceof TypeError) return setError(auth.signup.errors.offline);
      setError("No pudimos crear la cuenta. Vuelve a intentar.");
    }
  }

  return (
    <AuthShell>
      <div className="space-y-2 mb-8">
        <h1 className="text-3xl">{auth.signup.welcome}</h1>
        <p className="text-muted-foreground">{auth.signup.subtitle}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>
              {error}
              {emailExists && (
                <div className="mt-2">
                  <Link to="/auth/login" className="font-medium underline">
                    Ir a iniciar sesión
                  </Link>
                </div>
              )}
            </AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="full_name">{auth.signup.fullName}</Label>
          <Input id="full_name" required value={fullName} onChange={(e) => setFullName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{auth.signup.email}</Label>
          <Input id="email" type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="pwd">{auth.signup.password}</Label>
          <Input id="pwd" type="password" required value={pwd} onChange={(e) => setPwd(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{auth.signup.confirmPassword}</Label>
          <Input id="confirm" type="password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </div>

        <Button type="submit" size="lg" className="w-full" disabled={signup.isPending}>
          {signup.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : auth.signup.submit}
        </Button>

        <p className="text-center text-sm text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link to="/auth/login" className="text-primary hover:underline">
            Inicia sesión
          </Link>
        </p>
      </form>
    </AuthShell>
  );
}
