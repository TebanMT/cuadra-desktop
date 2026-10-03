import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { postMock } = vi.hoisted(() => ({ postMock: vi.fn() }));

vi.mock("@/lib/api", () => ({
  api: {
    post: (...args: unknown[]) => postMock(...args),
  },
}));

import { useRegisterOtherIncome } from "../useBilling";

describe("other income financial invalidation", () => {
  let client: QueryClient;

  function wrapper({ children }: { children: ReactNode }) {
    return (
      <QueryClientProvider client={client}>{children}</QueryClientProvider>
    );
  }

  beforeEach(() => {
    vi.clearAllMocks();
    client = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });
  });

  it("refreshes business, dashboard, cash and analytics after a cash income", async () => {
    postMock.mockResolvedValueOnce({
      payment_id: "payment-other-1",
      folio: "OTR-1",
      amount: 8_500,
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRegisterOtherIncome(), { wrapper });
    const input = {
      amount: 8_500,
      payment_method: "cash" as const,
      payment_date: "2026-08-24",
      description: "Venta de caminadora usada",
      idempotency_key: "8a43fc3a-5271-4e3b-9c1b-23beaad76aef",
    };

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/payments/other", input);
    for (const key of [
      "billing",
      "members",
      "reports",
      "dashboard",
      "cash-close",
      "analytics",
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });
});
