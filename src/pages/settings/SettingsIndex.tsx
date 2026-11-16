import { PageContainer } from "@/components/shared/PagePrimitives";
import { Link } from "react-router-dom";
import {
  CircleHelp,
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
  /** Descripción para el operador cuando la página sólo se consulta. */
  bodyOperator?: string;
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
    bodyOperator: t.index.sections.gymProfile.bodyOperator,
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
  {
    to: "/help",
    icon: CircleHelp,
    title: t.index.sections.help.title,
    body: t.index.sections.help.body,
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
  const plan = useAuthStore((s) => s.gym);
  const isPlus = canAccessPlusFeatures(plan);
  // Plus aún no se vende — ocultamos los cards Plus en lugar de mostrarlos
  // con badge "Próximamente". Cuando Plus se libere, revertir a render con
  // `plusOnly` badge (ver git history de este archivo y comentario
  // `CUANDO PLUS SE LIBERE` en src/hooks/useSubscription.ts).
  const isOwner = role === "owner";
  const visible = SECTIONS.filter(
    (s) => (!s.ownerOnly || isOwner) && (isPlus || !s.plusOnly),
  );

  return (
    <PageContainer className="space-y-6">
      <div className="space-y-1">
        <h1
          className="text-3xl font-bold text-foreground"
          style={{ letterSpacing: "-0.02em" }}
        >
          {t.index.title}
        </h1>
        <p className="text-sm text-muted-foreground">{isOwner ? t.index.subtitleOwner : t.index.subtitleOperator}</p>
      </div>

      <div className="space-y-7">
        {[
          { title: t.index.groups.operation, routes: ["/settings/gym", "/settings/mensajes", "/settings/alerts"] },
          { title: t.index.groups.account, routes: ["/profile", "/settings/operators", "/settings/subscription", "/admin/audit-log"] },
          { title: t.index.groups.help, routes: ["/help", "/settings/about"] },
        ].map(group => {
          const sections = visible.filter(section => group.routes.includes(section.to));
          if (!sections.length) return null;
          return <section key={group.title} aria-label={group.title} className="grid gap-2 md:grid-cols-[190px_1fr] md:gap-6">
            <h2 className="pt-3 text-base font-semibold">{group.title}</h2>
            <div className="divide-y border-t border-b">
              {sections.map(section => <Link key={section.to} to={section.to} className="group flex min-h-16 items-center gap-3 px-2 py-3 hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring">
                <section.icon aria-hidden="true" className="h-5 w-5 shrink-0 text-muted-foreground" />
                <div className="min-w-0 flex-1"><p className="font-medium">{section.title}</p><p className="text-sm text-muted-foreground">{!isOwner && section.bodyOperator ? section.bodyOperator : section.body}</p></div>
                <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
              </Link>)}
            </div>
          </section>;
        })}
      </div>
    </PageContainer>
  );
}
