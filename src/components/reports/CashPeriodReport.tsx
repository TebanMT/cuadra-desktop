import { normalizeReportMetric } from "@/lib/report-summary";
import { Link } from "react-router-dom";
import { useState } from "react";
import { CircleAlert } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/shared/PagePrimitives";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import type {
  CashOpeningDifference,
  CashSessionDifference,
  ReportsRangeData,
} from "@/hooks/useReports";
import { fmtDate, fmtDateTime, fmtDayMonth } from "@/lib/dates";

type CashStatus = "complete" | "incomplete" | "stale";
type CoverageIssue = { text: string; dates?: string[] };
const MAX_LINKED_DATES = 7;
const MAX_DIFFERENCE_ROWS = 5;

function cashHistoryPath(date: string, drawerId?: string) {
  const params = new URLSearchParams({ tab: "history", date });
  if (drawerId) params.set("cash_drawer_id", drawerId);
  return `/reports/cash-close?${params}`;
}

function sessionCount(count: number, none: string) {
  return count === 0 ? none : `En ${count} ${count === 1 ? "corte" : "cortes"}`;
}

function CashDifferenceSummary({
  sessions,
  shortageTotal,
  shortageSessions,
  surplusTotal,
  surplusSessions,
  sameYear,
  fmt,
}: {
  sessions: CashSessionDifference[];
  shortageTotal: number;
  shortageSessions: number;
  surplusTotal: number;
  surplusSessions: number;
  sameYear: boolean;
  fmt: (value: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? sessions : sessions.slice(0, MAX_DIFFERENCE_ROWS);
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-semibold text-foreground">
        Faltantes y sobrantes
      </p>
      {sessions.length === 0 ? (
        <p className="mt-1 text-sm text-muted-foreground">
          En los cortes contados no faltó ni sobró dinero.
        </p>
      ) : (
        <>
          <p className="mb-2 mt-1 text-xs text-muted-foreground">
            Cada corte se cuenta aparte: un sobrante no cubre un faltante.
          </p>
          <div className="grid gap-3 sm:grid-cols-2">
            <CashMetric
              label="Faltantes"
              value={fmt(shortageTotal)}
              hint={sessionCount(shortageSessions, "Ningún corte con faltante")}
            />
            <CashMetric
              label="Sobrantes"
              value={fmt(surplusTotal)}
              hint={sessionCount(surplusSessions, "Ningún corte con sobrante")}
            />
          </div>
          <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
            {visible.map((session) => {
              const short = session.difference < 0;
              const details = [
                session.counted_by_name && `Contó ${session.counted_by_name}`,
                session.reason,
              ].filter(Boolean);
              return (
                <li key={session.session_id}>
                  <Link
                    className="flex min-h-11 items-start justify-between gap-3 px-3 py-2 hover:bg-muted/40"
                    to={cashHistoryPath(session.date, session.drawer_id)}
                  >
                    <span className="min-w-0">
                      <span className="block text-sm font-medium text-foreground">
                        {sameYear
                          ? fmtDayMonth(session.date)
                          : fmtDate(session.date)}
                        {session.drawer_name && ` · ${session.drawer_name}`}
                        {session.sequence > 1 && ` · corte ${session.sequence}`}
                      </span>
                      {details.length > 0 && (
                        <span className="block break-words text-xs text-muted-foreground">
                          {details.join(" · ")}
                        </span>
                      )}
                    </span>
                    <span
                      className={`shrink-0 text-sm font-semibold tabular ${short ? "text-destructive" : "text-foreground"}`}
                    >
                      {short ? "Faltan" : "Sobran"}{" "}
                      {fmt(Math.abs(session.difference))}
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
          {sessions.length > MAX_DIFFERENCE_ROWS && (
            <button
              type="button"
              className="mt-1 min-h-11 text-xs font-medium text-primary hover:underline"
              onClick={() => setExpanded((value) => !value)}
            >
              {expanded ? "Ver menos" : `Ver los ${sessions.length} cortes`}
            </button>
          )}
        </>
      )}
    </div>
  );
}

function CashOpeningDifferenceSummary({
  openings,
  shortageTotal,
  shortageSessions,
  surplusTotal,
  surplusSessions,
  sameYear,
  fmt,
}: {
  openings: CashOpeningDifference[];
  shortageTotal: number;
  shortageSessions: number;
  surplusTotal: number;
  surplusSessions: number;
  sameYear: boolean;
  fmt: (value: number) => string;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? openings : openings.slice(0, MAX_DIFFERENCE_ROWS);
  const count = (n: number, none: string) =>
    n === 0 ? none : `En ${n} ${n === 1 ? "apertura" : "aperturas"}`;
  return (
    <div className="mt-4 border-t border-border pt-4">
      <p className="text-sm font-semibold text-foreground">
        Diferencias al abrir la caja
      </p>
      <p className="mb-2 mt-1 text-xs text-muted-foreground">
        Lo que había al abrir no coincidió con lo que quedó en el corte
        anterior.
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <CashMetric
          label="Faltantes al abrir"
          value={fmt(shortageTotal)}
          hint={count(shortageSessions, "Ninguna apertura con faltante")}
        />
        <CashMetric
          label="Sobrantes al abrir"
          value={fmt(surplusTotal)}
          hint={count(surplusSessions, "Ninguna apertura con sobrante")}
        />
      </div>
      <ul className="mt-3 divide-y divide-border rounded-lg border border-border">
        {visible.map((opening) => {
          const short = opening.difference < 0;
          const details = [
            opening.opened_by_name && `Abrió ${opening.opened_by_name}`,
            opening.note,
          ].filter(Boolean);
          return (
            <li key={opening.session_id}>
              <Link
                className="flex min-h-11 items-start justify-between gap-3 px-3 py-2 hover:bg-muted/40"
                to={cashHistoryPath(opening.date, opening.drawer_id)}
              >
                <span className="min-w-0">
                  <span className="block text-sm font-medium text-foreground">
                    {sameYear
                      ? fmtDayMonth(opening.date)
                      : fmtDate(opening.date)}
                    {opening.drawer_name && ` · ${opening.drawer_name}`}
                  </span>
                  {details.length > 0 && (
                    <span className="block break-words text-xs text-muted-foreground">
                      {details.join(" · ")}
                    </span>
                  )}
                </span>
                <span
                  className={`shrink-0 text-sm font-semibold tabular ${short ? "text-destructive" : "text-foreground"}`}
                >
                  {short ? "Faltan" : "Sobran"}{" "}
                  {fmt(Math.abs(opening.difference))}
                </span>
              </Link>
            </li>
          );
        })}
      </ul>
      {openings.length > MAX_DIFFERENCE_ROWS && (
        <button
          type="button"
          className="mt-1 min-h-11 text-xs font-medium text-primary hover:underline"
          onClick={() => setExpanded((value) => !value)}
        >
          {expanded ? "Ver menos" : `Ver las ${openings.length} aperturas`}
        </button>
      )}
    </div>
  );
}

function CoverageIssueList({
  issues,
  sameYear,
  className,
}: {
  issues: CoverageIssue[];
  sameYear: boolean;
  className?: string;
}) {
  return (
    <ul className={`list-disc space-y-0.5 pl-4 text-xs ${className ?? ""}`}>
      {issues.map(({ text, dates }) => {
        const linked = dates?.slice(0, MAX_LINKED_DATES) ?? [];
        const rest = (dates?.length ?? 0) - linked.length;
        return (
          <li key={text}>
            {text}
            {linked.length > 0 && (
              <>
                {": "}
                {linked.map((date, index) => (
                  <span key={date}>
                    {index > 0 && ", "}
                    <Link
                      className="py-1 font-medium underline"
                      to={cashHistoryPath(date)}
                      aria-label={`Ver caja del ${fmtDate(date)}`}
                    >
                      {sameYear ? fmtDayMonth(date) : fmtDate(date)}
                    </Link>
                  </span>
                ))}
                {rest > 0 && ` y ${rest} más`}
              </>
            )}
          </li>
        );
      })}
    </ul>
  );
}
function cashDifferenceLabel(value: number | null | undefined) {
  if (value == null) return "Sin diferencia calculada";
  if (Math.abs(value) < 0.01) return "Cuadra";
  return value < 0 ? "Faltante" : "Sobrante";
}
export function CashPeriodReport({ data }: { data: ReportsRangeData }) {
  const cash = data.cash_reconciliation;
  const money = useMoneyVisibility();
  const fmtMoneyKpi = (value: number) => money.fmt(value);
  const moneyOrUnavailable = (value: number | null | undefined) =>
    value == null ? "No disponible" : fmtMoneyKpi(value);
  const canonical =
    cash?.period_activity != null || cash?.cash_activity != null;

  if (!canonical) {
    const closedCash = normalizeReportMetric(data.totals.cash_from_closes);
    const countedCloses = cash?.counted_closes ?? 0;
    const totalCloses = cash?.total_closes ?? 0;
    // El contrato legacy SUMABA conteos. Sólo cuando existe exactamente un
    // corte esa magnitud también representa un saldo físico interpretable.
    const singleCount =
      totalCloses === 1 && countedCloses === 1 && cash?.counted != null
        ? cash.counted
        : null;
    const singleDifference =
      totalCloses === 1 && countedCloses === 1 && cash?.difference != null
        ? cash.difference
        : null;
    return (
      <SectionCard
        title={"Caja del período"}
        description="Efectivo de recepción."
        action={<Badge variant="warning">Datos parciales</Badge>}
      >
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <CashMetric
            label="Movimiento en cortes cerrados"
            value={moneyOrUnavailable(closedCash?.value)}
            hint="No incluye días sin corte cerrado"
          />
          <CashMetric label="Efectivo retirado" value="No disponible" />
          <CashMetric
            label={"Último conteo de efectivo"}
            value={
              singleCount == null ? "No disponible" : fmtMoneyKpi(singleCount)
            }
            hint={
              totalCloses > 1
                ? "Los cortes anteriores no permiten calcular el saldo"
                : totalCloses > 0
                  ? `${countedCloses} de ${totalCloses} cortes con conteo`
                  : "Sin cortes cerrados"
            }
          />
          <CashMetric
            label={"Diferencia del último conteo"}
            value={
              singleDifference == null
                ? "No disponible"
                : fmtMoneyKpi(singleDifference)
            }
            hint={
              singleDifference == null
                ? "Falta un corte contado"
                : cashDifferenceLabel(singleDifference)
            }
          />
        </div>
        <Alert variant="warning" className="mt-4">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Faltan datos de caja</AlertTitle>
          <AlertDescription>
            Actualiza Tinta para incluir los movimientos posteriores al último
            corte.
          </AlertDescription>
        </Alert>
      </SectionCard>
    );
  }

  const latestStatus = cash?.latest_status;
  const reconciledSessions =
    cash?.reconciled_sessions ?? cash?.counted_closes ?? 0;
  const totalSessions =
    cash?.active_sessions ?? cash?.total_sessions ?? cash?.total_closes ?? 0;
  const status: CashStatus =
    cash?.latest_needs_recount || latestStatus === "stale"
      ? "stale"
      : cash?.status
        ? cash.status
        : cash?.complete ||
            (totalSessions > 0 &&
              reconciledSessions === totalSessions &&
              (latestStatus === "reconciled" || latestStatus === "withdrawn"))
          ? "complete"
          : "incomplete";
  const complete = status === "complete";
  const requiresAttention =
    status === "stale" || (cash?.requires_attention ?? !complete);
  const staleSessions = cash?.stale_sessions ?? (status === "stale" ? 1 : 0);
  const openSessions = cash?.open_sessions ?? (latestStatus === "open" ? 1 : 0);
  const unverifiedSessions =
    cash?.closed_unverified_sessions ??
    (latestStatus === "closed_unverified" ? 1 : 0);
  const withdrawnSessions =
    cash?.withdrawn_sessions ?? (latestStatus === "withdrawn" ? 1 : 0);
  const reviewedSessions = cash?.reviewed_sessions ?? 0;
  const uncoveredActivityDays = cash?.uncovered_activity_days ?? 0;
  const uncoveredActivityDates = cash?.uncovered_activity_dates ?? [];
  const sameYear = data.from.slice(0, 4) === data.to.slice(0, 4);
  const missingActiveDays = cash?.missing_active_days ?? 0;
  const unknownOpeningSessions = cash?.unknown_opening_sessions ?? 0;
  const adjustedAfterWithdrawalSessions =
    cash?.adjusted_after_withdrawal_sessions ?? 0;
  const legacyCashSourceUnverified =
    cash?.legacy_cash_source_unverified_count ?? 0;
  const activity = cash?.period_activity ?? cash?.cash_activity;
  const withdrawn = cash?.period_withdrawn ?? cash?.withdrawn;
  const difference =
    status === "stale" ? null : (cash?.latest_difference ?? cash?.difference);
  const badge =
    status === "stale"
      ? { variant: "warning" as const, label: "Volver a contar" }
      : complete
        ? { variant: "success" as const, label: "Caja revisada" }
        : { variant: "warning" as const, label: "Por completar" };
  const plural = (n: number, one: string, many: string) =>
    `${n} ${n === 1 ? one : many}`;
  // Lo primero que el dueño quiere saber es qué días no tienen corte; el
  // resto son pasos pendientes dichos como acciones, no como estados.
  const coverageIssues: CoverageIssue[] = (
    [
      uncoveredActivityDays > 0
        ? {
            text: `${plural(uncoveredActivityDays, "día", "días")} sin corte terminado`,
            dates: uncoveredActivityDates,
          }
        : missingActiveDays > 0
          ? `${plural(missingActiveDays, "día", "días")} sin abrir la caja`
          : null,
      openSessions > 0
        ? openSessions === 1
          ? "1 caja sigue abierta"
          : `${openSessions} cajas siguen abiertas`
        : null,
      unverifiedSessions > 0
        ? `${plural(unverifiedSessions, "corte se cerró", "cortes se cerraron")} sin contar el efectivo`
        : null,
      unknownOpeningSessions > 0
        ? `En ${plural(unknownOpeningSessions, "corte", "cortes")} no se anotó con cuánto efectivo se empezó`
        : null,
      adjustedAfterWithdrawalSessions > 0
        ? `${plural(adjustedAfterWithdrawalSessions, "corte cambió", "cortes cambiaron")} después de retirar el efectivo`
        : null,
      legacyCashSourceUnverified > 0
        ? `${plural(legacyCashSourceUnverified, "gasto antiguo", "gastos antiguos")}: falta decir si ${legacyCashSourceUnverified === 1 ? "se pagó" : "se pagaron"} con efectivo de la caja`
        : null,
      staleSessions > 0
        ? `Hay que volver a contar ${plural(staleSessions, "corte", "cortes")}`
        : null,
    ] as (string | CoverageIssue | null)[]
  )
    .filter((issue): issue is string | CoverageIssue => issue !== null)
    .map((issue) => (typeof issue === "string" ? { text: issue } : issue));
  const cameOut = activity != null && activity < 0;
  // El retiro puede superar lo que entró porque incluye el efectivo inicial.
  const withdrewOpeningCash =
    withdrawn != null && activity != null && withdrawn > Math.max(activity, 0);
  const sessionStates = [
    totalSessions > 0 &&
      plural(totalSessions, "corte en el período", "cortes en el período"),
    reconciledSessions > 0 && plural(reconciledSessions, "contado", "contados"),
    withdrawnSessions > 0 &&
      plural(withdrawnSessions, "con retiro", "con retiro"),
    openSessions > 0 && plural(openSessions, "abierto", "abiertos"),
    unverifiedSessions > 0 &&
      plural(unverifiedSessions, "cerrado sin contar", "cerrados sin contar"),
    reviewedSessions > 0 &&
      plural(
        reviewedSessions,
        "cerrado por el dueño sin conteo",
        "cerrados por el dueño sin conteo",
      ),
    staleSessions > 0 &&
      plural(staleSessions, "por volver a contar", "por volver a contar"),
  ].filter((state): state is string => !!state);
  const hasLatest =
    cash?.latest_counted != null || cash?.latest_expected != null;

  return (
    <SectionCard
      title={"Caja del período"}
      description="Cuánto efectivo entró, cuánto se retiró y si faltó o sobró."
      action={
        requiresAttention || (complete && totalSessions > 0) ? (
          <Badge variant={badge.variant}>{badge.label}</Badge>
        ) : undefined
      }
    >
      <div className="grid gap-3 sm:grid-cols-2">
        <CashMetric
          label={cameOut ? "Salió de la caja" : "Entró a la caja"}
          value={moneyOrUnavailable(
            activity == null ? activity : Math.abs(activity),
          )}
          hint={
            cash?.active_days === 0
              ? "Sin movimientos de efectivo"
              : cameOut
                ? "Se pagó más de la caja de lo que se cobró en efectivo"
                : "Cobros en efectivo, menos gastos y devoluciones pagados de la caja"
          }
        />
        <CashMetric
          label={"Se retiró de la caja"}
          value={moneyOrUnavailable(withdrawn)}
          hint={
            withdrawnSessions === 0
              ? "Sin retiros registrados"
              : `En ${plural(withdrawnSessions, "retiro", "retiros")}${withdrewOpeningCash ? " · incluye efectivo que ya estaba al abrir" : ""}`
          }
        />
      </div>

      {cash?.difference_sessions != null &&
        (cash.difference_sessions.length > 0 ||
          (cash.counted_closes ?? 0) > 0) && (
          <CashDifferenceSummary
            sessions={cash.difference_sessions}
            shortageTotal={cash.shortage_total ?? 0}
            shortageSessions={cash.shortage_sessions ?? 0}
            surplusTotal={cash.surplus_total ?? 0}
            surplusSessions={cash.surplus_sessions ?? 0}
            sameYear={sameYear}
            fmt={fmtMoneyKpi}
          />
        )}

      {(cash?.opening_differences?.length ?? 0) > 0 && (
        <CashOpeningDifferenceSummary
          openings={cash!.opening_differences!}
          shortageTotal={cash!.opening_shortage_total ?? 0}
          shortageSessions={cash!.opening_shortage_sessions ?? 0}
          surplusTotal={cash!.opening_surplus_total ?? 0}
          surplusSessions={cash!.opening_surplus_sessions ?? 0}
          sameYear={sameYear}
          fmt={fmtMoneyKpi}
        />
      )}

      {reviewedSessions > 0 && !requiresAttention && (
        <p className="mt-3 text-xs text-muted-foreground">
          {reviewedSessions === 1
            ? "Un corte se cerró sin conteo, con nota del dueño."
            : `${reviewedSessions} cortes se cerraron sin conteo, con nota del dueño.`}{" "}
          Por eso el período no aparece como caja revisada.
        </p>
      )}

      {status === "stale" || (staleSessions ?? 0) > 0 ? (
        <Alert variant="warning" className="mt-4">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Hubo movimientos después de un corte</AlertTitle>
          <AlertDescription>
            <p>Vuelve a contar el efectivo y actualiza el corte.</p>
            {coverageIssues.length > 0 && (
              <CoverageIssueList
                issues={coverageIssues}
                sameYear={sameYear}
                className="mt-1"
              />
            )}
          </AlertDescription>
        </Alert>
      ) : requiresAttention ? (
        <Alert variant="warning" className="mt-4">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Falta completar la caja</AlertTitle>
          <AlertDescription>
            {coverageIssues.length > 0 ? (
              <CoverageIssueList issues={coverageIssues} sameYear={sameYear} />
            ) : (
              "Hay cortes del período sin terminar."
            )}
            {legacyCashSourceUnverified > 0 && (
              <Link
                className="mt-2 inline-block text-xs font-medium underline"
                to={`/expenses?view=movements&from=${data.from}&to=${data.to}`}
              >
                Confirmar origen de gastos
              </Link>
            )}
          </AlertDescription>
        </Alert>
      ) : null}

      {(hasLatest || sessionStates.length > 0) && (
        // Los estados de cada corte y el último conteo quedan a un clic: el
        // último conteo es un saldo puntual y no habla del período completo.
        <details className="mt-4 border-t border-border pt-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-sm font-medium text-primary">
            Detalle de los cortes
          </summary>
          {hasLatest && (
            <>
              <p className="mb-2 mt-2 text-sm font-semibold text-foreground">
                Último corte
              </p>
              <div className="grid gap-3 sm:grid-cols-3">
                <CashMetric
                  label="Debía haber"
                  value={
                    cash?.latest_expected == null
                      ? "Sin calcular"
                      : fmtMoneyKpi(cash.latest_expected)
                  }
                  hint="Efectivo inicial más entradas, menos salidas"
                />
                <CashMetric
                  label="Se contó"
                  value={
                    cash?.latest_counted == null
                      ? "Sin conteo"
                      : fmtMoneyKpi(cash.latest_counted)
                  }
                  hint={
                    cash?.latest_counted_at
                      ? `Contado ${fmtDateTime(cash.latest_counted_at)}`
                      : undefined
                  }
                />
                <CashMetric
                  label="Diferencia del último corte"
                  value={
                    difference == null
                      ? "No disponible"
                      : fmtMoneyKpi(difference)
                  }
                  hint={
                    difference == null
                      ? status === "stale"
                        ? "Hubo movimientos después de contar"
                        : "Falta contar el efectivo"
                      : cashDifferenceLabel(difference)
                  }
                />
              </div>
            </>
          )}
          {sessionStates.length > 0 && (
            <p className="mt-3 text-xs text-muted-foreground">
              {sessionStates.join(" · ")}
            </p>
          )}
        </details>
      )}
    </SectionCard>
  );
}

function CashMetric({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="rounded-lg border border-border bg-muted/20 p-4">
      <p className="text-xs font-medium text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 font-display text-2xl tabular text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
