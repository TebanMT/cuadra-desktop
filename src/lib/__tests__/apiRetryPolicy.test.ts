import { describe, expect, it } from "vitest";
import { defaultRetriesForRequest } from "../api";

describe("API retry policy", () => {
  it("retries reads by default", () => {
    expect(defaultRetriesForRequest("GET")).toBe(2);
    expect(defaultRetriesForRequest("HEAD")).toBe(2);
  });

  it("does not retry mutations without a deduplication key", () => {
    expect(defaultRetriesForRequest("POST", { amount: 400 })).toBe(0);
    expect(defaultRetriesForRequest("PATCH", { version: 2 })).toBe(0);
    expect(defaultRetriesForRequest("DELETE")).toBe(0);
  });

  it("retries a keyed mutation and rejects blank keys", () => {
    expect(
      defaultRetriesForRequest("POST", {
        amount: 400,
        idempotency_key: "payment-attempt-1",
      }),
    ).toBe(2);
    expect(defaultRetriesForRequest("POST", { idempotency_key: "  " })).toBe(0);
    expect(
      defaultRetriesForRequest("POST", undefined, {
        "Idempotency-Key": "payment-attempt-2",
      }),
    ).toBe(2);
  });
});
