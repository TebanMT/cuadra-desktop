import { useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/shared/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useConfirmPasswordReset } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { auth } from "@/strings/auth";

export default function ResetPassword() {
  const [params] = useSearchParams();
  const token = params.get("token") || "";
  const navigate = useNavigate();
  const m = useConfirmPasswordReset();

  const [pwd, setPwd] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (pwd.length < 8) return setError(auth.reset.short);
    if (pwd !== confirm) return setError(auth.reset.mismatch);

    try {
      await m.mutateAsync({ token, new_password: pwd });
      navigate("/auth/login?reset=ok", { replace: true });
    } catch (e) {
      if (e instanceof ApiError) {
        if (e.code === "token_expired" || e.status === 410) return setError(auth.reset.expired);
        if (e.status === 400 || e.status === 404) return setError(auth.reset.invalidLink);
      }
      setError(auth.reset.invalidLink);
    }
  }

  if (!token) {
    return (
      <AuthShell>
        <div className="space-y-6">
          <Alert variant="destructive">
            <AlertDescription>{auth.reset.invalidLink}</AlertDescription>
          </Alert>
          <Button asChild className="w-full">
            <Link to="/auth/forgot-password">{auth.reset.requestNew}</Link>
          </Button>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell>
      <div className="space-y-2 mb-8">
        <h1 className="text-3xl">{auth.reset.title}</h1>
        <p className="text-muted-foreground">{auth.reset.subtitle}</p>
      </div>

      <form onSubmit={onSubmit} className="space-y-5">
        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-2">
          <Label htmlFor="pwd">{auth.reset.newPasswordLabel}</Label>
          <Input
            id="pwd"
            type="password"
            required
            value={pwd}
            onChange={(e) => setPwd(e.target.value)}
            disabled={m.isPending}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirm">{auth.reset.confirmPasswordLabel}</Label>
          <Input
            id="confirm"
            type="password"
            required
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            disabled={m.isPending}
          />
        </div>
        <Button type="submit" size="lg" className="w-full" disabled={m.isPending}>
          {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : auth.reset.submit}
        </Button>
      </form>
    </AuthShell>
  );
}
