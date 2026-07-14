import { describe, it, expect } from "vitest";
import { isSyncStale, STALE_AFTER_MS } from "../SyncStaleHint";

// Pin del umbral del aviso preventivo: la validación local de nombre
// duplicado sólo ve lo ya sincronizado, así que el hint debe aparecer
// exactamente cuando el equipo lleva rato sin hablar con la nube — y
// nunca molestar a un equipo sano (el agente tickea cada 30s).
const NOW = new Date("2026-07-13T12:00:00Z").getTime();
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe("isSyncStale", () => {
  it("sync reciente → no molesta", () => {
    expect(isSyncStale(iso(30_000), NOW)).toBe(false);
    expect(isSyncStale(iso(STALE_AFTER_MS - 1000), NOW)).toBe(false);
  });

  it("pasado el umbral → avisa", () => {
    expect(isSyncStale(iso(STALE_AFTER_MS + 1000), NOW)).toBe(true);
    expect(isSyncStale(iso(24 * 60 * 60 * 1000), NOW)).toBe(true);
  });

  it("nunca sincronizó (null/ausente) es el caso de MÁS riesgo → avisa", () => {
    expect(isSyncStale(null, NOW)).toBe(true);
    expect(isSyncStale(undefined, NOW)).toBe(true);
  });
});
