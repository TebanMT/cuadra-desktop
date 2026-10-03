import { useState } from "react";
import { AlertTriangle } from "lucide-react";
import { Link } from "react-router-dom";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { financialIntegrityWarningLabel, missingCostTitle } from "@/strings/financialWarnings";
import { MissingPurchaseCostsDialog } from "./MissingPurchaseCostsDialog";

export function FinancialNotice({ count, warnings, incomplete, mismatch = false, from, to }: {
  count: number; warnings: string[]; incomplete: boolean; mismatch?: boolean; from: string; to: string;
}) {
  const [open, setOpen] = useState(false);
  const hasMissing = count > 0 || warnings.includes("legacy_inventory_purchase");
  const others = [...new Set(warnings)].filter(code => code !== "legacy_inventory_purchase");
  if (!incomplete && !hasMissing && !mismatch && others.length === 0) return null;
  return <>
    <Alert variant="warning">
      <AlertTriangle className="h-4 w-4" />
      <AlertDescription className="space-y-2">
        {mismatch && <p>El total no coincide con el desglose. Actualiza el reporte para volver a calcularlo.</p>}
        {hasMissing && <div className="flex flex-wrap items-center justify-between gap-3">
          <div><p className="font-medium">{missingCostTitle(count)}</p><p>{count === 1 ? "Su importe aún no se incluye en las salidas. El resultado es parcial." : "Sus importes aún no se incluyen en las salidas. El resultado es parcial."}</p></div>
          <Button size="sm" variant="outline" onClick={() => setOpen(true)}>Completar costos</Button>
        </div>}
        {others.map(code => <p key={code}>{financialIntegrityWarningLabel(code)}</p>)}
        {!hasMissing && others.length === 0 && !mismatch && <p>Faltan datos para calcular el resultado completo. Actualiza Tinta y vuelve a abrir el reporte.</p>}
        {others.some(code => !["unclassified_income", "legacy_refund", "unclassified_cash_out", "invalid_cash_in_classification"].includes(code)) && <Button size="sm" variant="link" className="px-0" asChild><Link to={`/expenses?view=movements&from=${from}&to=${to}`}>Ver gastos</Link></Button>}
        {others.some(code => ["unclassified_cash_out", "invalid_cash_in_classification"].includes(code)) && <Button size="sm" variant="link" className="px-0" asChild><Link to={`/reports/cash-close/movements?from=${from}&to=${to}`}>Revisar caja</Link></Button>}
        {others.some(code => ["unclassified_income", "legacy_refund"].includes(code)) && <Button size="sm" variant="link" className="px-0" asChild><Link to="/billing">Ver ingresos</Link></Button>}
      </AlertDescription>
    </Alert>
    {open && <MissingPurchaseCostsDialog from={from} to={to} onClose={() => setOpen(false)} />}
  </>;
}
