import { describe, expect, it } from "vitest";
import { ApiError } from "./api";

describe("API errors shown to the operator", () => {
  it("keeps conflict identity and diagnostics while explaining a repeated financial attempt", () => {
    const details = { exception: "idempotency_key ya fue usado con otros datos" };
    const error = new ApiError(409, "business_error", details.exception, details);
    expect(error.status).toBe(409);
    expect(error.code).toBe("business_error");
    expect(error.message).toMatch(/Revisa el registro antes de repetirlo/);
    expect(error.message).not.toContain("idempotency");
    expect(error.diagnosticMessage).toBe(details.exception);
    expect(error.details).toBe(details);
  });
  it("does not replace an actionable business constraint", () => {
    const message = "Sólo puedes restar unidades que sigan disponibles.";
    expect(new ApiError(422, "business_error", message).message).toBe(message);
  });
  it("keeps the WhatsApp duplicate recognizable to the signup flow", () => {
    const error = new ApiError(409, "conflict", "SQLSTATE 23505: uq_gyms_whatsapp");
    expect(error.message).toMatch(/WhatsApp.*registrado/);
    expect(error.diagnosticMessage).toContain("SQLSTATE");
  });
  it("does not show database details as the main error", () => {
    const error = new ApiError(500, "unexpected_error", "SQLSTATE 23503: foreign key violation");
    expect(error.message).toMatch(/contacta a soporte/);
    expect(error.message).not.toMatch(/SQLSTATE|foreign key/);
    expect(error.diagnosticMessage).toContain("23503");
  });
});
