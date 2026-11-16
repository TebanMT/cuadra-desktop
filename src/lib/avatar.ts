/** Neutral initials never encode membership status. Photos remain the primary identifier. */
export interface AvatarPalette {
  bg: string;
  text: string;
}

export const AVATAR_PALETTES: readonly AvatarPalette[] = [
  { bg: "hsl(var(--muted))", text: "hsl(var(--foreground))" },
];

export function getAvatarPalette(_name: string | null | undefined): AvatarPalette {
  return AVATAR_PALETTES[0];
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
