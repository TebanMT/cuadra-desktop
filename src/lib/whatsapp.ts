// Helper para construir URLs wa.me con teléfono normalizado + mensaje
// pre-cargado. La normalización mete país MX por default cuando el
// número viene sin código (10 dígitos), porque históricamente los
// operadores guardan los teléfonos así. wa.me no enruta sin código de
// país, así que sin esto los clicks abrían un chat vacío en clientes
// donde la cuenta no está en MX.

const DEFAULT_COUNTRY_CODE = "52";

// normalizes a phone string to E.164 sin "+" (la forma que wa.me consume).
//
// Reglas:
//   - Se quitan TODOS los no-dígitos (incluido el "+").
//   - Si quedan 10 dígitos, se asume MX y se antepone "52".
//   - Si ya empieza con código de país (11+ dígitos), se respeta tal cual.
//   - Si quedan menos de 10, se devuelve "" (no useable).
export function whatsappPhone(raw: string | null | undefined): string {
  if (!raw) return "";
  const digits = raw.replace(/[^0-9]/g, "");
  if (digits.length === 0) return "";
  if (digits.length === 10) return DEFAULT_COUNTRY_CODE + digits;
  if (digits.length < 10) return "";
  return digits;
}

// Construye la URL completa con mensaje URL-encoded. Devuelve null si el
// teléfono no es válido — el caller debe esconder el botón en ese caso.
export function whatsappUrl(phone: string | null | undefined, message?: string): string | null {
  const p = whatsappPhone(phone);
  if (!p) return null;
  const base = `https://wa.me/${p}`;
  if (!message) return base;
  return `${base}?text=${encodeURIComponent(message)}`;
}
