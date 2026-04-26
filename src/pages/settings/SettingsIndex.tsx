import { Link } from "react-router-dom";
import { ChevronRight, CreditCard } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";

const SECTIONS = [
  {
    to: "/settings/membership-types",
    icon: CreditCard,
    title: "Membresías",
    body: "Crea, edita o desactiva los planes que ofreces.",
  },
];

export default function SettingsIndex() {
  return (
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Configuración</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Ajusta los datos del gym, métodos de pago, planes y operadores.
        </p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {SECTIONS.map((s) => (
          <Link key={s.to} to={s.to}>
            <Card className="hover:bg-muted/40 transition-colors cursor-pointer">
              <CardContent className="pt-5 pb-5 flex items-start justify-between gap-3">
                <div className="flex items-start gap-3">
                  <s.icon className="h-5 w-5 text-primary mt-0.5" />
                  <div>
                    <div className="font-semibold">{s.title}</div>
                    <div className="text-sm text-muted-foreground mt-1">{s.body}</div>
                  </div>
                </div>
                <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0" />
              </CardContent>
            </Card>
          </Link>
        ))}
      </div>
    </div>
  );
}
