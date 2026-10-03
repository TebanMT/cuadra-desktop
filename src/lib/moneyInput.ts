/** Parses typed money without requiring exact floating-point multiplication. */
export function moneyInputError(raw: string): string | null {
  const value = Number(raw);
  if (!raw.trim() || !Number.isFinite(value) || value <= 0) return "El monto debe ser mayor a cero.";
  if (value > 9_999_999_999.99) return "El monto supera el máximo permitido.";
  if (!/^\d+(?:\.\d{1,2})?$/.test(raw.trim())) return "Usa un monto con hasta dos decimales.";
  return null;
}
