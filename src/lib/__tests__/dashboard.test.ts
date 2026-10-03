import { describe, expect, it } from "vitest";
import {
  dashboardDay,
  dashboardWindow,
  upcomingEnd,
  sumMoney,
  recentIncomeLink,
} from "../dashboard";
import type { DashboardData } from "@/hooks/useReports";
describe("Inicio: fechas del gimnasio", () => {
  it("uses the API calendar date independently of the browser zone", () => {
    expect(
      dashboardDay(
        {
          local_date: "2026-09-28",
          generated_at: "2026-09-29T01:00:00Z",
        } as DashboardData,
        "Asia/Tokyo",
      ),
    ).toBe("2026-09-28");
  });
  it("supports an older API using the configured gym zone", () => {
    expect(
      dashboardDay(
        { generated_at: "2026-09-29T01:00:00Z" } as DashboardData,
        "America/Mexico_City",
      ),
    ).toBe("2026-09-28");
    expect(dashboardDay(undefined)).toBeUndefined();
  });
  it("clamps the month comparison and crosses years without overflowing", () => {
    expect(dashboardWindow({} as DashboardData, "2026-03-31")).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(upcomingEnd("2026-12-15")).toBe("2027-01-14");
    expect(recentIncomeLink("2026-03-01")).toBe(
      "/reports?from=2026-01-31&to=2026-03-01",
    );
  });
  it("sums pending amounts in cents", () => {
    expect(sumMoney([0.1, 0.2])).toBe(0.3);
  });
});
