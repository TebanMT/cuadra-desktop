import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, postMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
  },
}));

import { useCorrectPayment, usePaymentCorrectionHistory } from "../useBilling";

describe("payment correction wire contract", () => {
  let client: QueryClient;
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
  });

  it("posts optimistic version and stable idempotency data, then refreshes every money view", async () => {
    postMock.mockResolvedValueOnce({ payment_id: "payment-1", payment_version: 4 });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCorrectPayment("payment-1"), { wrapper });
    const input = {
      expected_version: 3,
      reason: "Se capturó un cero extra",
      amount: 40,
      payment_method: "transfer" as const,
      payment_date: "2026-08-20",
      idempotency_key: "payment-correction-attempt-1",
    };

    await act(async () => result.current.mutateAsync(input));

    expect(postMock).toHaveBeenCalledWith("/api/v1/payments/payment-1/corrections", input);
    for (const key of ["billing", "members", "reports", "dashboard", "cash-close", "analytics"]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });

  it("loads immutable correction history from the payment-scoped route", async () => {
    getMock.mockResolvedValueOnce({ items: [], total: 0 });
    const { result } = renderHook(
      () => usePaymentCorrectionHistory("payment-1"),
      { wrapper },
    );
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/payments/payment-1/corrections");
  });
});
