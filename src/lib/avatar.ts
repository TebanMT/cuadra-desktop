/**
 * Sistema determinista de avatares — paletas de marca asignadas por hash
 * del nombre. Un mismo nombre siempre cae en el mismo color, sin estado
 * compartido ni configuración por usuario.
 *
 * Reemplaza el sistema previo de tonos pastel aleatorios y la asignación
 * por estado de membresía (que confundía: avatar rojo no debe leerse
 * como "error" sino como identificador visual).
 *
 * Uso:
 *
 *   const palette = getAvatarPalette(member.full_name);
 *   <div
 *     className="..."
 *     style={{ backgroundColor: palette.bg, color: palette.text }}
 *   >
 *     {getInitials(member.full_name)}
 *   </div>
 *
 * Por qué inline style en lugar de clases Tailwind: Tailwind sólo genera
 * las clases que aparecen literalmente en el source. Un map dinámico
 * `bg-ink-900 / bg-brick-500 / ...` requeriría safelisting o constantes
 * literales. Inline style es deterministicamente correcto y evita la
 * complejidad.
 */

export interface AvatarPalette {
  bg: string;
  text: string;
}

/**
 * Seis paletas tomadas de la identidad terracota: dos shades de ink,
 * dos de brick, dos de moss. Todas con texto en paper-50 (#FDFBF6) para
 * contraste consistente sobre fondos oscuros + saturados.
 *
 * Orden importa — define la rotación al hashear. Cambiar el orden
 * cambia la asignación de colores para todos los nombres existentes.
 */
export const AVATAR_PALETTES: readonly AvatarPalette[] = [
  { bg: "#0F1A2E", text: "#FDFBF6" }, // ink-900
  { bg: "#1F2937", text: "#FDFBF6" }, // ink-700
  { bg: "#D6593C", text: "#FDFBF6" }, // brick-500
  { bg: "#8E311E", text: "#FDFBF6" }, // brick-700
  { bg: "#0F766E", text: "#FDFBF6" }, // moss-500
  { bg: "#0A5950", text: "#FDFBF6" }, // moss-700
];

/**
 * Hash sumando charCodes — barato, suficientemente disperso para 6
 * paletas, determinista entre sesiones. NO es criptográfico ni necesita
 * serlo: dos nombres con la misma suma caen en la misma paleta y eso
 * está bien (es el comportamiento esperado del sistema).
 */
export function getAvatarPalette(name: string | null | undefined): AvatarPalette {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return AVATAR_PALETTES[0];
  let hash = 0;
  for (let i = 0; i < trimmed.length; i++) {
    hash += trimmed.charCodeAt(i);
  }
  return AVATAR_PALETTES[hash % AVATAR_PALETTES.length];
}

/**
 * Iniciales del nombre — primera letra del primer nombre + primera del
 * segundo. Centralizado para que toda la app produzca exactamente el
 * mismo string para el mismo nombre.
 *
 * Edge cases:
 *  - null/undefined/empty → "?"
 *  - una sola palabra → solo esa inicial ("Juan" → "J")
 *  - tres+ palabras → solo las dos primeras ("Juan Carlos Pérez" → "JC")
 */
export function getInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  const first = parts[0]?.[0] ?? "";
  const second = parts[1]?.[0] ?? "";
  return ((first + second).toUpperCase() || "?").slice(0, 2);
}
