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

import {
  useCorrectSale,
  useRefundSale,
  useRegisterSale,
  useSaleDetail,
  useSettlePendingSaleRefund,
} from "../useSales";

const sale = {
  id: "sale-1",
  version: 2,
  payment_id: "payment-1",
  folio: "V-1",
  subtotal: 4,
  discount: 0,
  total: 4,
  collected: 4,
  refunded: 0,
  refundable: 4,
  balance_pending: 0,
  lines: [],
};

describe("sales correction hooks", () => {
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

  it("loads the versioned sale detail only when a sale id is available", async () => {
    getMock.mockResolvedValueOnce(sale);
    const { result } = renderHook(() => useSaleDetail("sale-1", true), { wrapper });

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/sales/sale-1");

    renderHook(() => useSaleDetail(null, true), { wrapper });
    expect(getMock).toHaveBeenCalledTimes(1);
  });

  it("posts the auditable DTO and invalidates every stock and money surface", async () => {
    const response = {
      correction_id: "correction-1",
      idempotency_key: "key-1",
      sale,
      inventory_effects: [],
      money_effect: {
        old_sale_total: 40,
        new_sale_total: 4,
        collected: 4,
        refund_due: 0,
        money_status: "settled",
      },
    };
    postMock.mockResolvedValueOnce(response);
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCorrectSale("sale-1"), { wrapper });
    const input = {
      expected_version: 1,
      idempotency_key: "key-1",
      reason: "Cero extra",
      lines: [{ sale_item_id: "line-1", product_id: "product-1", quantity: 4 }],
      money_resolution: "record_only" as const,
    };

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/sales/sale-1/corrections", input);
    for (const key of [
      "products",
      "sales",
      "payments",
      "billing",
      "cash-close",
      "reports",
      "dashboard",
      "analytics",
    ]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
    expect(client.getQueryData(["sales", "detail", "sale-1"])).toEqual(sale);
  });

  it("normalizes the canonical correction response and reloads detail when sale is omitted", async () => {
    postMock.mockResolvedValueOnce({
      correction_id: "correction-2",
      sale_version: 3,
      money_effect: {
        previous_total: 40,
        corrected_total: 4,
        physical_collected: 40,
        recognized_income: 4,
        refunded_now: 0,
        pending_refund_due: 36,
        status: "pending_refund",
      },
    });
    getMock.mockResolvedValueOnce(sale);
    const { result } = renderHook(() => useCorrectSale("sale-1"), { wrapper });

    let response: Awaited<ReturnType<typeof result.current.mutateAsync>> | undefined;
    await act(async () => {
      response = await result.current.mutateAsync({
        expected_version: 2,
        idempotency_key: "key-2",
        reason: "Cantidad incorrecta",
        lines: [{ sale_item_id: "line-1", product_id: "product-1", quantity: 4 }],
        money_resolution: "refund_pending",
      });
    });

    expect(getMock).toHaveBeenCalledWith("/api/v1/sales/sale-1");
    expect(response).toMatchObject({
      correction_id: "correction-2",
      idempotency_key: "key-2",
      sale_version: 3,
      sale,
      inventory_effects: [],
      money_effect: {
        old_sale_total: 40,
        new_sale_total: 4,
        collected: 40,
        refund_due: 36,
        money_status: "refund_pending",
      },
    });
    expect(client.getQueryData(["sales", "detail", "sale-1"])).toEqual(sale);
  });

  it("a new sale invalidates the same financial surfaces", async () => {
    postMock.mockResolvedValueOnce({ sale_id: "sale-2" });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRegisterSale(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        idempotency_key: "sale-attempt-1",
        line_items: [{ product_id: "product-1", quantity: 1 }],
        payment_method: "cash",
      });
    });

    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reports"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["analytics"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["billing"] });
  });

  it("posts an explicit product refund and refreshes detail, inventory and money", async () => {
    postMock.mockResolvedValueOnce({ refund_id: "refund-1", amount: 18 });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useRefundSale("sale-1"), { wrapper });
    const input = {
      reason: "Regresó el producto",
      method: "card" as const,
      payment_date: "2026-08-24",
      idempotency_key: "refund-key-1",
      line_items: [
        {
          sale_item_id: "line-1",
          quantity: 2,
          disposition: "damaged" as const,
        },
      ],
    };

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/sales/sale-1/refund", input);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["sales", "detail", "sale-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["products"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["reports"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cash-close"] });
  });

  it("settles the full pending correction through its dedicated endpoint", async () => {
    postMock.mockResolvedValueOnce({
      refund_id: "refund-2",
      amount: 36,
      payment_method: "cash",
      refunded_on: "2026-08-24",
      pending_amount: 0,
    });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(
      () => useSettlePendingSaleRefund("correction-1", "sale-1"),
      { wrapper }
    );
    const input = {
      payment_method: "cash" as const,
      payment_date: "2026-08-24",
      cash_drawer_id: "drawer-front",
      idempotency_key: "settlement-key-1",
    };

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(postMock).toHaveBeenCalledWith(
      "/api/v1/sale-corrections/correction-1/settle",
      input
    );
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["sales", "detail", "sale-1"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["billing"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["dashboard"] });
  });
});
