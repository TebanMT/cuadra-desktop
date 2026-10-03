import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { getMock, postMock, patchMock, deleteMock } = vi.hoisted(() => ({
  getMock: vi.fn(),
  postMock: vi.fn(),
  patchMock: vi.fn(),
  deleteMock: vi.fn(),
}));

vi.mock("@/lib/api", () => ({
  api: {
    get: (...args: unknown[]) => getMock(...args),
    post: (...args: unknown[]) => postMock(...args),
    patch: (...args: unknown[]) => patchMock(...args),
    delete: (...args: unknown[]) => deleteMock(...args),
  },
}));

import {
  useCashDrawers,
  useCreateCashDrawer,
  useDeactivateCashDrawer,
  useUpdateCashDrawer,
} from "../useCashDrawers";

describe("cash drawer catalog hooks", () => {
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

  it("carga el catálogo activo para atribuir cobros en efectivo", async () => {
    getMock.mockResolvedValueOnce({
      items: [
        { id: "main", code: "main", name: "Caja principal", active: true, is_main: true, version: 1 },
      ],
    });

    const { result } = renderHook(() => useCashDrawers(), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));

    expect(getMock).toHaveBeenCalledWith("/api/v1/cash-drawers", { query: undefined });
    expect(result.current.data?.[0].is_main).toBe(true);
  });

  it("incluye inactivas sólo en la administración del dueño", async () => {
    getMock.mockResolvedValueOnce({ items: [] });
    const { result } = renderHook(() => useCashDrawers(true), { wrapper });
    await waitFor(() => expect(result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/cash-drawers", {
      query: { include_inactive: true },
    });
  });

  it("conserva idempotencia al crear y control de versión al editar/desactivar", async () => {
    postMock.mockResolvedValueOnce({ id: "north" });
    patchMock.mockResolvedValueOnce({ id: "north", version: 2 });
    deleteMock.mockResolvedValueOnce({ id: "north", active: false, version: 3 });

    const create = renderHook(() => useCreateCashDrawer(), { wrapper });
    const update = renderHook(() => useUpdateCashDrawer(), { wrapper });
    const deactivate = renderHook(() => useDeactivateCashDrawer(), { wrapper });

    await act(async () => {
      await create.result.current.mutateAsync({ name: "Recepción norte", idempotency_key: "drawer-once" });
      await update.result.current.mutateAsync({
        id: "north",
        name: "Recepción 2",
        active: true,
        version: 1,
      });
      await deactivate.result.current.mutateAsync({ id: "north", version: 2 });
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/cash-drawers", {
      name: "Recepción norte",
      idempotency_key: "drawer-once",
    });
    expect(patchMock).toHaveBeenCalledWith("/api/v1/cash-drawers/north", {
      name: "Recepción 2",
      active: true,
      version: 1,
    });
    expect(deleteMock).toHaveBeenCalledWith("/api/v1/cash-drawers/north", {
      query: { version: 2 },
    });
  });
});
