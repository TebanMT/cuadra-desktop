import { SUPPORT_WHATSAPP_URL } from "@/lib/support";
import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { TintaWordmark } from "@/components/shared/Logo";

export default function PricingPage() {
  return <main className="min-h-screen bg-background px-6 py-10 text-foreground">
    <div className="mx-auto max-w-3xl space-y-8">
      <TintaWordmark className="w-28" />
      <header className="space-y-2"><h1 className="font-display text-3xl">Plan Standard</h1><p className="text-muted-foreground">Un plan con todas las funciones disponibles para la operación de tu gimnasio.</p></header>
      <section className="space-y-5 border-y py-6" aria-label="Precio y funciones">
        <p><strong className="text-4xl tabular-nums">$799</strong><span className="ml-2 text-muted-foreground">MXN al mes</span></p>
        <ul className="grid gap-3 text-sm sm:grid-cols-2">
          <li>Socios, membresías y registro de entradas</li><li>Cobros e historial de comprobantes</li><li>Productos, ventas e inventario</li><li>Caja, gastos y reportes</li><li>Comprobantes y recordatorios por WhatsApp desde Tinta</li><li>Soporte por WhatsApp</li>
        </ul>
        <p className="text-sm leading-relaxed text-muted-foreground">La recepción puede operar sin internet. La sincronización, los mensajes y la consulta remota requieren conexión. La conexión de un WhatsApp propio está pendiente de disponibilidad.</p>
        <Button asChild><Link to="/auth/signup">Comenzar prueba de 30 días</Link></Button>
        <p className="text-sm text-muted-foreground">Prueba sin tarjeta.</p>
      </section>
      <a className="inline-flex min-h-11 items-center underline underline-offset-4" href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noreferrer">Consultar con soporte</a>
    </div>
  </main>;
}
