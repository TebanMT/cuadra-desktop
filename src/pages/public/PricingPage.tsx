import { Link } from "react-router-dom";
import { Check, MessageCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const SUPPORT_WHATSAPP_URL = "https://wa.me/525555555555";

interface PlanTier {
  id: "standard" | "plus";
  name: string;
  priceMxn: number;
  tagline: string;
  recommended?: boolean;
  bullets: string[];
  cta: string;
}

const TIERS: PlanTier[] = [
  {
    id: "standard",
    name: "Standard",
    priceMxn: 799,
    tagline: "Todo lo necesario para cobrar y operar el día a día.",
    bullets: [
      "Socios y membresías ilimitados",
      "Cobros con comprobante por WhatsApp",
      "Kiosko con PIN o huella",
      "Dashboard del dueño desde el celular",
      "Persecución por pago automatizada",
      "Plantillas básicas de WhatsApp",
      "Soporte por WhatsApp",
      "1 estación incluida",
    ],
    cta: "Comenzar prueba 14 días",
  },
  {
    id: "plus",
    name: "Plus",
    priceMxn: 1599,
    tagline: "Cuando ya operas y quieres crecer sin pelearte con la libreta.",
    recommended: true,
    bullets: [
      "Todo lo de Standard, sin límites",
      "WhatsApp automation completa",
      "Tap-to-sell para entrenadores",
      "Integración con hardware (torniquetes y lectores)",
      "Rutinas personalizadas (próximamente)",
      "Onboarding gratis",
      "Hasta 3 estaciones",
    ],
    cta: "Comenzar prueba 14 días",
  },
];

function fmtMxnPrice(amount: number): string {
  return `$${amount.toLocaleString("es-MX")}`;
}

export default function PricingPage() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="max-w-5xl mx-auto px-6 py-16 sm:py-24">
        <header className="text-center space-y-4 mb-12 sm:mb-16">
          <h1
            className="text-3xl sm:text-5xl font-bold text-foreground"
            style={{ letterSpacing: "-0.02em" }}
          >
            Tinta para tu gimnasio. Cobra a tiempo, deja la libreta.
          </h1>
          <p className="text-base sm:text-lg text-muted-foreground max-w-2xl mx-auto">
            Hecho para gimnasios de barrio: funciona offline, se siente como
            WhatsApp y no necesitas un técnico para usarlo.
          </p>
        </header>

        <div className="grid gap-6 md:grid-cols-2">
          {TIERS.map((tier) => (
            <PlanCard key={tier.id} tier={tier} />
          ))}
        </div>

        <footer className="mt-12 sm:mt-16 text-center space-y-2">
          <p className="text-sm text-muted-foreground">
            Prueba sin tarjeta. Cancela cuando quieras.
          </p>
          <p className="text-sm">
            <a
              href={SUPPORT_WHATSAPP_URL}
              target="_blank"
              rel="noreferrer"
              className="text-primary hover:underline inline-flex items-center gap-1.5"
            >
              <MessageCircle className="h-4 w-4" />
              ¿Dudas? Escríbenos por WhatsApp
            </a>
          </p>
        </footer>
      </div>
    </div>
  );
}

function PlanCard({ tier }: { tier: PlanTier }) {
  return (
    <div
      className={cn(
        "relative rounded-2xl border bg-card text-card-foreground p-8 shadow-sm flex flex-col gap-6",
        tier.recommended ? "border-primary/60 ring-2 ring-primary/20" : "border-border"
      )}
    >
      {tier.recommended && (
        <span className="absolute -top-3 right-6 inline-flex items-center rounded-full bg-primary text-primary-foreground text-xs font-semibold px-3 py-1 shadow-sm">
          Recomendada
        </span>
      )}

      <div className="space-y-2">
        <h2 className="text-xl font-semibold tracking-tight">{tier.name}</h2>
        <div className="flex items-baseline gap-1.5">
          <span
            className="text-4xl font-bold tabular"
            style={{ letterSpacing: "-0.02em" }}
          >
            {fmtMxnPrice(tier.priceMxn)}
          </span>
          <span className="text-sm text-muted-foreground">MXN/mes</span>
        </div>
        <p className="text-sm text-muted-foreground">{tier.tagline}</p>
      </div>

      <ul className="space-y-2.5 flex-1">
        {tier.bullets.map((b) => (
          <li key={b} className="flex items-start gap-2.5 text-sm">
            <Check className="h-4 w-4 text-success shrink-0 mt-0.5" strokeWidth={2.5} />
            <span>{b}</span>
          </li>
        ))}
      </ul>

      <Button
        asChild
        size="lg"
        variant={tier.recommended ? "default" : "outline"}
        className="w-full"
      >
        <Link to="/auth/signup">{tier.cta}</Link>
      </Button>
    </div>
  );
}
