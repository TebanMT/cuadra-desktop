import { useState } from "react";
import { Link } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { AuthShell } from "@/components/shared/AuthShell";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useRequestPasswordReset } from "@/hooks/useAuth";
import { auth } from "@/strings/auth";

export default function ForgotPassword() {
  const [email, setEmail] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const m = useRequestPasswordReset();

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      await m.mutateAsync({ email });
    } catch {
      // Always succeed UX-wise (security: no leak)
    }
    setSubmitted(true);
  }

  return (
    <AuthShell>
      <div className="space-y-2 mb-8">
        <h1 className="text-3xl">{auth.forgot.title}</h1>
        <p className="text-muted-foreground">{auth.forgot.subtitle}</p>
      </div>

      {submitted ? (
        <div className="space-y-6">
          <Alert>
            <AlertDescription>{auth.forgot.sent}</AlertDescription>
          </Alert>
          <Button asChild className="w-full" variant="outline">
            <Link to="/auth/login">{auth.forgot.backToLogin}</Link>
          </Button>
        </div>
      ) : (
        <form onSubmit={onSubmit} className="space-y-5">
          <div className="space-y-2">
            <Label htmlFor="email">{auth.forgot.emailLabel}</Label>
            <Input
              id="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={m.isPending}
            />
          </div>
          <Button type="submit" size="lg" className="w-full" disabled={m.isPending}>
            {m.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : auth.forgot.submit}
          </Button>
          <div className="text-center">
            <Link to="/auth/login" className="text-sm text-primary hover:underline">
              {auth.forgot.backToLogin}
            </Link>
          </div>
        </form>
      )}
    </AuthShell>
  );
}
