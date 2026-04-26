import { useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  Cake,
  CalendarClock,
  CalendarOff,
  Loader2,
  MessageCircle,
  Package,
  PhoneCall,
  Wallet,
} from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  useAttentionRequired,
  type AttentionExpiringMember,
  type AttentionExpiredMember,
  type AttentionInactiveMember,
  type AttentionLowStockProduct,
  type AttentionPendingBalance,
  type AttentionBirthday,
} from "@/hooks/useReports";
import { fmtMoney } from "@/hooks/useBilling";
import { fmtDate, lastVisitLabel } from "@/lib/dates";
import { attention as t } from "@/strings/attention";
import { ContactAttemptModal } from "@/components/members/ContactAttemptModal";
import { AdjustStockModal } from "@/components/products/AdjustStockModal";
import type { Product } from "@/hooks/useProducts";

export default function AttentionRequiredPage() {
  const data = useAttentionRequired();
  const [contactTarget, setContactTarget] = useState<{ id: string; name: string } | null>(null);
  const [stockTarget, setStockTarget] = useState<Product | null>(null);

  return (
    <div className="p-8 space-y-6 max-w-5xl">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t.page.title}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t.page.subtitle}</p>
      </div>

      {data.isLoading && (
        <div className="flex items-center justify-center py-20">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {data.error && (
        <Alert variant="destructive">
          <AlertDescription>{t.page.error}</AlertDescription>
        </Alert>
      )}

      {data.data && (
        <div className="space-y-4">
          <Section
            icon={CalendarClock}
            title={t.sections.expiring}
            count={data.data.expiring_soon.length}
            empty={t.empty.expiring}
          >
            {data.data.expiring_soon.map((m) => (
              <ExpiringRow
                key={m.member_id}
                m={m}
                onContact={() => setContactTarget({ id: m.member_id, name: m.full_name })}
              />
            ))}
          </Section>

          <Section
            icon={CalendarOff}
            title={t.sections.expiredRecoverable}
            count={data.data.expired_recoverable.length}
            empty={t.empty.expiredRecoverable}
          >
            {data.data.expired_recoverable.map((m) => (
              <ExpiredRow
                key={m.member_id}
                m={m}
                onContact={() => setContactTarget({ id: m.member_id, name: m.full_name })}
              />
            ))}
          </Section>

          <Section
            icon={PhoneCall}
            title={t.sections.inactiveInvoluntary}
            count={data.data.inactive_involuntary.length}
            empty={t.empty.inactiveInvoluntary}
          >
            {data.data.inactive_involuntary.map((m) => (
              <InactiveRow
                key={m.member_id}
                m={m}
                onContact={() => setContactTarget({ id: m.member_id, name: m.full_name })}
              />
            ))}
          </Section>

          <Section
            icon={Package}
            title={t.sections.lowStock}
            count={data.data.low_stock.length}
            empty={t.empty.lowStock}
          >
            {data.data.low_stock.map((p) => (
              <LowStockRow
                key={p.product_id}
                p={p}
                onRestock={() =>
                  setStockTarget({
                    id: p.product_id,
                    name: p.name,
                    stock: p.stock,
                    min_stock: p.min_stock,
                    gym_id: "",
                    category: "",
                    price: 0,
                    active: true,
                    created_at: "",
                  })
                }
              />
            ))}
          </Section>

          <Section
            icon={Wallet}
            title={t.sections.pendingBalance}
            count={data.data.pending_balance.length}
            empty={t.empty.pendingBalance}
          >
            {data.data.pending_balance.map((b) => (
              <PendingBalanceRow key={b.payment_id} b={b} />
            ))}
          </Section>

          <Section
            icon={Cake}
            title={t.sections.birthdays}
            count={data.data.birthdays_today.length}
            empty={t.empty.birthdays}
          >
            {data.data.birthdays_today.map((b) => (
              <BirthdayRow key={b.member_id} b={b} />
            ))}
          </Section>
        </div>
      )}

      {contactTarget && (
        <ContactAttemptModal
          open={!!contactTarget}
          onOpenChange={(o) => !o && setContactTarget(null)}
          memberID={contactTarget.id}
          memberName={contactTarget.name}
          onSuccess={() => setContactTarget(null)}
        />
      )}

      <AdjustStockModal
        open={!!stockTarget}
        onOpenChange={(o) => !o && setStockTarget(null)}
        product={stockTarget}
      />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  count,
  empty,
  children,
}: {
  icon: typeof AlertCircle;
  title: string;
  count: number;
  empty: string;
  children: React.ReactNode;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-5">
        <div className="flex items-center gap-3 mb-3">
          <Icon className="h-5 w-5 text-muted-foreground" />
          <h2 className="font-semibold">{title}</h2>
          <Badge variant="secondary" className="ml-auto">{count}</Badge>
        </div>
        {count === 0 ? (
          <p className="text-sm text-muted-foreground py-4 px-2">{empty}</p>
        ) : (
          <div className="divide-y -mx-2">{children}</div>
        )}
      </CardContent>
    </Card>
  );
}

function ExpiringRow({
  m,
  onContact,
}: {
  m: AttentionExpiringMember;
  onContact: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3 px-2">
      <div className="flex-1 min-w-0">
        <Link to={`/members?selected=${m.member_id}`} className="font-medium hover:underline">
          {m.full_name}
        </Link>
        <div className="text-xs text-muted-foreground">
          {t.expiring.inDays(m.days_until_expiry)} · {fmtDate(m.expiry_date)} · {m.membership_type}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onContact}>
        <MessageCircle className="h-4 w-4" />
        {t.actions.contact}
      </Button>
    </div>
  );
}

function ExpiredRow({
  m,
  onContact,
}: {
  m: AttentionExpiredMember;
  onContact: () => void;
}) {
  const lastContact = m.last_contact_attempt_at
    ? lastVisitLabel(m.last_contact_attempt_at, {
        never: t.expiring.notContacted,
        today: "hoy",
        yesterday: "ayer",
        daysAgo: (n) => `hace ${n} días`,
      })
    : null;

  return (
    <div className="flex items-center gap-3 py-3 px-2">
      <div className="flex-1 min-w-0">
        <Link to={`/members?selected=${m.member_id}`} className="font-medium hover:underline">
          {m.full_name}
        </Link>
        <div className="text-xs text-muted-foreground">
          {t.expiring.overdueDays(m.days_overdue)} · {t.attempts.count(m.contact_attempts_count)}
          {lastContact && ` · ${t.expiring.contactedAt(lastContact)}`}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onContact}>
        <MessageCircle className="h-4 w-4" />
        {t.actions.contact}
      </Button>
    </div>
  );
}

function InactiveRow({
  m,
  onContact,
}: {
  m: AttentionInactiveMember;
  onContact: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3 px-2">
      <div className="flex-1 min-w-0">
        <Link to={`/members?selected=${m.member_id}`} className="font-medium hover:underline">
          {m.full_name}
        </Link>
        <div className="text-xs text-muted-foreground">{t.inactive.daysSince(m.days_since_visit)}</div>
      </div>
      <Button size="sm" variant="outline" onClick={onContact}>
        <MessageCircle className="h-4 w-4" />
        {t.actions.contact}
      </Button>
    </div>
  );
}

function LowStockRow({
  p,
  onRestock,
}: {
  p: AttentionLowStockProduct;
  onRestock: () => void;
}) {
  return (
    <div className="flex items-center gap-3 py-3 px-2">
      <div className="flex-1 min-w-0">
        <div className="font-medium">{p.name}</div>
        <div className="text-xs text-muted-foreground">
          Stock: <span className="text-destructive font-medium">{p.stock}</span> · Mínimo: {p.min_stock}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onRestock}>
        <Package className="h-4 w-4" />
        {t.actions.restock}
      </Button>
    </div>
  );
}

function PendingBalanceRow({ b }: { b: AttentionPendingBalance }) {
  return (
    <div className="flex items-center gap-3 py-3 px-2">
      <div className="flex-1 min-w-0">
        <Link to={`/members?selected=${b.member_id}`} className="font-medium hover:underline">
          {b.full_name}
        </Link>
        <div className="text-xs text-muted-foreground">
          {t.pendingBalance.label(fmtMoney(b.balance))} · desde {fmtDate(b.due_since)}
        </div>
      </div>
      <Button size="sm" variant="outline" asChild>
        <Link to={`/members?selected=${b.member_id}`}>{t.actions.callPayment}</Link>
      </Button>
    </div>
  );
}

function BirthdayRow({ b }: { b: AttentionBirthday }) {
  return (
    <div className="flex items-center gap-3 py-3 px-2">
      <div className="flex-1 min-w-0">
        <Link to={`/members?selected=${b.member_id}`} className="font-medium hover:underline">
          {b.full_name}
        </Link>
        <div className="text-xs text-muted-foreground">Cumple {b.age} 🎂 · {b.phone}</div>
      </div>
      <Button size="sm" variant="outline" asChild>
        <a
          href={`https://wa.me/${b.phone.replace(/[^0-9+]/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="h-4 w-4" />
          {t.actions.sendBirthday}
        </a>
      </Button>
    </div>
  );
}
