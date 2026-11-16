import { PageContainer } from "@/components/shared/PagePrimitives";
import { useState } from "react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { GlobalSearch } from "@/components/layout/GlobalSearch";
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
import { dashboard as t } from "@/strings/dashboard";

export default function DashboardPage() {
  const owner = useAuthStore((s) => s.user?.role === "owner");
  const dashboard = useDashboard(),
    attention = useAttentionRequired(),
    profile = useGymProfile();
  const [entriesOpen, setEntriesOpen] = useState(false);
  const day = dashboardDay(dashboard.data, profile.data?.timezone);
  const busy = dashboard.isFetching || attention.isFetching;
  const refresh = () =>
    Promise.all([dashboard.refetch(), attention.refetch(), profile.refetch()]);
  const balances = attention.data?.pending_balance;
  // Each row is named like the filter it opens, so "113" on Inicio and the
  // count on the destination list read as the same thing.
  const items = (dashboard.data
    ? memberReviewItems(
        dashboard.data,
        true,
        balances && !attention.isError
          ? sumMoney(balances.map((d) => d.balance))
          : undefined,
      )
    : []
  ).map((item) => ({ ...item, ...t.review[item.id] }));
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
    <PageContainer className="space-y-5">
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
      <section aria-labelledby="home-search-title" className="space-y-3 pb-2">
        <h2 id="home-search-title" className="text-xl">Atender a un socio</h2>
        {/* Ctrl/⌘K opens the shared search dialog, it never focuses this
            field: hide the shortcut hint here so it doesn't promise that. */}
        <GlobalSearch className="w-full max-w-2xl [&_kbd]:hidden" prominent />
        <p className="text-sm text-muted-foreground">Consulta la vigencia y los datos del socio desde su ficha.</p>
      </section>
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
          <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
            <ReviewList items={items} notices={notices} />
            <RecentPayments data={dashboard.data} incomePath="/billing" />
          </div>
          {owner && <details className="border-t pt-2">
            <summary className="min-h-11 cursor-pointer py-3 text-sm font-medium">Resumen del mes</summary>
            <div className="pt-3 pb-2"><MonthSummary data={dashboard.data} day={day} /></div>
          </details>}

        </>
      )}
      {entriesOpen && day && (
        <CheckinHistoryDialog
          from={day}
          to={day}
          onClose={() => setEntriesOpen(false)}
        />
      )}
    </PageContainer>
  );
}
