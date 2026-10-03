import { describe, expect, it } from "vitest";
import { previewDates } from "../RecurringPreview";

describe("fechas de pagos recurrentes", () => {
  it("recupera el día 31 después de febrero", () => {
    expect(previewDates("2026-01-31", "monthly", "", "2026-01-01")).toEqual(["2026-01-31", "2026-02-28", "2026-03-31"]);
  });
  it("distingue quincenas de intervalos de 14 días", () => {
    expect(previewDates("2028-02-15", "semimonthly", "", "2028-02-15")).toEqual(["2028-02-15", "2028-02-29", "2028-03-15"]);
    expect(previewDates("2028-02-15", "every_14_days", "", "2028-02-15")).toEqual(["2028-02-15", "2028-02-29", "2028-03-14"]);
  });
  it("respeta el final y muestra sólo fechas desde hoy", () => {
    expect(previewDates("2026-01-31", "monthly", "2026-03-30", "2026-02-01")).toEqual(["2026-02-28"]);
    expect(previewDates("", "monthly")).toEqual([]);
  });
});
