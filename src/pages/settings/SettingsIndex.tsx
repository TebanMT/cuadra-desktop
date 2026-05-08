import { Link } from "react-router-dom";
import {
  AlertCircle,
  Bell,
  Building2,
  ChevronRight,
  CreditCard,
  History,
  MessageCircle,
  MessageSquare,
  Users,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { settings as t } from "@/strings/settings";

interface Section {
  to: string;
  icon: typeof CreditCard;
  title: string;
  body: string;
  ownerOnly?: boolean;
}

const SECTIONS: Section[] = [
  {
    to: "/settings/gym",
    icon: Building2,
    title: t.index.sections.gymProfile.title,
    body: t.index.sections.gymProfile.body,
  },
  {
    to: "/settings/membership-types",
    icon: CreditCard,
    title: t.index.sections.membershipTypes.title,
    body: t.index.sections.membershipTypes.body,
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
    to: "/settings/whatsapp",
    icon: MessageCircle,
    title: t.index.sections.whatsapp.title,
    body: t.index.sections.whatsapp.body,
    ownerOnly: true,
  },
  {
    to: "/settings/templates",
    icon: MessageSquare,
    title: t.index.sections.templates.title,
    body: t.index.sections.templates.body,
    ownerOnly: true,
  },
  {
    to: "/settings/alerts",
    icon: Bell,
    title: t.index.sections.alerts.title,
    body: t.index.sections.alerts.body,
    ownerOnly: true,
  },
  {
    to: "/messaging/broadcast",
    icon: AlertCircle,
    title: t.index.sections.broadcasts.title,
    body: t.index.sections.broadcasts.body,
    ownerOnly: true,
  },
  {
    to: "/admin/audit-log",
    icon: History,
    title: t.index.sections.auditLog.title,
    body: t.index.sections.auditLog.body,
    ownerOnly: true,
  },
];

export default function SettingsIndex() {
  const role = useAuthStore((s) => s.user?.role);
  const visible = SECTIONS.filter((s) => !s.ownerOnly || role === "owner");

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
                <div className="font-semibold text-foreground">{s.title}</div>
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
