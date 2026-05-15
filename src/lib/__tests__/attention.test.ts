import { describe, it, expect } from "vitest";
import { countAttentionItems } from "../attention";
import type { AttentionData } from "@/hooks/useReports";

function makeData(over: Partial<AttentionData> = {}): AttentionData {
  return {
    expiring_soon: [],
    expired_recoverable: [],
    inactive_involuntary: [],
    low_stock: [],
    pending_balance: [],
    birthdays_today: [],
    ...over,
  };
}

describe("countAttentionItems", () => {
  it("returns 0 when data is undefined", () => {
    expect(countAttentionItems(undefined)).toBe(0);
  });

  it("returns 0 when all arrays are empty", () => {
    expect(countAttentionItems(makeData())).toBe(0);
  });

  it("deduplicates socios that appear in multiple issue lists", () => {
    const sharedId = "m1";
    const data = makeData({
      expired_recoverable: [
        {
          member_id: sharedId,
          full_name: "María",
          phone: "5512345678",
          expiry_date: "2026-05-01",
          days_until_expiry: -10,
          membership_type: "Mensual",
          days_overdue: 10,
          contact_attempts_count: 0,
        },
      ],
      pending_balance: [
        { member_id: sharedId, full_name: "María", phone: "5512345678", balance: 200, due_since: "2026-05-01" },
      ],
      expiring_soon: [
        {
          member_id: sharedId,
          full_name: "María",
          phone: "5512345678",
          expiry_date: "2026-05-20",
          days_until_expiry: 5,
          membership_type: "Mensual",
        },
      ],
    });
    expect(countAttentionItems(data)).toBe(1);
  });

  it("adds low_stock products separately (different entity)", () => {
    const data = makeData({
      expired_recoverable: [
        {
          member_id: "m1",
          full_name: "Juan",
          phone: "5512345678",
          expiry_date: "2026-05-01",
          days_until_expiry: -3,
          membership_type: "Mensual",
          days_overdue: 3,
          contact_attempts_count: 0,
        },
      ],
      low_stock: [
        { product_id: "p1", name: "Proteína", stock: 1, min_stock: 5 },
        { product_id: "p2", name: "Bebida", stock: 0, min_stock: 3 },
      ],
    });
    expect(countAttentionItems(data)).toBe(3);
  });

  it("ignores inactive_involuntary and birthdays_today (not on page)", () => {
    const data = makeData({
      inactive_involuntary: [
        { member_id: "m1", full_name: "Alma", phone: "5512345678", last_visit_at: null, days_since_visit: 30 },
      ],
      birthdays_today: [
        { member_id: "m2", full_name: "Beto", phone: "5512345678", age: 30 },
      ],
    });
    expect(countAttentionItems(data)).toBe(0);
  });
});
