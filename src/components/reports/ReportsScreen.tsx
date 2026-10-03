import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import {
  Download,
  FileSpreadsheet,
  FileText,
  Loader2,
  Lock,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useAuthStore } from "@/stores/useAuthStore";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";
import {
  fetchExport,
  useReportsRange,
  type ExportFormat,
  type ReportsRangeData,
} from "@/hooks/useReports";
import { PeriodBar } from "./PeriodBar";
import { ReportContent, ReportLink, type ReportPaths } from "./ReportContent";
import { CashPeriodReport } from "./CashPeriodReport";
import { ProductAnalysis } from "./ProductAnalysis";
import {
  readReportRange,
  writeReportRange,
  REPORT_VIEWS,
} from "@/lib/report-period";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";

export type SaveReport = (blob: Blob, filename: string) => Promise<boolean>;

export function ReportSections({
  view,
  onChange,
}: {
  view: string;
  onChange(view: string): void;
}) {
  return (
    <div
      role="group"
      aria-label="Tipo de reporte"
      className="flex gap-1 border-b"
    >
      {REPORT_VIEWS.map((item) => (
        <button
          type="button"
          key={item.value}
          aria-pressed={view === item.value}
          onClick={() => onChange(item.value)}
          className={cn(
            "min-h-11 flex-1 border-b-2 px-3 text-sm font-medium sm:flex-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
            view === item.value
              ? "border-primary text-primary"
              : "border-transparent text-muted-foreground hover:text-foreground",
          )}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

export function ReportsScreen({
  paths,
  saveFile,
  mode = "report",
  freshness,
  syncPending,
}: {
  paths: ReportPaths;
  saveFile: SaveReport;
  mode?: "report" | "cash" | "analysis";
  freshness?: string;
  syncPending?: boolean;
}) {
  const [params, setParams] = useSearchParams();
  const { range, error } = readReportRange(params);
  const view =
    REPORT_VIEWS.find((item) => item.value === params.get("view"))?.value ??
    "money";
  const isPlus = canAccessPlusFeatures(
    useAuthStore((state) => state.gym?.subscription_plan),
  );
  const locked = mode === "analysis" && !isPlus;
  const query = useReportsRange(
    range.period,
    range.from,
    range.to,
    !error && !locked,
  );
  const data = query.data;
  const cashPath = paths.cash.startsWith("/cash") ? "/cash" : "/reports/cash-close";
  const backToCash = mode === "cash" && params.get("return_to") === "cash";
  const reportSearch = new URLSearchParams(params);
  if (mode !== "analysis") reportSearch.delete("view");
  reportSearch.delete("return_to");
  const analysisSearch = new URLSearchParams(reportSearch);
  analysisSearch.set("view", "products");
  return (
    <div className="mx-auto max-w-6xl space-y-5 p-4 pb-24 sm:p-6">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold tracking-tight sm:text-3xl">
          {mode === "cash"
            ? "Caja del período"
            : mode === "analysis"
              ? "Análisis de productos"
              : "Reportes"}
        </h1>
        <div className="flex items-center gap-2">
          {mode === "report" && view === "products" && (
            <Button asChild variant="outline">
              <Link
                to={`${paths.analysis}${paths.analysis.includes("?") ? "&" : "?"}${analysisSearch}`}
              >
                Análisis{" "}
                {!isPlus && (
                  <Lock
                    aria-label="Requiere Plus"
                    className="ml-1 h-3.5 w-3.5"
                  />
                )}
              </Link>
            </Button>
          )}
          {mode !== "report" && (
            <Button asChild variant="outline">
              <Link to={backToCash ? cashPath : `/reports?${reportSearch}`}>
                {backToCash ? "Volver a caja" : "Volver a reportes"}
              </Link>
            </Button>
          )}
          {mode === "report" && (
            <ReportDownload
              data={data}
              disabled={!!error || query.isError || query.isFetching}
              saveFile={saveFile}
            />
          )}
        </div>
      </header>
      {mode === "cash" && <p className="text-sm text-muted-foreground">Todas las cajas del gimnasio</p>}
      {locked ? (
        <PlusNotice description="Consulta la ganancia y el margen de tus productos." />
      ) : (
        <>
          <PeriodBar
            value={range}
            onChange={(next) => setParams(writeReportRange(params, next))}
          />
          {mode === "report" && (
            <ReportSections
              view={view}
              onChange={(next) => {
                const p = new URLSearchParams(params);
                p.set("view", next);
                setParams(p);
              }}
            />
          )}
          {error ? (
            <Alert variant="destructive">
              <AlertDescription>
                {error}{" "}
                <Button
                  variant="link"
                  onClick={() =>
                    setParams(writeReportRange(params, { period: "month" }))
                  }
                >
                  Ver este mes
                </Button>
              </AlertDescription>
            </Alert>
          ) : (
            <>
              {query.isError && (
                <Alert variant="destructive">
                  <AlertDescription>
                    No pudimos cargar el reporte.{" "}
                    {data && "Se muestran los últimos datos cargados."}{" "}
                    <Button
                      variant="link"
                      disabled={query.isFetching}
                      onClick={() => query.refetch()}
                    >
                      Reintentar
                    </Button>
                  </AlertDescription>
                </Alert>
              )}
              {query.isLoading && !data && (
                <div
                  role="status"
                  className="flex items-center justify-center gap-2 py-16 text-sm"
                >
                  <Loader2 className="h-5 w-5 animate-spin" />
                  Cargando reporte…
                </div>
              )}
              {data && (
                <>
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                    <p>
                      {fmtDate(data.from)} — {fmtDate(data.to)}
                    </p>
                    {query.isFetching && (
                      <span role="status">Actualizando…</span>
                    )}
                  </div>
                  {(syncPending || data.sync_pending) && (
                    <p role="status" className="text-sm text-muted-foreground">
                      Hay cambios pendientes de sincronizar.
                    </p>
                  )}
                  {mode === "cash" ? (
                    <CashPeriodReport data={data} />
                  ) : mode === "analysis" ? (
                    <ProductAnalysis data={data} />
                  ) : (
                    <ReportContent data={data} view={view} paths={paths} />
                  )}
                  {mode === "cash" && (
                    <ReportLink
                      to={
                        paths.cash.startsWith("/cash")
                          ? "/cash"
                          : "/reports/cash-close"
                      }
                    >
                      Abrir caja actual
                    </ReportLink>
                  )}
                  {freshness && (
                    <p className="text-xs text-muted-foreground">{freshness}</p>
                  )}
                </>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}

export function PlusNotice({
  description = "Consulta permanencia, proyecciones y ganancia de productos.",
}: {
  description?: string;
}) {
  return (
    <section className="rounded-xl border bg-card p-6">
      <h2 className="flex items-center gap-2 text-lg font-semibold">
        <Lock className="h-5 w-5" />
        Análisis disponible en Plus
      </h2>
      <p className="mt-2 text-sm text-muted-foreground">{description}</p>
      <Button asChild className="mt-4">
        <Link to="/settings/subscription">Ver plan Plus</Link>
      </Button>
    </section>
  );
}

function ReportDownload({
  data,
  disabled,
  saveFile,
}: {
  data?: ReportsRangeData;
  disabled: boolean;
  saveFile: SaveReport;
}) {
  const isPlus = canAccessPlusFeatures(
    useAuthStore((state) => state.gym?.subscription_plan),
  );
  const [exporting, setExporting] = useState(false);
  async function download(format: ExportFormat) {
    if (!data || !isPlus) return;
    setExporting(true);
    try {
      // Freeze the dates shown on screen, including across midnight.
      const res = await fetchExport("period_summary", format, {
        period: data.period,
        from: data.from,
        to: data.to,
      });
      if (
        await saveFile(
          res.blob,
          res.filename ?? `reporte-${data.from}_${data.to}.${format}`,
        )
      )
        toast.success("Descarga lista.");
    } catch {
      toast.error("No pudimos preparar el archivo.");
    } finally {
      setExporting(false);
    }
  }
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" disabled={disabled || !data || exporting}>
          {exporting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Download className="h-4 w-4" />
          )}
          <span className="ml-2">
            {exporting ? "Preparando…" : "Descargar"}
          </span>
          {!isPlus && <Lock className="ml-2 h-3.5 w-3.5" />}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end">
        <DropdownMenuLabel>
          Reporte completo ·{" "}
          {data ? `${fmtDate(data.from)} — ${fmtDate(data.to)}` : ""}
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isPlus ? (
          <>
            <DropdownMenuItem
              className="min-h-11"
              onSelect={() => void download("pdf")}
            >
              <FileText className="mr-2 h-4 w-4" />
              PDF
            </DropdownMenuItem>
            <DropdownMenuItem
              className="min-h-11"
              onSelect={() => void download("xlsx")}
            >
              <FileSpreadsheet className="mr-2 h-4 w-4" />
              Excel
            </DropdownMenuItem>
          </>
        ) : (
          <DropdownMenuItem asChild>
            <Link to="/settings/subscription">
              Descargas disponibles en Plus
            </Link>
          </DropdownMenuItem>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
