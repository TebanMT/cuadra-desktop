import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertCircle,
  CalendarClock,
  CalendarOff,
  DollarSign,
  Loader2,
  MessageCircle,
  Package,
  Wallet,
} from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  useAttentionRequired,
  type AttentionExpiringMember,
  type AttentionExpiredMember,
  type AttentionLowStockProduct,
  type AttentionPendingBalance,
} from "@/hooks/useReports";
import { fmtMoney } from "@/hooks/useBilling";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { fmtDate } from "@/lib/dates";
import { whatsappUrl } from "@/lib/whatsapp";
import { attention as t } from "@/strings/attention";
import { AdjustStockModal } from "@/components/products/AdjustStockModal";
import type { Product } from "@/hooks/useProducts";
import { StatCard } from "@/components/shared/StatCard";
import { PageHeader, SectionCard } from "@/components/shared/PagePrimitives";
import { cn } from "@/lib/utils";

// SocioInboxRow combina los 3 ejes de problema en una sola fila por
// socio (member_id). Así "María García vence + tiene saldo" aparece UNA
// vez con dos chips, no dos veces en dos secciones diferentes.
interface SocioInboxRow {
  member_id: string;
  full_name: string;
  phone: string;
  expired?: AttentionExpiredMember;
  expiring?: AttentionExpiringMember;
  balance?: AttentionPendingBalance;
}

type FilterKey = "all" | "expired" | "expiring" | "balance";

export default function AttentionRequiredPage() {
  const data = useAttentionRequired();
  const [stockTarget, setStockTarget] = useState<Product | null>(null);
  const [filter, setFilter] = useState<FilterKey>("all");

  const inbox = useMemo<SocioInboxRow[]>(() => {
    if (!data.data) return [];
    const map = new Map<string, SocioInboxRow>();
    const upsert = (id: string, name: string, phone: string): SocioInboxRow => {
      const cur = map.get(id);
      if (cur) return cur;
      const row: SocioInboxRow = { member_id: id, full_name: name, phone };
      map.set(id, row);
      return row;
    };
    for (const m of data.data.expired_recoverable) {
      upsert(m.member_id, m.full_name, m.phone).expired = m;
    }
    for (const m of data.data.expiring_soon) {
      upsert(m.member_id, m.full_name, m.phone).expiring = m;
    }
    for (const b of data.data.pending_balance) {
      upsert(b.member_id, b.full_name, b.phone).balance = b;
    }
    // Ordenamiento por urgencia: vencidos (más recientes primero, son los
    // recuperables), luego saldos altos, luego por vencer (más cercanos).
    // Empate por nombre alfabético para que sea estable entre fetches.
    return [...map.values()].sort((a, b) => urgency(b) - urgency(a) || a.full_name.localeCompare(b.full_name));
  }, [data.data]);

  const counts = useMemo(() => {
    const c = { all: 0, expired: 0, expiring: 0, balance: 0 };
    for (const r of inbox) {
      c.all++;
      if (r.expired) c.expired++;
      if (r.expiring) c.expiring++;
      if (r.balance) c.balance++;
    }
    return c;
  }, [inbox]);

  const filtered = useMemo(() => {
    if (filter === "all") return inbox;
    return inbox.filter((r) => r[filter]);
  }, [filter, inbox]);

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <PageHeader title={t.page.title} subtitle={t.page.subtitle} />

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
          {/* Stats — overview de los 4 indicadores accionables. */}
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            <StatCard
              title="Vencidos por recuperar"
              value={data.data.expired_recoverable.length}
              icon={CalendarOff}
              tone={data.data.expired_recoverable.length > 0 ? "danger" : "neutral"}
              hint="vencidos sin renovar"
            />
            <StatCard
              title="Por vencer"
              value={data.data.expiring_soon.length}
              icon={CalendarClock}
              tone={data.data.expiring_soon.length > 0 ? "warning" : "neutral"}
              hint="próximos 7 días"
            />
            <StatCard
              title="Saldos pendientes"
              value={data.data.pending_balance.length}
              icon={Wallet}
              tone={data.data.pending_balance.length > 0 ? "warning" : "neutral"}
              hint="por cobrar"
            />
            <StatCard
              title="Stock bajo"
              value={data.data.low_stock.length}
              icon={Package}
              tone={data.data.low_stock.length > 0 ? "warning" : "neutral"}
              hint="productos a reabastecer"
            />
          </div>

          {/* Inbox unificado de socios */}
          <SectionCard
            flush
            title={
              <div className="flex items-center gap-3 flex-wrap">
                <span>{t.sections.socios}</span>
                <span className="inline-flex items-center justify-center rounded h-5 min-w-[20px] px-1.5 text-xs font-semibold tabular bg-muted text-muted-foreground">
                  {filtered.length}
                </span>
                <div className="ml-auto flex items-center gap-1 flex-wrap">
                  <FilterPill label={t.filters.all} count={counts.all} active={filter === "all"} onClick={() => setFilter("all")} />
                  <FilterPill label={t.filters.expired} count={counts.expired} active={filter === "expired"} onClick={() => setFilter("expired")} tone="danger" />
                  <FilterPill label={t.filters.expiring} count={counts.expiring} active={filter === "expiring"} onClick={() => setFilter("expiring")} tone="warning" />
                  <FilterPill label={t.filters.balance} count={counts.balance} active={filter === "balance"} onClick={() => setFilter("balance")} tone="warning" />
                </div>
              </div>
            }
          >
            {filtered.length === 0 ? (
              <p className="text-sm text-muted-foreground py-8 px-6 text-center">
                {inbox.length === 0 ? t.empty.socios : "Nada en este filtro."}
              </p>
            ) : (
              <ul className="divide-y divide-border">
                {filtered.map((row) => (
                  <SocioRow key={row.member_id} row={row} />
                ))}
              </ul>
            )}
          </SectionCard>

          {/* Stock bajo — entidad distinta (productos), acciones distintas. */}
          <SectionCard
            flush
            title={
              <div className="flex items-center gap-3">
                <span className="inline-flex items-center justify-center h-8 w-8 rounded-md bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100">
                  <Package className="h-4 w-4" />
                </span>
                <span>{t.sections.lowStock}</span>
                <span className="ml-1 inline-flex items-center justify-center rounded h-5 min-w-[20px] px-1.5 text-xs font-semibold tabular bg-muted text-muted-foreground">
                  {data.data.low_stock.length}
                </span>
              </div>
            }
          >
            {data.data.low_stock.length === 0 ? (
              <p className="text-sm text-muted-foreground py-6 px-6">{t.empty.lowStock}</p>
            ) : (
              <ul className="divide-y divide-border">
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
              </ul>
            )}
          </SectionCard>
        </>
      )}

      <AdjustStockModal
        open={!!stockTarget}
        onOpenChange={(o) => !o && setStockTarget(null)}
        product={stockTarget}
      />
    </div>
  );
}

// Score por socio. Pondera: vencido (max 1000 si <15d, decae con días), saldo
// (monto / 10), por vencer (más cercano > más lejano). Los tres se suman así
// que socios con múltiples problemas suben al tope.
function urgency(r: SocioInboxRow): number {
  let s = 0;
  if (r.expired) {
    // Recovery window óptimo: 1–15 días. Después decae linealmente hasta 60.
    const d = r.expired.days_overdue;
    if (d <= 15) s += 1000;
    else if (d <= 60) s += 1000 - (d - 15) * 15;
    else s += 250;
  }
  if (r.balance) s += Math.min(r.balance.balance / 10, 500);
  if (r.expiring) s += 300 - r.expiring.days_until_expiry * 30;
  return s;
}

function FilterPill({
  label,
  count,
  active,
  onClick,
  tone = "neutral",
}: {
  label: string;
  count: number;
  active: boolean;
  onClick: () => void;
  tone?: "neutral" | "warning" | "danger";
}) {
  const activeClass = {
    neutral: "bg-foreground text-background",
    warning: "bg-warning text-warning-foreground",
    danger: "bg-destructive text-destructive-foreground",
  }[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium transition-colors",
        active ? activeClass : "bg-muted text-muted-foreground hover:bg-muted/80"
      )}
    >
      <span>{label}</span>
      <span className={cn("tabular-nums", active ? "opacity-80" : "opacity-60")}>
        {count}
      </span>
    </button>
  );
}

function SocioRow({ row }: { row: SocioInboxRow }) {
  const money = useMoneyVisibility();
  // El mensaje de WhatsApp se elige por la issue más urgente del socio:
  // vencido > saldo > por vencer. El operador puede editar antes de mandar
  // si quiere combinar; mantenemos el default corto para no obligar a leer.
  // NOTA: el template SIEMPRE usa el monto real — vamos a mandar ese
  // mensaje al socio, ocultarlo en la URL no protege nada y rompería el
  // contenido. El "ojo" solo enmascara lo que se ve en pantalla.
  const message = (() => {
    if (row.expired) return t.whatsappTemplates.expired(row.full_name, row.expired.days_overdue);
    if (row.balance) return t.whatsappTemplates.pendingBalance(row.full_name, fmtMoney(row.balance.balance));
    if (row.expiring) {
      return t.whatsappTemplates.expiring(
        row.full_name,
        fmtDate(row.expiring.expiry_date),
        row.expiring.days_until_expiry
      );
    }
    return "";
  })();
  const waHref = whatsappUrl(row.phone, message);

  return (
    <li className="flex items-center gap-3 px-6 py-3.5">
      <div className="flex-1 min-w-0">
        <Link
          to={`/members/${row.member_id}`}
          className="text-sm font-semibold text-foreground hover:underline"
        >
          {row.full_name}
        </Link>
        <div className="mt-1 flex flex-wrap items-center gap-1.5">
          {row.expired && (
            <Chip tone="danger" icon={CalendarOff}>
              {t.chips.expired(row.expired.days_overdue)}
            </Chip>
          )}
          {row.balance && (
            <Chip tone="warning" icon={Wallet}>
              {t.chips.balance(money.fmt(row.balance.balance))}
            </Chip>
          )}
          {row.expiring && (
            <Chip tone="warning" icon={CalendarClock}>
              {t.chips.expiring(row.expiring.days_until_expiry)}
            </Chip>
          )}
          <span className="text-xs text-muted-foreground ml-1 tabular">{row.phone}</span>
        </div>
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {waHref && (
          <Button size="sm" variant="default" asChild className="rounded-md">
            <a href={waHref} target="_blank" rel="noopener noreferrer">
              <MessageCircle className="h-4 w-4" />
              {t.actions.whatsapp}
            </a>
          </Button>
        )}
        <Button size="sm" variant="outline" asChild className="rounded-md">
          <Link to={`/members/${row.member_id}?action=pay`}>
            <DollarSign className="h-4 w-4" />
            {t.actions.pay}
          </Link>
        </Button>
      </div>
    </li>
  );
}

function Chip({
  tone,
  icon: Icon,
  children,
}: {
  tone: "warning" | "danger";
  icon: typeof AlertCircle;
  children: React.ReactNode;
}) {
  const toneClass = {
    warning: "bg-warning-100 text-warning-700 dark:bg-warning-500/20 dark:text-warning-100",
    danger: "bg-danger-100 text-danger-700 dark:bg-danger-500/20 dark:text-danger-100",
  }[tone];
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        toneClass
      )}
    >
      <Icon className="h-3 w-3" />
      {children}
    </span>
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
    <li className="flex items-center gap-3 px-6 py-3.5">
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
    </li>
  );
}
