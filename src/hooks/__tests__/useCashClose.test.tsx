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

import { useCashCloseReport, useCloseCashRegister, useCreateCashMovement, useReopenCashRegister } from "../useCashClose";

describe("cash close hooks — atribución por cajón", () => {
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

  it("consulta exactamente la caja seleccionada", async () => {
    getMock.mockResolvedValueOnce({ date: "2026-08-24", cash_drawer_id: "drawer-2" });
    const { result } = renderHook(
      () => useCashCloseReport("2026-08-24", "drawer-2"),
      { wrapper },
    );

    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/cash-close", {
      query: { date: "2026-08-24", cash_drawer_id: "drawer-2" },
    });
  });

  it("envía el cajón al cierre y refresca todas sus variantes del día", async () => {
    postMock.mockResolvedValueOnce({ cash_close_id: "session-1", calculated_cash: 100 });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCloseCashRegister(), { wrapper });
    const input = {
      date: "2026-08-24",
      cash_drawer_id: "drawer-2",
      counted_cash: 100,
    };

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/cash-close", input);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cash-close", "2026-08-24"] });
  });

  it("conserva la llave idempotente en una entrada o salida física", async () => {
    postMock.mockResolvedValueOnce({ id: "movement-1" });
    const { result } = renderHook(() => useCreateCashMovement(), { wrapper });
    const invalidate = vi.spyOn(client, "invalidateQueries");
    const input = {
      purpose: "expense" as const,
      category: "servicios",
      movement_on: "2026-08-24",
      movement_type: "cash_out" as const,
      amount: 150,
      reason: "Limpieza",
      cash_drawer_id: "drawer-2",
      idempotency_key: "physical-once",
    };

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/cash-movements", input);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["expenses"] });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: ["cash-close", "2026-08-24"] });
  });

  it("reabre por fecha, caja y motivo sin caer implícitamente en main", async () => {
    postMock.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useReopenCashRegister(), { wrapper });
    const input = {
      date: "2026-08-24",
      cash_drawer_id: "drawer-north",
      reason: "faltó un cobro",
    };

    await act(async () => {
      await result.current.mutateAsync(input);
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/cash-close/reopen", input);
  });
});
