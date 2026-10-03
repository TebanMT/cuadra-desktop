const warnings: Record<string, string> = {
  unclassified_income: "Hay cobros sin concepto. Revísalos en Ingresos.",
  unclassified_cash_out: "Hay salidas de caja sin clasificar. Indica si fueron gastos o entregas de dinero.",
  invalid_cash_in_classification: "Hay entradas de caja registradas como gastos. Revisa su clasificación.",
  legacy_cash_source_unverified: "Falta indicar de dónde se pagaron algunos gastos. Abre cada gasto marcado y elige Caja o Fondo del gimnasio.",
  legacy_inventory_purchase: "Falta el costo de algunas compras. Aún no se descuentan del resultado.",
  legacy_refund: "Hay devoluciones con datos faltantes. Revísalas en Ingresos.",
};
export function financialIntegrityWarningLabel(code?: string): string {
  return warnings[code ?? ""] ?? "Hay movimientos con datos faltantes.";
}
export function missingCostTitle(count: number): string {
  return count > 0 ? `${count} ${count === 1 ? "compra sin costo" : "compras sin costo"}` : "Compras sin costo";
}
