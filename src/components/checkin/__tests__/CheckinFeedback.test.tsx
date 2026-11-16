import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { CheckinEvent, CheckinResult } from "@/hooks/useCheckin";
import { checkin as t } from "@/strings/checkin";
import { CheckinFeedback, eventToFeedback, feedbackDetail, feedbackTone } from "../CheckinFeedback";

const event = (result: CheckinResult, extra: Partial<CheckinEvent> = {}): CheckinEvent => ({
  id: "c1",
  result,
  method: "manual",
  member_id: "m1",
  member_name: "Ana López",
  expiry_date: null,
  days_until_expiry: null,
  manual_override: false,
  created_at: "2026-11-13T18:00:00Z",
  ...extra,
});

describe("Resultado del check-in", () => {
  it("una entrada forzada por el operador se ve como permitida", () => {
    const fb = eventToFeedback(event("allowed_override", { manual_override: true }));
    expect(feedbackTone(fb.kind)).toBe("success");
    expect(feedbackDetail(fb)).toBe(t.feedback.successOverride);

    render(<CheckinFeedback state={fb} />);
    expect(screen.getByText(t.feedback.overrideBadge)).toBeInTheDocument();
    expect(screen.queryByText(t.feedback.deniedNotFound)).not.toBeInTheDocument();
  });

  it("un socio inscrito sin primer pago no sale como no encontrado", () => {
    const fb = eventToFeedback(event("denied_unpaid_enrollment"));
    expect(feedbackTone(fb.kind)).toBe("denied");
    expect(feedbackDetail(fb)).toBe(t.feedback.deniedUnpaidEnrollment);
    expect(feedbackDetail(fb)).not.toBe(t.feedback.deniedNotFound);
  });
  it("en recepción dice la decisión y el porqué con la insignia de vigencia", () => {
    const fb = eventToFeedback(event("denied_expired", { expiry_date: "2026-10-01", days_until_expiry: -44 }));
    render(<CheckinFeedback state={fb} compact />);
    expect(screen.getByText(t.feedback.operator.denied)).toBeInTheDocument();
    expect(screen.getByText("Vencido")).toBeInTheDocument();
    // El nombre no se grita en mayúsculas.
    expect(screen.getByRole("heading", { name: "Ana López" })).not.toHaveClass("uppercase");
  });

  it("una entrada forzada en recepción conserva la vigencia real", () => {
    const fb = eventToFeedback(event("allowed_override", { manual_override: true, expiry_date: "2026-10-01" }));
    render(<CheckinFeedback state={fb} compact />);
    expect(screen.getByText(t.feedback.operator.registered)).toBeInTheDocument();
    expect(screen.getByText(t.feedback.overrideBadge)).toBeInTheDocument();
    expect(screen.getByText("Vencido")).toBeInTheDocument();
  });

  it("el kiosco no muestra el nombre en mayúsculas", () => {
    render(<CheckinFeedback state={eventToFeedback(event("allowed_active", { expiry_date: "2099-12-03", days_until_expiry: 20 }))} />);
    expect(screen.getByRole("heading", { name: "Ana López" })).not.toHaveClass("uppercase");
    expect(screen.getByText("Vigente")).toBeInTheDocument();
  });
});
