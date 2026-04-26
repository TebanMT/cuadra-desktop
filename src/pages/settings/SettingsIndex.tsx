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
import { Card, CardContent } from "@/components/ui/card";
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
    <div className="p-8 space-y-6 max-w-4xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.index.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.index.subtitle}</p>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        {visible.map((s) => (
          <Link key={s.to} to={s.to}>
            <Card className="hover:bg-muted/40 transition-colors cursor-pointer h-full">
              <CardContent className="pt-5 pb-5 flex items-start justify-between gap-3 h-full">
                <div className="flex items-start gap-3">
                  <s.icon className="h-5 w-5 text-primary mt-0.5 shrink-0" />
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
