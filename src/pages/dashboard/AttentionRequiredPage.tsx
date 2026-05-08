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
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
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
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader, SectionCard } from "@/components/shared/PagePrimitives";
import { cn } from "@/lib/utils";

export default function AttentionRequiredPage() {
  const data = useAttentionRequired();
  const [contactTarget, setContactTarget] = useState<{ id: string; name: string } | null>(null);
  const [stockTarget, setStockTarget] = useState<Product | null>(null);

  const totals = data.data
    ? {
        expiring: data.data.expiring_soon.length,
        expired: data.data.expired_recoverable.length,
        lowStock: data.data.low_stock.length,
        pendingBalance: data.data.pending_balance.length,
      }
    : { expiring: 0, expired: 0, lowStock: 0, pendingBalance: 0 };

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader
        title={t.page.title}
        subtitle={t.page.subtitle}
      />

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
        <>
          {/* Stats */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Por vencer"
              value={totals.expiring}
              icon={CalendarClock}
              tone={totals.expiring > 0 ? "warning" : "neutral"}
              hint="próximos días"
            />
            <StatCard
              title="Vencidos por recuperar"
              value={totals.expired}
              icon={CalendarOff}
              tone={totals.expired > 0 ? "danger" : "neutral"}
              hint="vencidos sin renovar"
            />
            <StatCard
              title="Stock bajo"
              value={totals.lowStock}
              icon={Package}
              tone={totals.lowStock > 0 ? "warning" : "neutral"}
              hint="productos a reabastecer"
            />
            <StatCard
              title="Saldos pendientes"
              value={totals.pendingBalance}
              icon={Wallet}
              tone={totals.pendingBalance > 0 ? "warning" : "neutral"}
              hint="por cobrar"
            />
          </div>

          {/* Order matters: payment-driven sections first (the truly
              actionable ones for barrio gyms whose checkin compliance is
              unreliable). Inactivity-by-checkin moved to the bottom and
              annotated; it's only useful when the gym actually drives
              checkin discipline. */}
          <Section
            icon={CalendarOff}
            title={t.sections.expiredRecoverable}
            count={data.data.expired_recoverable.length}
            empty={t.empty.expiredRecoverable}
            tone="danger"
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
            icon={CalendarClock}
            title={t.sections.expiring}
            count={data.data.expiring_soon.length}
            empty={t.empty.expiring}
            tone="warning"
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
            icon={Wallet}
            title={t.sections.pendingBalance}
            count={data.data.pending_balance.length}
            empty={t.empty.pendingBalance}
            tone="warning"
          >
            {data.data.pending_balance.map((b) => (
              <PendingBalanceRow key={b.member_id} b={b} />
            ))}
          </Section>

          <Section
            icon={Package}
            title={t.sections.lowStock}
            count={data.data.low_stock.length}
            empty={t.empty.lowStock}
            tone="warning"
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
            icon={Cake}
            title={t.sections.birthdays}
            count={data.data.birthdays_today.length}
            empty={t.empty.birthdays}
            tone="neutral"
          >
            {data.data.birthdays_today.map((b) => (
              <BirthdayRow key={b.member_id} b={b} />
            ))}
          </Section>

          {/* Last: only useful when the gym drives checkin discipline. */}
          <Section
            icon={PhoneCall}
            title={t.sections.inactiveInvoluntary}
            count={data.data.inactive_involuntary.length}
            empty={t.empty.inactiveInvoluntary}
            note="Esto se basa en checkins. Si tu gym aún no tiene torniquete o lector, los datos pueden ser incompletos — usa esta sección con criterio."
          >
            {data.data.inactive_involuntary.map((m) => (
              <InactiveRow
                key={m.member_id}
                m={m}
                onContact={() => setContactTarget({ id: m.member_id, name: m.full_name })}
              />
            ))}
          </Section>
        </>
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

interface SectionProps {
  icon: typeof AlertCircle;
  title: string;
  count: number;
  empty: string;
  tone?: "accent" | "warning" | "danger" | "neutral";
  /** Optional caveat displayed inline under the section title — used to flag
   * sections whose data quality depends on operator behaviour (e.g.
   * checkin-driven inactivity in gyms without a turnstile). */
  note?: string;
  children: React.ReactNode;
}

function Section({ icon: Icon, title, count, empty, tone = "neutral", note, children }: SectionProps) {
  // Soft pills consistentes con Badge variants — disciplina semantica.
  const toneClass = {
    accent: "bg-brick-100 text-brick-500 dark:bg-brick-500/20 dark:text-brick-300",
    warning: "bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
    danger: "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-100",
    neutral: "bg-paper-200 text-ink-500 dark:bg-ink-700 dark:text-ink-300",
  }[tone];

  return (
    <SectionCard
      flush
      title={
        <div className="flex items-center gap-3">
          <span className={cn("inline-flex items-center justify-center h-8 w-8 rounded-md", toneClass)}>
            <Icon className="h-4 w-4" />
          </span>
          <span>{title}</span>
          <span className="ml-1 inline-flex items-center justify-center rounded h-5 min-w-[20px] px-1.5 text-xs font-semibold tabular bg-muted text-muted-foreground">
            {count}
          </span>
        </div>
      }
    >
      {note && (
        <p className="text-xs text-muted-foreground px-6 pb-3 -mt-1">{note}</p>
      )}
      {count === 0 ? (
        <p className="text-sm text-muted-foreground py-6 px-6">{empty}</p>
      ) : (
        <ul className="divide-y divide-border">{children}</ul>
      )}
    </SectionCard>
  );
}

function RowShell({ children }: { children: React.ReactNode }) {
  return <li className="flex items-center gap-3 px-6 py-3.5">{children}</li>;
}

function ExpiringRow({
  m,
  onContact,
}: {
  m: AttentionExpiringMember;
  onContact: () => void;
}) {
  return (
    <RowShell>
      <div className="flex-1 min-w-0">
        <Link
          to={`/members?selected=${m.member_id}`}
          className="text-sm font-semibold text-foreground hover:underline"
        >
          {m.full_name}
        </Link>
        <div className="text-xs text-muted-foreground mt-0.5">
          <span className="text-warning font-medium">
            {t.expiring.inDays(m.days_until_expiry)}
          </span>
          <span className="mx-1.5">·</span>
          <span className="tabular">{fmtDate(m.expiry_date)}</span>
          <span className="mx-1.5">·</span>
          <span>{m.membership_type}</span>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onContact} className="rounded-md">
        <MessageCircle className="h-4 w-4" />
        {t.actions.contact}
      </Button>
    </RowShell>
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
    <RowShell>
      <div className="flex-1 min-w-0">
        <Link
          to={`/members?selected=${m.member_id}`}
          className="text-sm font-semibold text-foreground hover:underline"
        >
          {m.full_name}
        </Link>
        <div className="text-xs text-muted-foreground mt-0.5">
          <span className="text-destructive font-medium">
            {t.expiring.overdueDays(m.days_overdue)}
          </span>
          <span className="mx-1.5">·</span>
          <span>{t.attempts.count(m.contact_attempts_count)}</span>
          {lastContact && (
            <>
              <span className="mx-1.5">·</span>
              <span>{t.expiring.contactedAt(lastContact)}</span>
            </>
          )}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onContact} className="rounded-md">
        <MessageCircle className="h-4 w-4" />
        {t.actions.contact}
      </Button>
    </RowShell>
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
    <RowShell>
      <div className="flex-1 min-w-0">
        <Link
          to={`/members?selected=${m.member_id}`}
          className="text-sm font-semibold text-foreground hover:underline"
        >
          {m.full_name}
        </Link>
        <div className="text-xs text-muted-foreground mt-0.5">
          {t.inactive.daysSince(m.days_since_visit)}
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onContact} className="rounded-md">
        <MessageCircle className="h-4 w-4" />
        {t.actions.contact}
      </Button>
    </RowShell>
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
    <RowShell>
      <div className="flex-1 min-w-0">
        <div className="text-sm font-semibold text-foreground">{p.name}</div>
        <div className="text-xs text-muted-foreground mt-0.5">
          Stock <span className="text-destructive font-medium tabular">{p.stock}</span>
          <span className="mx-1.5">·</span>
          Mínimo <span className="tabular">{p.min_stock}</span>
        </div>
      </div>
      <Button size="sm" variant="outline" onClick={onRestock} className="rounded-md">
        <Package className="h-4 w-4" />
        {t.actions.restock}
      </Button>
    </RowShell>
  );
}

function PendingBalanceRow({ b }: { b: AttentionPendingBalance }) {
  return (
    <RowShell>
      <div className="flex-1 min-w-0">
        <Link
          to={`/members?selected=${b.member_id}`}
          className="text-sm font-semibold text-foreground hover:underline"
        >
          {b.full_name}
        </Link>
        <div className="text-xs text-muted-foreground mt-0.5">
          <span className="text-warning font-medium tabular">
            {t.pendingBalance.label(fmtMoney(b.balance))}
          </span>
          <span className="mx-1.5">·</span>
          <span>desde {fmtDate(b.due_since)}</span>
        </div>
      </div>
      <Button size="sm" variant="outline" asChild className="rounded-md">
        <Link to={`/members?selected=${b.member_id}`}>{t.actions.callPayment}</Link>
      </Button>
    </RowShell>
  );
}

function BirthdayRow({ b }: { b: AttentionBirthday }) {
  return (
    <RowShell>
      <div className="flex-1 min-w-0">
        <Link
          to={`/members?selected=${b.member_id}`}
          className="text-sm font-semibold text-foreground hover:underline"
        >
          {b.full_name}
        </Link>
        <div className="text-xs text-muted-foreground mt-0.5">
          <span>Cumple {b.age}</span>
          <span className="mx-1.5">·</span>
          <span className="tabular">{b.phone}</span>
        </div>
      </div>
      <Button size="sm" variant="outline" asChild className="rounded-md">
        <a
          href={`https://wa.me/${b.phone.replace(/[^0-9+]/g, "")}`}
          target="_blank"
          rel="noopener noreferrer"
        >
          <MessageCircle className="h-4 w-4" />
          {t.actions.sendBirthday}
        </a>
      </Button>
    </RowShell>
  );
}
