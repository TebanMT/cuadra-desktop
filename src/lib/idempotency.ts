export function createIdempotencyKey(): string {
  if (typeof globalThis.crypto?.randomUUID === "function") {
    return globalThis.crypto.randomUUID();
  }
  return "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === "x" ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

/**
 * Devuelve la misma llave para un reintento byte-a-byte equivalente y una
 * nueva cuando el operador cambió la operación. El ref debe sobrevivir a un
 * error o al cierre accidental del modal y limpiarse sólo tras éxito.
 */
export function keyForPayload(
  attempt: { fingerprint: string; key: string } | null,
  payload: unknown,
): { fingerprint: string; key: string } {
  const fingerprint = JSON.stringify(payload);
  if (attempt?.fingerprint === fingerprint) return attempt;
  return { fingerprint, key: createIdempotencyKey() };
}
