import { normalizeReportMetric } from "@/lib/report-summary";
import { Link } from "react-router-dom";
import { CircleAlert } from "lucide-react";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import { SectionCard } from "@/components/shared/PagePrimitives";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import type { ReportsRangeData } from "@/hooks/useReports";
import { fmtDateTime } from "@/lib/dates";

type CashStatus = "complete" | "incomplete" | "stale";
function cashDifferenceLabel(value: number | null | undefined) {
  if (value == null) return "Sin diferencia calculada";
  if (Math.abs(value) < 0.01) return "Cuadra";
  return value < 0 ? "Faltante" : "Sobrante";
}
export function CashPeriodReport({ data }: { data: ReportsRangeData }) {
  const cash = data.cash_reconciliation;
  const money = useMoneyVisibility();
  const fmtMoneyKpi = (value: number) => money.fmt(value).replace(/\.00$/, "");
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
                ? "Falta una conciliación individual vigente"
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
  const uncoveredActivityDays = cash?.uncovered_activity_days ?? 0;
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
      ? { variant: "warning" as const, label: "Cortes desactualizados" }
      : complete
        ? { variant: "success" as const, label: "Caja revisada" }
        : { variant: "warning" as const, label: "Cortes por revisar" };
  const coverageIssues = [
    uncoveredActivityDays > 0
      ? `${uncoveredActivityDays} ${uncoveredActivityDays === 1 ? "día tiene" : "días tienen"} movimientos sin un corte revisado`
      : missingActiveDays > 0
        ? `${missingActiveDays} ${missingActiveDays === 1 ? "día no tiene" : "días no tienen"} apertura de caja`
        : null,
    openSessions > 0
      ? `${openSessions} ${openSessions === 1 ? "caja sigue abierta" : "cajas siguen abiertas"}`
      : null,
    unverifiedSessions > 0
      ? `${unverifiedSessions} ${unverifiedSessions === 1 ? "corte no tiene" : "cortes no tienen"} conteo de efectivo`
      : null,
    unknownOpeningSessions > 0
      ? `${unknownOpeningSessions} ${unknownOpeningSessions === 1 ? "apertura no confirma" : "aperturas no confirman"} el efectivo inicial`
      : null,
    adjustedAfterWithdrawalSessions > 0
      ? `${adjustedAfterWithdrawalSessions} ${adjustedAfterWithdrawalSessions === 1 ? "corte cambió" : "cortes cambiaron"} después del retiro`
      : null,
    legacyCashSourceUnverified > 0
      ? `${legacyCashSourceUnverified} ${legacyCashSourceUnverified === 1 ? "gasto antiguo requiere" : "gastos antiguos requieren"} confirmar si se pagó con efectivo de caja o dinero fuera de caja`
      : null,
    staleSessions > 0
      ? `${staleSessions} ${staleSessions === 1 ? "corte requiere" : "cortes requieren"} volver a contar`
      : null,
  ].filter((issue): issue is string => issue !== null);

  return (
    <SectionCard
      title={"Caja del período"}
      description="Entradas, salidas y cortes del período."
      action={
        requiresAttention || (complete && totalSessions > 0) ? (
          <Badge variant={badge.variant}>{badge.label}</Badge>
        ) : undefined
      }
    >
      <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        En el período
      </p>
      <div className="grid gap-3 sm:grid-cols-2">
        <CashMetric
          label={"Movimiento neto de efectivo"}
          value={moneyOrUnavailable(activity)}
          hint={
            cash?.active_days == null
              ? "Cobertura de días no informada"
              : cash.active_days === 0
                ? "Sin movimientos de efectivo"
                : `${cash.active_days} ${cash.active_days === 1 ? "día con movimientos de caja" : "días con movimientos de caja"}`
          }
        />
        <CashMetric
          label={"Efectivo retirado"}
          value={moneyOrUnavailable(withdrawn)}
          hint={
            withdrawnSessions == null
              ? "Cobertura de retiros no informada"
              : withdrawnSessions === 0
                ? "Sin retiros registrados"
                : `${withdrawnSessions} ${withdrawnSessions === 1 ? "retiro" : "retiros"} · puede incluir efectivo que ya estaba al abrir`
          }
        />
      </div>
      {(cash?.latest_counted != null || cash?.latest_expected != null) && (
        <>
          <p className="mb-2 mt-4 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Último corte
          </p>
          <div className="grid gap-3 sm:grid-cols-3">
            <CashMetric
              label="Efectivo esperado"
              value={
                cash?.latest_expected == null
                  ? "Sin conciliación"
                  : fmtMoneyKpi(cash.latest_expected)
              }
              hint="Efectivo inicial más entradas, menos salidas"
            />
            <CashMetric
              label={"Último conteo de efectivo"}
              value={
                cash?.latest_counted == null
                  ? "Sin conteo"
                  : fmtMoneyKpi(cash.latest_counted)
              }
              hint={
                cash?.latest_counted_at
                  ? `Contado ${fmtDateTime(cash.latest_counted_at)}`
                  : "Último conteo vigente del período"
              }
            />
            <CashMetric
              label={"Diferencia del último conteo"}
              value={
                difference == null ? "No disponible" : fmtMoneyKpi(difference)
              }
              hint={
                difference == null
                  ? status === "stale"
                    ? "Se invalidó por actividad posterior"
                    : "Falta un conteo vigente"
                  : `${cashDifferenceLabel(difference)} · esperado y contado de la misma sesión`
              }
            />
          </div>
        </>
      )}

      {totalSessions > 0 && (
        <div className="mt-4 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
          {totalSessions != null && (
            <span>
              {totalSessions} {totalSessions === 1 ? "sesión" : "sesiones"} del
              período
            </span>
          )}
          {reconciledSessions != null && (
            <span>
              {reconciledSessions}{" "}
              {reconciledSessions === 1 ? "corte revisado" : "cortes revisados"}
            </span>
          )}
          {withdrawnSessions != null && (
            <span>
              {withdrawnSessions}{" "}
              {withdrawnSessions === 1 ? "retirada" : "retiradas"}
            </span>
          )}
          {(openSessions ?? 0) > 0 && <span>{openSessions} abiertas</span>}
          {(unverifiedSessions ?? 0) > 0 && (
            <span>{unverifiedSessions} cerradas sin conteo</span>
          )}
          {(staleSessions ?? 0) > 0 && (
            <span>{staleSessions} desactualizadas</span>
          )}
        </div>
      )}

      {status === "stale" || (staleSessions ?? 0) > 0 ? (
        <Alert variant="warning" className="mt-4">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Hubo actividad después de un corte</AlertTitle>
          <AlertDescription>
            <p>Vuelve a contar el efectivo y actualiza el corte.</p>
            {coverageIssues.length > 0 && (
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-xs">
                {coverageIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            )}
          </AlertDescription>
        </Alert>
      ) : requiresAttention ? (
        <Alert variant="warning" className="mt-4">
          <CircleAlert className="h-4 w-4" />
          <AlertTitle>Falta completar la caja</AlertTitle>
          <AlertDescription>
            {coverageIssues.length > 0 ? (
              <ul className="list-disc space-y-0.5 pl-4 text-xs">
                {coverageIssues.map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            ) : (
              "Hay sesiones del período pendientes de conciliar."
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
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular text-foreground">{value}</p>
      {hint && <p className="mt-1 text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
