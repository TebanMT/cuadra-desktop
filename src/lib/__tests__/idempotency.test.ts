import { describe, expect, it } from "vitest";
import { keyForPayload } from "../idempotency";

describe("keyForPayload", () => {
  it("keeps one key for an equivalent retry", () => {
    const first = keyForPayload(null, { amount: 400, method: "cash" });
    const retry = keyForPayload(first, { amount: 400, method: "cash" });
    expect(retry.key).toBe(first.key);
  });

  it("starts a new attempt when the requested operation changes", () => {
    const first = keyForPayload(null, { amount: 400, method: "cash" });
    const changed = keyForPayload(first, { amount: 350, method: "cash" });
    expect(changed.key).not.toBe(first.key);
  });
});
