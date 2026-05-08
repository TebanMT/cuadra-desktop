import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuthStore } from "@/stores/useAuthStore";
import { useUpdateMe } from "@/hooks/useAuth";
import { ApiError } from "@/lib/api";
import { SectionCard } from "@/components/shared/PagePrimitives";

const NAME_LOOKS_LIKE_EMAIL = /[@]/;

export default function ProfilePage() {
  const user = useAuthStore((s) => s.user);
  const update = useUpdateMe();

  const [fullName, setFullName] = useState(user?.full_name ?? "");
  const [phone, setPhone] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Re-sync local form when the persisted user mutates (e.g. /me hydration
  // returns fresh data after first paint).
  useEffect(() => {
    if (user?.full_name) setFullName(user.full_name);
  }, [user?.full_name]);

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
    </div>
  );
}
