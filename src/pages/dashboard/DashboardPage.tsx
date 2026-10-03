import { useState } from "react";
import { Link } from "react-router-dom";
import {
  DollarSign,
  ShoppingCart,
  UserPlus,
  RefreshCw,
  Maximize2,
  X,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { QuickPayModal } from "@/components/billing/QuickPayModal";
import { CheckinHistoryDialog } from "@/components/reports/CheckinHistoryDialog";
import {
  DashboardSkeleton,
  LoadError,
  MonthSummary,
  TodaySummary,
  ReviewList,
  RecentPayments,
} from "@/components/dashboard/HomeWidgets";
import { useAuthStore } from "@/stores/useAuthStore";
import { useDashboard, useAttentionRequired } from "@/hooks/useReports";
import { useGymProfile } from "@/hooks/useGym";
import { dashboardDay, sumMoney, memberReviewItems } from "@/lib/dashboard";
import { fmtDate } from "@/lib/dates";
import { openKioskWindow } from "@/lib/kioskWindow";

export default function DashboardPage() {
  const owner = useAuthStore((s) => s.user?.role === "owner");
  const readOnly = useAuthStore((s) => s.readOnly);
  const dashboard = useDashboard(),
    attention = useAttentionRequired(),
    profile = useGymProfile();
  const [payOpen, setPayOpen] = useState(false),
    [entriesOpen, setEntriesOpen] = useState(false);
  const day = dashboardDay(dashboard.data, profile.data?.timezone);
  const busy = dashboard.isFetching || attention.isFetching;
  const refresh = () =>
    Promise.all([dashboard.refetch(), attention.refetch(), profile.refetch()]);
  const balances = attention.data?.pending_balance;
  const items = dashboard.data
    ? memberReviewItems(
        dashboard.data,
        true,
        balances && !attention.isError
          ? sumMoney(balances.map((d) => d.balance))
          : undefined,
      )
    : [];
  const notices = attention.isError ? (
    <LoadError retry={attention.refetch} busy={attention.isFetching}>
      No se pudo actualizar el saldo pendiente.
    </LoadError>
  ) : !balances ? (
    <p role="status" className="text-sm text-muted-foreground">
      Consultando saldos pendientes…
    </p>
  ) : null;
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Inicio</h1>
          {day && (
            <p className="mt-1 text-sm text-muted-foreground">{fmtDate(day)}</p>
          )}
        </div>
        <Button
          variant="ghost"
          size="sm"
          disabled={busy}
          onClick={() => void refresh()}
        >
          <RefreshCw className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          Actualizar
        </Button>
      </header>
      <nav aria-label="Acciones de recepción" className="flex flex-wrap gap-2">
        <Button size="lg" disabled={readOnly} onClick={() => setPayOpen(true)}>
          <DollarSign className="h-5 w-5" />
          Cobrar
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/sales">
            <ShoppingCart className="h-5 w-5" />
            Venta rápida
          </Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/members/new">
            <UserPlus className="h-5 w-5" />
            Nuevo socio
          </Link>
        </Button>
        <Button size="lg" variant="ghost" asChild>
          <Link to="/checkin">Entradas</Link>
        </Button>
        <Button size="lg" variant="ghost" asChild>
          <Link to="/reports/cash-close">Caja</Link>
        </Button>
      </nav>
      {dashboard.isLoading && <DashboardSkeleton />}
      {dashboard.isError && (
        <LoadError retry={dashboard.refetch} busy={dashboard.isFetching}>
          {dashboard.data
            ? "No se pudo actualizar el resumen. Se muestran los datos anteriores."
            : "No se pudo cargar el resumen."}
        </LoadError>
      )}
      {dashboard.data && (
        <>
          <TodaySummary
            data={dashboard.data}
            day={day}
            onEntries={() => setEntriesOpen(true)}
          />
          <div
            className={`grid items-start gap-5 ${items.length || notices ? "lg:grid-cols-[minmax(0,1.1fr)_minmax(0,1fr)]" : ""}`}
          >
            {(items.length > 0 || notices || owner) && (
              <div className="min-w-0 space-y-5">
                <ReviewList items={items} notices={notices} />
                {owner && <MonthSummary data={dashboard.data} day={day} />}
              </div>
            )}
            <RecentPayments data={dashboard.data} incomePath="/billing" />
          </div>
        </>
      )}
      <KioskHint />
      <QuickPayModal open={payOpen} onOpenChange={setPayOpen} />
      {entriesOpen && day && (
        <CheckinHistoryDialog
          from={day}
          to={day}
          onClose={() => setEntriesOpen(false)}
        />
      )}
    </div>
  );
}

function KioskHint() {
  const [dismissed, setDismissed] = useState(
    () => localStorage.getItem("tinta:onboarding.kiosk_card_dismissed") === "1",
  );
  if (dismissed) return null;
  const dismiss = () => {
    localStorage.setItem("tinta:onboarding.kiosk_card_dismissed", "1");
    setDismissed(true);
  };
  return (
    <aside className="flex flex-wrap items-center gap-3 rounded-lg border p-3 text-sm">
      <Maximize2 className="h-4 w-4 shrink-0 text-muted-foreground" />
      <p className="flex-1">
        ¿Tienes una pantalla para que los socios registren su entrada?
      </p>
      <Button
        variant="outline"
        size="sm"
        onClick={() => {
          dismiss();
          void openKioskWindow();
        }}
      >
        Abrir kiosko
      </Button>
      <Button
        variant="ghost"
        size="icon"
        aria-label="Ocultar ayuda del kiosko"
        onClick={dismiss}
      >
        <X className="h-4 w-4" />
      </Button>
    </aside>
  );
}
