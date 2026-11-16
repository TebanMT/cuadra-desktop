import { PageContainer } from "@/components/shared/PagePrimitives";
import { useCanWrite, READ_ONLY_MESSAGE } from "@/lib/writeAccess";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Upload,
  FileSpreadsheet,
  Download,
  AlertTriangle,
  CircleCheck,
  AlertCircle,
  Loader2,
  RefreshCw,
  XCircle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  PageHeader,
  SectionCard,
  DataTable,
  DataTableHead,
  DataTableTh,
  DataTableBody,
  DataTableRow,
  DataTableCell,
} from "@/components/shared/PagePrimitives";
import {
  useImportMembers,
  useMembersList,
  type ImportMembersResponse,
} from "@/hooks/useMembers";
import { useAuthStore } from "@/stores/useAuthStore";
import { ApiError } from "@/lib/api";
import { members as t } from "@/strings/members";
import {
  MEMBER_CSV_FIELDS, inferMemberColumns, mapMemberCSV, summarizeMemberImport,
  buildMembersCSVTemplate,
  normalizePhoneForCompare,
  parseCSVForPreview,
} from "./csvTemplate";

type Stage = "pick" | "preview" | "result";

const MAX_BYTES = 5 * 1024 * 1024;

// Cap razonable para el snapshot de phones del gym usado por la detección
// client-side de duplicados. El segmento target son gyms de 30-150 socios;
// 500 cubre 99% de casos sin paginación. Si un gym tiene más, el BE
// igual valida — el client-side es UX, no autoridad.
const DUP_SNAPSHOT_PAGE_SIZE = 500;

export default function MemberImportPage() {
  const canWrite = useCanWrite();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = role === "owner";

  const [stage, setStage] = useState<Stage>("pick");
  const [file, setFile] = useState<File | null>(null);
  const [sourceRows, setSourceRows] = useState<string[][]>([]);
  const [columns, setColumns] = useState<number[]>([]);
  const rawText = useMemo(() => mapMemberCSV(sourceRows, columns), [sourceRows, columns]);
  const parsed = useMemo(() => parseCSVForPreview(rawText), [rawText]);
  const selectedColumns = columns.filter(index => index >= 0);
  const mappingValid = columns[0] >= 0 && columns[1] >= 0 && new Set(selectedColumns).size === selectedColumns.length;
  const [pickError, setPickError] = useState<string | null>(null);
  const [allowDuplicates, setAllowDuplicates] = useState(false);
  const [result, setResult] = useState<ImportMembersResponse | null>(null);

  // Snapshot del padrón actual para detección client-side de duplicados.
  // No bloqueamos el upload si la lista no cargó: el BE valida igual.
  const membersList = useMembersList({
    page: 1,
    page_size: DUP_SNAPSHOT_PAGE_SIZE,
  });
  const existingPhones = useMemo<Set<string>>(() => {
    const s = new Set<string>();
    membersList.data?.items?.forEach((i) =>
      s.add(normalizePhoneForCompare(i.member.phone))
    );
    return s;
  }, [membersList.data]);

  const importMutation = useImportMembers();

  // Filas de datos parseadas (sin header). Validamos liviano para preview.
  const dataRows = useMemo(() => parsed.length > 1 ? parsed.slice(1) : [], [parsed]);
  const previewRows = dataRows.slice(0, 20);

  // Detección client-side de duplicados intra-base y intra-archivo. El BE
  // hace lo mismo de forma autoritativa; esto es para el preview.
  const dupAnalysis = useMemo(() => {
    const inBase: number[] = [];
    const inFile: number[] = [];
    const seen = new Set<string>();
    dataRows.forEach((row, idx) => {
      const phone = normalizePhoneForCompare(row[1] || "");
      if (!phone) return;
      if (seen.has(phone)) inFile.push(idx);
      else seen.add(phone);
      if (existingPhones.has(phone)) inBase.push(idx);
    });
    return { inBase, inFile };
  }, [dataRows, existingPhones]);

  function handleFileSelected(f: File | undefined | null) {
    setPickError(null);
    if (!f) return;
    if (f.size > MAX_BYTES) {
      setPickError(t.import.errors.fileTooLarge);
      return;
    }
    const looksCSV =
      f.name.toLowerCase().endsWith(".csv") ||
      (f.type || "").toLowerCase().includes("csv");
    if (!looksCSV) {
      setPickError(t.import.errors.notCSV);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const txt = String(reader.result || "");
      const rows = parseCSVForPreview(txt);
      setFile(f);
      setSourceRows(rows);
      setColumns(inferMemberColumns(rows[0] ?? []));
    };
    reader.onerror = () => setPickError(t.import.errors.generic);
    reader.readAsText(f, "UTF-8");
  }

  function handleDownloadTemplate() {
    // Prefijamos BOM para que Excel abra con tildes correctas al doble-click.
    const csv = "﻿" + buildMembersCSVTemplate();
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "plantilla-socios-tinta.csv";
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function handleSubmit() {
    if (!canWrite || !file || !mappingValid || importMutation.isPending) return;
    setResult(null);
    try {
      const res = await importMutation.mutateAsync({
        file: new File([rawText], file.name, { type: "text/csv" }),
        allow_duplicates: allowDuplicates,
      });
      setResult(res);
      setStage("result");
      if (res.summary.imported_count > 0) {
        toast.success(t.import.step3.summaryImported(res.summary.imported_count));
      }
    } catch (err) {
      if (err instanceof ApiError) {
        toast.error(err.message || t.import.errors.generic);
      } else {
        toast.error(t.import.errors.networkRetry);
      }
    }
  }

  function resetForAnother() {
    setStage("pick");
    setFile(null);
    setSourceRows([]);
    setColumns([]);
    setPickError(null);
    setAllowDuplicates(false);
    setResult(null);
  }

  // Operador (no-owner) ve un read-only con explicación + link al dueño.
  if (!isOwner || !canWrite) {
    return (
      <PageContainer contentWidth="form" className="space-y-6">
        <PageHeader
          title={t.import.title}
          subtitle={!canWrite ? READ_ONLY_MESSAGE : "Solo el dueño del gimnasio puede importar socios."}
          actions={
            <Button variant="outline" onClick={() => navigate("/members")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              {t.import.backToList}
            </Button>
          }
        />
        <Alert>
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            Esta acción modifica el padrón completo del gym. Pídele al dueño
            que entre con su cuenta para importar.
          </AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <PageContainer contentWidth="reading" className="space-y-6">
      <PageHeader
        title={t.import.title}
        subtitle={t.import.subtitle}
        actions={
          <Button variant="outline" onClick={() => navigate("/members")}>
            <ArrowLeft className="h-4 w-4 mr-2" />
            {t.import.backToList}
          </Button>
        }
      />

      <StepBar stage={stage} />

      {stage === "pick" && (
        <PickStep
          file={file}
          headers={sourceRows[0] ?? []} columns={columns} onColumns={setColumns} mappingValid={mappingValid}
          pickError={pickError}
          dataRowsCount={dataRows.length}
          onFile={handleFileSelected}
          onTemplate={handleDownloadTemplate}
          onContinue={() => setStage("preview")}
        />
      )}

      {stage === "preview" && (
        <PreviewStep
          dataRowsCount={dataRows.length}
          previewRows={previewRows}
          allRows={dataRows}
          dupInBase={dupAnalysis.inBase}
          dupInFile={dupAnalysis.inFile}
          allowDuplicates={allowDuplicates}
          onToggleAllow={setAllowDuplicates}
          onBack={() => setStage("pick")}
          onSubmit={handleSubmit}
          isLoading={importMutation.isPending}
        />
      )}

      {stage === "result" && result && (
        <ResultStep
          result={result}
          onImportAnother={resetForAnother}
          onGoToList={() => navigate("/members")}
        />
      )}
    </PageContainer>
  );
}

// ---------------------------------------------------------------------------
// Sub-componentes
// ---------------------------------------------------------------------------

function StepBar({ stage }: { stage: Stage }) {
  const steps: { key: Stage; label: string }[] = [
    { key: "pick", label: t.import.steps.one },
    { key: "preview", label: t.import.steps.two },
    { key: "result", label: t.import.steps.three },
  ];
  const order = (s: Stage) => steps.findIndex((x) => x.key === s);
  const cur = order(stage);
  return (
    <div className="flex items-center gap-2 text-sm">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2">
          <span
            className={
              i <= cur
                ? "text-foreground font-semibold"
                : "text-muted-foreground"
            }
          >
            {s.label}
          </span>
          {i < steps.length - 1 && (
            <span className="text-muted-foreground">›</span>
          )}
        </div>
      ))}
    </div>
  );
}

interface PickStepProps {
  file: File | null;
  headers: string[]; columns: number[]; onColumns(value: number[]): void; mappingValid: boolean;
  pickError: string | null;
  dataRowsCount: number;
  onFile(f: File | undefined | null): void;
  onTemplate(): void;
  onContinue(): void;
}

function PickStep({
  headers, columns, onColumns, mappingValid,
  file,
  pickError,
  dataRowsCount,
  onFile,
  onTemplate,
  onContinue,
}: PickStepProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [isDrag, setIsDrag] = useState(false);

  return (
    <div className="space-y-4">
      <SectionCard>
        <button
          type="button"
          onClick={() => inputRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDrag(true);
          }}
          onDragLeave={() => setIsDrag(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDrag(false);
            onFile(e.dataTransfer.files?.[0]);
          }}
          className={
            "w-full flex flex-col items-center justify-center gap-3 px-6 rounded-lg border-2 border-dashed transition-colors text-center " + (file ? "py-5 " : "py-10 ") +
            (isDrag
              ? "border-foreground bg-muted/40"
              : "border-border hover:border-foreground/40 hover:bg-muted/20")
          }
        >
          <div className="h-12 w-12 rounded-full bg-muted flex items-center justify-center text-muted-foreground">
            {file ? (
              <FileSpreadsheet className="h-6 w-6" />
            ) : (
              <Upload className="h-6 w-6" />
            )}
          </div>
          {file ? (
            <div className="space-y-1">
              <p className="text-base font-semibold">{file.name}</p>
              <p className="text-sm text-muted-foreground">
                {dataRowsCount} fila{dataRowsCount === 1 ? "" : "s"} encontradas
                · {Math.round(file.size / 1024)} KB
              </p>
              <p className="text-xs text-muted-foreground mt-2">
                {t.import.step1.changeFile}
              </p>
            </div>
          ) : (
            <div className="space-y-1">
              <p className="text-base font-semibold">
                {t.import.step1.dropZone}
              </p>
              <p className="text-sm text-muted-foreground">
                {t.import.step1.hint}
              </p>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => onFile(e.target.files?.[0])}
          />
        </button>

        {pickError && (
          <Alert variant="destructive" className="mt-4">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{pickError}</AlertDescription>
          </Alert>
        )}

        <div className="flex flex-wrap items-center justify-between gap-3 mt-5">
          <button
            type="button"
            onClick={onTemplate}
            className="inline-flex items-center gap-2 text-sm font-medium text-foreground hover:underline"
          >
            <Download className="h-4 w-4" />
            {t.import.step1.downloadTemplate}
          </button>
          <span className="text-xs text-muted-foreground">
            {t.import.step1.templateHint}
          </span>
        </div>
      </SectionCard>

      {file && <SectionCard title="Asociar columnas" description="Revisa qué columna del archivo corresponde a cada dato. Las columnas opcionales pueden quedar vacías.">
        <div className="grid gap-4 sm:grid-cols-2">{MEMBER_CSV_FIELDS.map((field, index) => <label key={field.key} className="space-y-1 text-sm">
          <span className="block font-medium">{field.label}</span>
          <select className="h-11 w-full rounded-md border bg-background px-3" value={columns[index] ?? -1} onChange={event => onColumns(columns.map((value, position) => position === index ? Number(event.target.value) : value))}>
            <option value={-1}>Sin columna</option>
            {headers.map((header, position) => <option key={position} value={position}>{header || `Columna ${position + 1}`}</option>)}
          </select>
        </label>)}</div>
        {!mappingValid && <p role="status" className="mt-3 text-sm text-warning">Asocia Nombre y Teléfono. Cada columna debe usarse una sola vez.</p>}
      </SectionCard>}

      <SectionCard
        title={t.import.step1.structure.title}
        description={t.import.step1.structure.intro}
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              {t.import.step1.structure.required}
            </p>
            <ul className="text-sm space-y-1">
              <li>Nombre completo</li>
              <li>Teléfono</li>
              <li>Correo (opcional)</li>
              <li>Nacimiento (opcional)</li>
              <li>Notas (opcional)</li>
            </ul>
          </div>
          <div>
            <p className="mb-2 text-sm font-medium text-muted-foreground">
              {t.import.step1.structure.optional}
            </p>
            <ul className="text-sm space-y-1">
              <li>Nombre del plan</li>
              <li>Fecha de inicio</li>
              <li>Fecha de vencimiento</li>
            </ul>
          </div>
        </div>
        <ul className="text-sm text-muted-foreground space-y-1.5 mt-5 list-disc pl-5">
          <li>{t.import.step1.structure.rules.phone}</li>
          <li>{t.import.step1.structure.rules.dates}</li>
          <li>{t.import.step1.structure.rules.membership}</li>
          <li>{t.import.step1.structure.rules.plan} <Link className="underline" to="/settings/membership-types">Abrir planes de membresía</Link></li>
        </ul>
      </SectionCard>

      <div className="flex justify-end">
        <Button
          disabled={!file || dataRowsCount === 0 || !mappingValid}
          onClick={onContinue}
        >
          {t.import.step1.continue}
        </Button>
      </div>
    </div>
  );
}

interface PreviewStepProps {
  dataRowsCount: number;
  previewRows: string[][];
  allRows: string[][];
  dupInBase: number[];
  dupInFile: number[];
  allowDuplicates: boolean;
  onToggleAllow(v: boolean): void;
  onBack(): void;
  onSubmit(): void;
  isLoading: boolean;
}

function PreviewStep({
  dataRowsCount,
  previewRows,
  allRows,
  dupInBase,
  dupInFile,
  allowDuplicates,
  onToggleAllow,
  onBack,
  onSubmit,
  isLoading,
}: PreviewStepProps) {
  const dupInBaseSet = useMemo(() => new Set(dupInBase), [dupInBase]);
  const dupInFileSet = useMemo(() => new Set(dupInFile), [dupInFile]);
  const duplicateRows = new Set([...dupInBase, ...dupInFile]);
  const totalDup = duplicateRows.size;
  const analysis = summarizeMemberImport(allRows, [...duplicateRows], allowDuplicates);
  const incompleteRows = analysis.incomplete.length;

  return (
    <div className="space-y-4">
      <SectionCard title={`${dataRowsCount} filas revisadas`}>
        <dl className="mb-4 grid gap-3 text-sm sm:grid-cols-3">
          <div><dt className="text-muted-foreground">Listas para validar</dt><dd className="text-xl font-semibold tabular-nums">{analysis.candidates}</dd></div>
          <div><dt className="text-muted-foreground">Duplicadas: se omitirán</dt><dd className="text-xl font-semibold tabular-nums">{analysis.skipped.length}</dd></div>
          <div><dt className="text-muted-foreground">Requieren corrección</dt><dd className="text-xl font-semibold tabular-nums">{incompleteRows}</dd></div>
        </dl>
        <p className="mb-3 text-sm text-muted-foreground">El servidor realizará la validación final antes de guardar. {allowDuplicates && "Permitir teléfonos repetidos está activado."}</p>
        {incompleteRows > 0 && <Alert variant="warning" className="mb-3"><AlertDescription>{incompleteRows} filas del archivo no tienen nombre o teléfono: {analysis.incomplete.map(index => index + 2).join(", ")}. Regresa al archivo para corregirlas antes de importar.</AlertDescription></Alert>}

        {totalDup > 0 && (
          <Alert className="mb-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              <p className="font-semibold">
                {t.import.step2.duplicatesTitle(totalDup)}
              </p>
              <p className="mt-1 text-sm">{t.import.step2.duplicatesHint}</p>
              <label className="inline-flex items-center gap-2 mt-3 text-sm font-medium cursor-pointer">
                <input
                  type="checkbox"
                  checked={allowDuplicates}
                  onChange={(e) => onToggleAllow(e.target.checked)}
                />
                {t.import.step2.allowDuplicates}
              </label>
            </AlertDescription>
          </Alert>
        )}
      </SectionCard>

      <SectionCard
        title={t.import.step2.previewTitle}
        flush
      >
        {previewRows.length === 0 ? (
          <p className="text-sm text-muted-foreground p-6">
            {t.import.step2.noPreview}
          </p>
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh className="w-16">
                {t.import.step2.cols.row}
              </DataTableTh>
              <DataTableTh>{t.import.step2.cols.name}</DataTableTh>
              <DataTableTh>{t.import.step2.cols.phone}</DataTableTh>
              <DataTableTh>{t.import.step2.cols.plan}</DataTableTh>
              <DataTableTh>{t.import.step2.cols.flag}</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {previewRows.map((row, idx) => {
                const flagInBase = dupInBaseSet.has(idx);
                const flagInFile = dupInFileSet.has(idx);
                return (
                  <DataTableRow key={idx}>
                    <DataTableCell className="text-muted-foreground tabular">
                      {idx + 2}
                    </DataTableCell>
                    <DataTableCell className="font-medium">
                      {row[0] || "—"}
                    </DataTableCell>
                    <DataTableCell className="tabular">{row[1] || "—"}</DataTableCell>
                    <DataTableCell className="text-muted-foreground">
                      {row[5] || "—"}
                    </DataTableCell>
                    <DataTableCell>
                      {flagInBase && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning-soft text-warning-foreground mr-1">
                          {t.import.step2.flags.duplicateInBase}
                        </span>
                      )}
                      {flagInFile && (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-warning-soft text-warning-foreground">
                          {t.import.step2.flags.duplicateInFile}
                        </span>
                      )}
                    </DataTableCell>
                  </DataTableRow>
                );
              })}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>

      <div className="flex justify-between">
        <Button variant="outline" onClick={onBack} disabled={isLoading}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          {t.import.step2.back}
        </Button>
        <Button onClick={onSubmit} disabled={isLoading || analysis.candidates === 0 || incompleteRows > 0}>
          {isLoading ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              {t.import.step2.ctaLoading}
            </>
          ) : (
            t.import.step2.cta(analysis.candidates)
          )}
        </Button>
      </div>
    </div>
  );
}

interface ResultStepProps {
  result: ImportMembersResponse;
  onImportAnother(): void;
  onGoToList(): void;
}

function ResultStep({ result, onImportAnother, onGoToList }: ResultStepProps) {
  const { summary } = result;
  const allOk =
    summary.imported_count > 0 &&
    summary.errors_count === 0 &&
    summary.skipped_count === 0;
  const nothing = summary.imported_count === 0;

  return (
    <div className="space-y-4">
      <SectionCard>
        <div className="flex items-start gap-4">
          <div
            className={
              "h-12 w-12 rounded-full flex items-center justify-center shrink-0 " +
              (allOk
                ? "bg-success-soft text-success-text"
                : nothing
                ? "bg-destructive-soft text-destructive-text"
                : "bg-warning-soft text-warning-foreground")
            }
          >
            {allOk ? (
              <CircleCheck className="h-6 w-6" />
            ) : nothing ? (
              <AlertCircle className="h-6 w-6" />
            ) : (
              <AlertTriangle className="h-6 w-6" />
            )}
          </div>
          <div className="flex-1">
            <h3 className="text-lg font-semibold">
              {allOk
                ? t.import.step3.headingOk
                : nothing
                ? t.import.step3.headingFail
                : t.import.step3.headingPartial}
            </h3>
            <div className="flex flex-wrap gap-4 mt-2 text-sm">
              <span className="inline-flex items-center gap-1.5 text-success-text font-medium tabular">
                <CircleCheck className="h-4 w-4" aria-hidden />
                {t.import.step3.summaryImported(summary.imported_count)}
              </span>
              {summary.skipped_count > 0 && (
                <span className="inline-flex items-center gap-1.5 text-warning font-medium tabular">
                  <AlertTriangle className="h-4 w-4" aria-hidden />
                  {t.import.step3.summarySkipped(summary.skipped_count)}
                </span>
              )}
              {summary.errors_count > 0 && (
                <span className="inline-flex items-center gap-1.5 text-destructive-text font-medium tabular">
                  <XCircle className="h-4 w-4" aria-hidden />
                  {t.import.step3.summaryErrors(summary.errors_count)}
                </span>
              )}
            </div>
          </div>
        </div>
      </SectionCard>

      {result.skipped.length > 0 && (
        <SectionCard title={t.import.step3.skippedTitle}>
          <ul className="text-sm space-y-1.5">
            {result.skipped.map((s) => (
              <li
                key={`skip-${s.row_number}`}
                className="flex items-baseline gap-3"
              >
                <span className="text-muted-foreground tabular w-16 shrink-0">
                  Fila {s.row_number}
                </span>
                <span className="font-medium">{s.full_name || "—"}</span>
                <span className="text-muted-foreground text-xs">
                  {humanSkipReason(s.reason)}
                </span>
              </li>
            ))}
          </ul>
        </SectionCard>
      )}

      {result.errors.length > 0 && (
        <SectionCard
          title={t.import.step3.errorsTitle}
          description={t.import.step3.errorsHint}
        >
          <details>
            <summary className="cursor-pointer text-sm text-foreground font-medium select-none">
              Ver {result.errors.length} fila
              {result.errors.length === 1 ? "" : "s"}
            </summary>
            <ul className="text-sm space-y-1.5 mt-3">
              {result.errors.map((e) => (
                <li
                  key={`err-${e.row_number}`}
                  className="flex items-baseline gap-3"
                >
                  <span className="text-muted-foreground tabular w-16 shrink-0">
                    Fila {e.row_number}
                  </span>
                  <span className="font-medium">{e.full_name || "—"}</span>
                  <span className="text-destructive-text text-xs">
                    {e.message}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        </SectionCard>
      )}

      <div className="flex justify-between">
        <Button variant="outline" onClick={onImportAnother}>
          <RefreshCw className="h-4 w-4 mr-2" />
          {t.import.step3.importMore}
        </Button>
        <Button onClick={onGoToList}>{t.import.step3.goToList}</Button>
      </div>
    </div>
  );
}

function humanSkipReason(reason: string): string {
  switch (reason) {
    case "phone_taken_in_gym":
      return "ya hay un socio con este teléfono en tu gimnasio";
    case "duplicate_in_file":
      return "este teléfono aparece más de una vez en el archivo";
    default:
      return reason;
  }
}
