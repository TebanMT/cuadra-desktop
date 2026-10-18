import { afterEach, describe, expect, it, vi } from "vitest";
import { todayIso } from "../dates";

describe("todayIso", () => {
  afterEach(() => vi.useRealTimers());

  it("respeta el cambio de día en la zona solicitada", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T02:00:00Z"));
    expect(todayIso("UTC")).toBe("2026-01-01");
    expect(todayIso("America/Mexico_City")).toBe("2025-12-31");
    vi.setSystemTime(new Date("2026-01-01T06:00:00Z"));
    expect(todayIso("America/Mexico_City")).toBe("2026-01-01");
  });

  it("mantiene la fecha del equipo cuando no se indica una zona", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 8, 27, 23));
    expect(todayIso()).toBe("2026-09-27");
  });
});
