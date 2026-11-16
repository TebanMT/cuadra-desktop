import { describe, expect, it } from "vitest";
import { hasPermission, PERMISSIONS } from "../permissions";

describe("hasPermission", () => {
  it("nadie sin sesión", () => {
    expect(hasPermission(null, "discounts")).toBe(false);
    expect(hasPermission(undefined, "cash_out")).toBe(false);
  });

  it("el dueño siempre puede, aunque la lista venga vacía", () => {
    for (const p of PERMISSIONS) {
      expect(hasPermission({ role: "owner", permissions: [] }, p.key)).toBe(true);
    }
  });

  it("el operador sólo tiene lo que el dueño le activó", () => {
    const user = { role: "operator" as const, permissions: ["credit" as const, "inventory" as const] };
    expect(hasPermission(user, "credit")).toBe(true);
    expect(hasPermission(user, "inventory")).toBe(true);
    expect(hasPermission(user, "discounts")).toBe(false);
    expect(hasPermission(user, "cash_out")).toBe(false);
    expect(hasPermission({ role: "operator", permissions: [] }, "checkin_override")).toBe(false);
  });

  it("una sesión guardada antes de los permisos deja decidir al servidor", () => {
    expect(hasPermission({ role: "operator" }, "member_status")).toBe(true);
  });

  it("el catálogo trae los ocho permisos del contrato, en su orden", () => {
    expect(PERMISSIONS.map((p) => p.key)).toEqual([
      "discounts", "credit", "cash_out", "view_totals", "checkin_override", "products", "inventory", "member_status",
    ]);
  });
});
