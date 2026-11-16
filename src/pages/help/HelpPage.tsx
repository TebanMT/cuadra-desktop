import { PageContainer } from "@/components/shared/PagePrimitives";
import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { openExternalUrl } from "@/lib/openExternal";
import { SUPPORT_WHATSAPP_URL } from "@/lib/support";
import { isTauri } from "@/lib/utils";
import { useAuthStore } from "@/stores/useAuthStore";

type Audience = "all" | "owner" | "operator";
// `id` es el ancla de la ayuda en contexto (`/help#caja`, ver HelpHint).
type HelpTask = { id: string; title: string; body: string; to: string; action: string; audience?: Audience };

// «Resolver ahora» va primero para cualquier rol: son las tres angustias
// del mostrador (cobro incierto, sin internet, entrada bloqueada).
const URGENT: HelpTask[] = [
  { id: "cobro-incierto", title: "No sé si se confirmó el cobro", body: "Si la respuesta se interrumpió, revisa el historial del socio y el folio antes de iniciar otro cobro. Si el movimiento aparece, abre su comprobante. Si no puedes comprobar el resultado, conserva los datos y consulta a soporte; no repitas la operación como un cobro nuevo.", to: "/billing", action: "Consultar cobros" },
  { id: "sin-internet", title: "Se perdió internet", body: "Puedes seguir buscando socios, cobrando y registrando entradas en recepción. Consulta los cambios pendientes en el estado de sincronización de la barra superior. WhatsApp y la consulta remota necesitan conexión. Si una operación muestra un error, revisa su historial antes de repetirla.", to: "/members", action: "Consultar socios" },
  { id: "entrada-bloqueada", title: "No puedo registrar una entrada", body: "Revisa el aviso en Entradas. Si el lector está desconectado, usa Número o Buscar. Comprueba la identidad y la vigencia del socio antes de registrar su entrada. Si el aviso dice que te falta un permiso, pídeselo al dueño.", to: "/checkin", action: "Revisar Entradas" },
];

// Tareas de recepción primero, en el orden del día; las del dueño al final.
const TASKS: HelpTask[] = [
  {
    id: "buscar-socio",
    title: "Buscar un socio y revisar su vigencia",
    body: "En Socios o con Buscar (Ctrl o ⌘ + K), escribe el nombre o un apellido, el teléfono, el folio o el número de socio. La insignia de vigencia dice si puede pasar y hasta cuándo; el folio distingue a dos socios con el mismo nombre. Selecciona el nombre para abrir su ficha. Consultar la ficha no registra una entrada.",
    to: "/members", action: "Ir a Socios",
  },
  {
    id: "cobrar",
    title: "Cobrar una membresía",
    body: "Selecciona Cobrar (o pulsa P) y busca al socio. Revisa el plan, el importe y la nueva vigencia; elige el método de pago antes de confirmar. Promoción, descuento o pago parcial se despliegan cuando los necesitas.",
    to: "/billing", action: "Ver cobros",
  },
  {
    id: "entrada",
    title: "Registrar una entrada",
    body: "En Entradas, elige Buscar o Número. Comprueba que sea la persona correcta antes de confirmar y revisa el resultado del registro. Si el lector de huella no está disponible, puedes usar estos métodos.",
    to: "/checkin", action: "Ir a Entradas",
  },
  {
    id: "vender",
    title: "Vender un producto",
    body: "En Venta rápida, toca los productos (o búscalos por nombre) para agregarlos a la venta. Selecciona Cobrar, elige el método de pago y confirma; en efectivo, escribe cuánto te dieron y Tinta calcula el cambio. Para fiar, primero agrega al socio con «Agregar socio»: puedes cobrar un abono y el resto queda en su saldo.",
    to: "/sales", action: "Ir a Venta rápida",
  },
  {
    id: "caja",
    title: "Contar y cerrar caja",
    body: "Al empezar el turno, selecciona Abrir caja y escribe el efectivo con el que empieza. Durante el día, los cobros en efectivo se suman solos; registra aparte el efectivo que entra o sale sin ser un cobro. Para cerrar, selecciona Hacer corte, cuenta el efectivo físico y escribe la cantidad contada. Revisa cualquier diferencia antes de confirmar.",
    to: "/reports/cash-close", action: "Ir a Caja",
  },
  {
    audience: "operator",
    id: "cobro-mal",
    title: "Un cobro quedó mal registrado",
    body: "No registres un segundo cobro para compensar. Anota el folio y avísale al dueño: él puede corregir la captura desde el historial de pagos del socio.",
    to: "/members", action: "Buscar al socio",
  },
  {
    audience: "owner",
    id: "corregir-cobro",
    title: "Corregir un cobro",
    body: "Abre la ficha del socio y su historial de pagos. Elige Corregir captura en las acciones del movimiento. Revisa el importe, el motivo y el efecto en caja antes de confirmar. No registres un segundo cobro para compensar un error.",
    to: "/members", action: "Buscar al socio",
  },
  {
    audience: "owner",
    id: "importar",
    title: "Importar una lista de socios",
    body: "Importa un archivo CSV desde Socios → Importar. Descarga la plantilla, reemplaza los ejemplos y revisa la asociación de columnas. Crea primero los planes que usarás. Revisa duplicados y errores antes de confirmar; al terminar se indica qué filas se importaron.",
    to: "/members", action: "Abrir Socios",
  },
];

type Shortcut = { keys: string[][]; action: string };

function shortcutGroups(mod: string): { id: string; title: string; hint: string; items: Shortcut[] }[] {
  return [
    {
      id: "global",
      title: "En cualquier pantalla",
      hint: "Las letras funcionan cuando no estás escribiendo en un campo.",
      items: [
        { keys: [[mod, "K"]], action: "Buscar socios y productos" },
        { keys: [["P"]], action: "Cobrar" },
        { keys: [["C"]], action: "Ir a Entradas" },
        { keys: [["K"], ["Ctrl", "Alt", "K"]], action: "Abrir kiosco" },
        { keys: [["V"]], action: "Venta rápida" },
        { keys: [["N"]], action: "Nuevo socio" },
        { keys: [["I"]], action: "Ir a Inicio" },
      ],
    },
    {
      id: "member",
      title: "En la ficha de un socio",
      hint: "Una sola letra nunca registra nada: la entrada se confirma con Enter.",
      items: [
        { keys: [["P"]], action: "Cobrar a este socio" },
        { keys: [["C"], ["Enter"]], action: "Preparar su entrada y confirmarla" },
        { keys: [["E"]], action: "Editar sus datos" },
        { keys: [["Esc"]], action: "Volver a donde venías (o a Socios)" },
      ],
    },
  ];
}

function Keys({ combo }: { combo: string[] }) {
  return (
    <span className="inline-flex items-center gap-1">
      {combo.map((key, i) => (
        <span key={key} className="inline-flex items-center gap-1">
          {i > 0 && <span aria-hidden="true" className="text-xs text-muted-foreground">+</span>}
          <kbd className="inline-flex h-7 min-w-7 items-center justify-center rounded border border-border bg-muted px-1.5 font-sans text-xs font-medium text-foreground tabular">
            {key}
          </kbd>
        </span>
      ))}
    </span>
  );
}

function ShortcutKeys({ keys, sequence }: { keys: string[][]; sequence: boolean }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      {keys.map((combo, i) => (
        <span key={combo.join("+")} className="inline-flex items-center gap-1.5">
          {i > 0 && <span className="text-xs text-muted-foreground">{sequence ? "y luego" : "o"}</span>}
          <Keys combo={combo} />
        </span>
      ))}
    </span>
  );
}

export default function HelpPage() {
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);
  const isOwner = useAuthStore((s) => s.user?.role === "owner");
  const mod = typeof navigator !== "undefined" && navigator.platform.toLowerCase().includes("mac") ? "⌘" : "Ctrl";
  const tasks = TASKS.filter((task) => !task.audience || task.audience === "all" || task.audience === (isOwner ? "owner" : "operator"));
  // Ayuda en contexto: `/help#caja` llega con el tema abierto, a la vista y
  // con el foco en su título, para que Esc/Tab sigan desde ahí.
  const { hash } = useLocation();
  useEffect(() => {
    const id = decodeURIComponent(hash.replace(/^#/, ""));
    if (!id) return;
    const el = document.getElementById(id);
    if (!(el instanceof HTMLDetailsElement)) return;
    el.open = true;
    // Después del cuadro siguiente: el layout regresa el scroll arriba al
    // cambiar de ruta (efecto del padre, que corre después de éste).
    const frame = requestAnimationFrame(() => {
      el.scrollIntoView({ block: "start" });
      el.querySelector("summary")?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(frame);
  }, [hash]);

  async function openSupport() {
    setOpening(true);
    setFailed(false);
    try {
      setFailed(!await openExternalUrl(SUPPORT_WHATSAPP_URL));
    } catch {
      setFailed(true);
    } finally {
      setOpening(false);
    }
  }

  return (
    <PageContainer contentWidth="reading" className="space-y-8">
      <header className="space-y-2">
        <h1 className="font-display text-3xl">Ayuda para recepción</h1>
        <p className="text-muted-foreground">Estas instrucciones están disponibles sin internet.</p>
      </header>

      {[{ id: "urgent", title: "Resolver ahora", items: URGENT }, { id: "tasks", title: "Tareas habituales", items: tasks }].map(group => (
        <section key={group.id} aria-labelledby={`${group.id}-title`} className="space-y-2">
          <h2 id={`${group.id}-title`} className="text-xl font-semibold">{group.title}</h2>
          {group.items.map(task => (
            <details key={task.id} id={task.id} className="scroll-mt-4 border-b border-border">
              <summary className="min-h-11 cursor-pointer py-4 font-medium">{task.title}</summary>
              <div className="space-y-2 pb-4 pl-5">
                <p className="max-w-prose leading-relaxed">{task.body}</p>
                <Link to={task.to} className="inline-flex min-h-11 items-center font-medium underline underline-offset-4">{task.action}</Link>
              </div>
            </details>
          ))}
        </section>
      ))}

      <section aria-labelledby="shortcuts-title" className="space-y-4">
        <h2 id="shortcuts-title" className="text-xl font-semibold">Atajos de teclado</h2>
        {shortcutGroups(mod).map(group => (
          <div key={group.id} className="space-y-2">
            <h3 id={`shortcuts-${group.id}`} className="text-base font-semibold">{group.title}</h3>
            <p className="text-sm text-muted-foreground">{group.hint}</p>
            <dl aria-labelledby={`shortcuts-${group.id}`} className="divide-y divide-border border-y border-border">
              {group.items.map(item => (
                <div key={item.action} className="flex min-h-11 flex-wrap items-center justify-between gap-x-6 gap-y-1 py-2">
                  <dt className="text-sm">{item.action}</dt>
                  <dd><ShortcutKeys keys={item.keys} sequence={item.keys.some(k => k[0] === "Enter")} /></dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </section>

      <section aria-labelledby="support-title" className="space-y-3 border-y border-border py-5">
        <h2 id="support-title" className="text-xl font-semibold">Hablar con soporte</h2>
        <p className="max-w-prose text-sm leading-relaxed text-muted-foreground">
          Cuéntanos qué intentabas hacer y qué ocurrió. No compartas tu PIN, contraseñas ni datos personales de socios.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          {isTauri() ? <Button variant="outline" onClick={() => void openSupport()} disabled={opening}>
            <ExternalLink aria-hidden="true" className="h-4 w-4" />
            {opening ? "Abriendo WhatsApp…" : "Abrir WhatsApp de soporte"}
          </Button> : <Button variant="outline" asChild>
            <a href={SUPPORT_WHATSAPP_URL} target="_blank" rel="noopener noreferrer">
              <ExternalLink aria-hidden="true" className="h-4 w-4" />Abrir WhatsApp de soporte
            </a>
          </Button>}
          <span className="text-sm tabular-nums">+52 446 105 7446</span>
        </div>
        <p className="text-sm text-muted-foreground">Requiere internet. Abre una conversación; tú decides qué enviar.</p>
        {failed && <Alert variant="destructive"><AlertDescription>Si no se abrió WhatsApp, agrega el número de soporte en tu teléfono e inicia la conversación desde ahí.</AlertDescription></Alert>}
        <Link to="/settings/about" className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">Consultar versión y actualizaciones de Tinta</Link>
      </section>
    </PageContainer>
  );
}
