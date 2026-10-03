import { afterEach, describe, expect, it, vi } from "vitest";
import {
  comparisonDates,
  readReportRange,
  reportBuckets,
  reportLink,
  writeReportRange,
} from "../report-period";

afterEach(() => vi.useRealTimers());
describe("report periods", () => {
  it("preserves the selected topic and custom dates in shareable navigation", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-09-28T12:00:00"));
    const params = writeReportRange(new URLSearchParams("view=products"), {
      period: "custom",
      from: "2026-08-01",
      to: "2026-08-31",
    });
    expect(params.get("view")).toBe("products");
    expect(readReportRange(params)).toEqual({
      range: { period: "custom", from: "2026-08-01", to: "2026-08-31" },
    });
    expect(writeReportRange(params, { period: "last_month" }).has("from")).toBe(
      false,
    );
    expect(
      reportLink("/payments", "2026-08-01", "2026-08-31", {
        concept: "refund",
      }),
    ).toBe("/payments?concept=refund&from=2026-08-01&to=2026-08-31");
  });
  it.each([
    "from=2026-02-30&to=2026-03-01",
    "from=2026-09-20&to=2026-09-01",
    "from=2024-01-01&to=2026-09-01",
    "period=custom",
    "period=unexpected",
    "from=2026-09-01&to=2027-01-01",
  ])(
    "rejects an invalid URL without silently changing its meaning: %s",
    (search) => {
      vi.useFakeTimers();
      vi.setSystemTime(new Date("2026-09-28T12:00:00"));
      expect(readReportRange(new URLSearchParams(search)).error).toBeTruthy();
    },
  );
  it("compares month-to-date to the same days, clamps February, and uses server dates when available", () => {
    expect(
      comparisonDates({
        period: "month",
        from: "2026-09-01",
        to: "2026-09-28",
      }),
    ).toEqual({ from: "2026-08-01", to: "2026-08-28" });
    expect(
      comparisonDates({
        period: "last_month",
        from: "2024-03-01",
        to: "2024-03-31",
      }),
    ).toEqual({ from: "2024-02-01", to: "2024-02-29" });
    expect(
      comparisonDates({
        period: "custom",
        from: "2026-09-05",
        to: "2026-09-07",
      }),
    ).toEqual({ from: "2026-09-02", to: "2026-09-04" });
    expect(
      comparisonDates({
        period: "custom",
        from: "2026-09-05",
        to: "2026-09-07",
        previous_from: "2025-09-05",
        previous_to: "2025-09-07",
      }),
    ).toEqual({ from: "2025-09-05", to: "2025-09-07" });
  });
  it("groups long reports by month, includes empty days/months, preserves cents and exact drill-down limits", () => {
    const series = reportBuckets(
      "2026-06-29",
      "2026-09-28",
      [
        { date: "2026-06-29", total: 0.1 },
        { date: "2026-06-30", total: 0.2 },
        { date: "2026-09-28", total: 40 },
        { date: "2026-09-29", total: 999 },
      ],
      [{ date: "2026-08-02", total: 10.25 }],
      [{ date: "2026-07-10", count: 3 }],
    );
    expect(series.monthly).toBe(true);
    expect(series.rows).toHaveLength(4);
    expect(series.rows[0]).toMatchObject({
      income: 0.3,
      from: "2026-06-29",
      to: "2026-06-30",
    });
    expect(series.rows[1]).toMatchObject({ income: 0, outflows: 0, count: 3 });
    expect(series.rows[3]).toMatchObject({
      income: 40,
      from: "2026-09-01",
      to: "2026-09-28",
    });
    expect(reportBuckets("2026-09-01", "2026-09-03").rows).toHaveLength(3);
  });
});
