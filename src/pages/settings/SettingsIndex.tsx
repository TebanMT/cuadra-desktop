import { Link } from "react-router-dom";
import {
  Bell,
  Building2,
  ChevronRight,
  CreditCard,
  History,
  Info,
  MessageSquare,
  User,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";
import { settings as t } from "@/strings/settings";

interface Section {
  to: string;
  icon: typeof CreditCard;
  title: string;
  body: string;
  ownerOnly?: boolean;
  // plusOnly: el card se OCULTA cuando el gym no es Plus. Mientras Plus
  // siga sin venderse, mostrarlo con badge "Próximamente" contamina la
  // experiencia Standard. Cuando Plus se libere, revertir a render con
  // badge (ver `CUANDO PLUS SE LIBERE` en src/hooks/useSubscription.ts).
  plusOnly?: boolean;
}

// "Membresías" no aparece acá: ya vive como entry top-level del sidebar
// (`Tipos de membresía`). Mantener la duplicación confunde al dueño y crea
// dos rutas vivas para la misma página.
//
// "WhatsApp", "Mensajes y plantillas" y "Mensajes a socios" se consolidan en
// una sola entry "Mensajes" con tabs internos (ver MensajesPage). Las rutas
// individuales /settings/whatsapp, /settings/templates y /messaging/broadcast
// siguen vivas como sub-tabs (`?tab=…`) — no las eliminamos para preservar
// deep-links existentes.
const SECTIONS: Section[] = [
  // "Mi perfil" PRIMERO: el dueño (y el operador) lo necesitan para asignar
  // o cambiar SU PIN de recepción. Antes solo estaba enterrado en el
  // dropdown del avatar del top-bar; un dueño no-técnico no lo encontraba.
  {
    to: "/profile",
    icon: User,
    title: t.index.sections.profile.title,
    body: t.index.sections.profile.body,
  },
  {
    to: "/settings/gym",
    icon: Building2,
    title: t.index.sections.gymProfile.title,
    body: t.index.sections.gymProfile.body,
  },
  {
    to: "/settings/subscription",
    icon: CreditCard,
    title: t.index.sections.subscription.title,
    body: t.index.sections.subscription.body,
    ownerOnly: true,
  },
  {
    to: "/settings/operators",
    icon: Users,
    title: t.index.sections.operators.title,
    body: t.index.sections.operators.body,
    ownerOnly: true,
  },
  {
    to: "/settings/mensajes",
    icon: MessageSquare,
    title: t.index.sections.mensajes.title,
    body: t.index.sections.mensajes.body,
    ownerOnly: true,
    // Standard también necesita esta entrada: los comprobantes,
    // recordatorios de vencimiento, mensajes de bienvenida, etc. se
    // envían en Standard (BE: "los recordatorios automáticos +
    // comprobantes son Standard", notifications_controller.go) y el
    // dueño tiene que poder editar las plantillas de esos mensajes.
    // Las tabs Plus (conexión de WhatsApp propio + envío masivo) las
    // gateamos adentro de la página, no acá. NO marcar plusOnly.
  },
  {
    to: "/settings/alerts",
    icon: Bell,
    title: t.index.sections.alerts.title,
    body: t.index.sections.alerts.body,
    ownerOnly: true,
  },
  {
    to: "/admin/audit-log",
    icon: History,
    title: t.index.sections.auditLog.title,
    body: t.index.sections.auditLog.body,
    ownerOnly: true,
    plusOnly: true,
  },
  // "Sobre Tinta" al final: es informativo (versión + actualizaciones),
  // no de configuración del gym. Lo ven dueño y operador — el operador
  // también necesita saber la versión cuando llama a soporte.
  {
    to: "/settings/about",
    icon: Info,
    title: t.index.sections.aboutTinta.title,
    body: t.index.sections.aboutTinta.body,
  },
];

export default function SettingsIndex() {
  const role = useAuthStore((s) => s.user?.role);
  const plan = useAuthStore((s) => s.gym?.subscription_plan);
  const isPlus = canAccessPlusFeatures(plan);
  // Plus aún no se vende — ocultamos los cards Plus en lugar de mostrarlos
  // con badge "Próximamente". Cuando Plus se libere, revertir a render con
  // `plusOnly` badge (ver git history de este archivo y comentario
  // `CUANDO PLUS SE LIBERE` en src/hooks/useSubscription.ts).
  const visible = SECTIONS.filter(
    (s) => (!s.ownerOnly || role === "owner") && (isPlus || !s.plusOnly),
  );

  return (
    <div className="p-6 space-y-6 max-w-5xl mx-auto">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.index.title}
        </h1>
        <p className="text-sm text-muted-foreground">{t.index.subtitle}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((s) => (
          <Link
            key={s.to}
            to={s.to}
            className="group rounded-xl border border-border bg-card text-card-foreground p-5 flex items-start justify-between gap-3 transition-all hover:border-foreground/30 hover:shadow-sm"
          >
            <div className="flex items-start gap-3 min-w-0">
              <span className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <s.icon className="h-5 w-5" strokeWidth={2} />
              </span>
              <div className="min-w-0">
                <span className="font-semibold text-foreground">{s.title}</span>
                <div className="text-sm text-muted-foreground mt-1">{s.body}</div>
              </div>
            </div>
            <ChevronRight className="h-5 w-5 text-muted-foreground shrink-0 group-hover:text-foreground transition-colors" />
          </Link>
        ))}
      </div>
    </div>
  );
}
