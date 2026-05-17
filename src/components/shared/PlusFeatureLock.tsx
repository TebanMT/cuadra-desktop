import { Link } from "react-router-dom";
import { Lock, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { settings as t } from "@/strings/settings";

interface Props {
  /** Título grande del card. Por defecto, el copy genérico de Plus. */
  title?: string;
  /** Descripción del lock. Cada página Plus la adapta a su feature. */
  body?: string;
  /** Icono opcional encima del título. Default: Sparkles. */
  icon?: React.ComponentType<{ className?: string }>;
}

// PlusFeatureLock es el "gate visual" que rendereas en lugar de la página
// completa cuando el gym no tiene acceso a Plus. CTA → /settings/subscription
// donde el dueño ve pricing + activa Plus.
//
// Filosofía: NO escondemos la entrada del sidebar/Settings — el dueño
// descubre la feature y entiende qué pierde quedándose en Standard. Eso es
// upsell honesto vs. esconder y esperar que pregunte.
export function PlusFeatureLock({
  title = t.plus.lockedTitle,
  body = t.plus.lockedBody,
  icon: Icon = Sparkles,
}: Props) {
  return (
    <div className="p-6 max-w-2xl mx-auto">
      <div className="rounded-xl border border-border bg-card text-card-foreground p-8 text-center space-y-4">
        <div className="mx-auto h-14 w-14 rounded-full bg-primary/10 flex items-center justify-center relative">
          <Icon className="h-7 w-7 text-primary" />
          <div className="absolute -bottom-1 -right-1 bg-background rounded-full p-1 border border-border">
            <Lock className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
        </div>
        <h1 className="text-2xl font-semibold text-foreground tracking-tight">
          {title}
        </h1>
        <p className="text-sm text-muted-foreground max-w-md mx-auto">{body}</p>
        <div className="pt-2">
          <Button size="lg" asChild>
            <Link to="/settings/subscription">{t.plus.cta}</Link>
          </Button>
        </div>
      </div>
    </div>
  );
}
