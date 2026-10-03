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
  cashMovementActions,
  useClassifyCashMovement,
  useCashMovements,
  useDeleteExpense,
  useExpensesList,
  useInventoryPurchases,
  useCorrectInventoryPurchase,
  usePayInventoryPurchase,
  useReopenInventoryPurchase,
  usePayOccurrence,
  useReopenOccurrence,
  useSkipOccurrence,
  useUnclassifyCashMovement,
  useUpdateCashMovement,
  useDeleteCashMovement,
  useExpenseOccurrences,
  useCreateExpenseTemplate,
  useSetExpenseTemplateActive,
} from "../useExpenses";
import { useReportsRange } from "../useReports";

describe("Expenses Plus hooks", () => {
  let queryClient: QueryClient;
  function wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  }

  beforeEach(() => {
    vi.clearAllMocks();
    queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  });

  it("keeps physical cash-ins editable but never classifiable", () => {
    expect(cashMovementActions({ movement_type: "cash_in", classification_status: "non_operating" })).toEqual({
      canEdit: true,
      canClassify: false,
      canUnclassify: false,
    });
    expect(cashMovementActions({ movement_type: "cash_out", classification_status: "unclassified" })).toEqual({
      canEdit: true,
      canClassify: true,
      canUnclassify: false,
    });
    expect(cashMovementActions({ movement_type: "cash_in", classification_status: "expense" })).toEqual({
      canEdit: false,
      canClassify: false,
      canUnclassify: true,
    });
  });

  it("does not issue hidden Expenses or Reports requests when the Plus gate is closed", async () => {
    renderHook(() => {
      useExpensesList({ from: "2026-08-01", to: "2026-08-13" }, false);
      useReportsRange("month", undefined, undefined, false);
    }, { wrapper });

    await act(async () => Promise.resolve());
    expect(getMock).not.toHaveBeenCalled();
  });

  it("paying an occurrence sends the exact DTO and invalidates every financial surface", async () => {
    postMock.mockResolvedValueOnce({ id: "expense-1" });
    const invalidate = vi.spyOn(queryClient, "invalidateQueries");
    const { result } = renderHook(() => usePayOccurrence(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: "occurrence-1",
        paid_on: "2026-08-13",
        amount: 1234.56,
        payment_method: "cash",
        paid_from: "cash_drawer",
        cash_drawer_id: "drawer-main",
        idempotency_key: "occurrence-payment-1",
        payee_name: "CFE",
        reference: "REC-10",
      });
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/expense-occurrences/occurrence-1/pay", {
      paid_on: "2026-08-13",
      amount: 1234.56,
      payment_method: "cash",
      paid_from: "cash_drawer",
      cash_drawer_id: "drawer-main",
      idempotency_key: "occurrence-payment-1",
      payee_name: "CFE",
      reference: "REC-10",
    });
    for (const key of ["expenses", "expense-occurrences", "expense-templates", "cash-movements", "cash-close", "reports", "dashboard", "analytics"]) {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: [key] });
    }
  });

  it("skips occurrences and classifies drawer exits without changing their API contracts", async () => {
    postMock.mockResolvedValue({});
    const skip = renderHook(() => useSkipOccurrence(), { wrapper });
    const classify = renderHook(() => useClassifyCashMovement(), { wrapper });

    await act(async () => {
      await skip.result.current.mutateAsync({ id: "occurrence-2", reason: "Contrato cancelado" });
      await classify.result.current.mutateAsync({
        id: "movement-1",
        paid_on: "2026-08-13",
        category: "servicios",
        payee_name: "CFE",
        classification: "fixed",
      });
    });

    expect(postMock).toHaveBeenNthCalledWith(
      1,
      "/api/v1/expense-occurrences/occurrence-2/skip",
      { reason: "Contrato cancelado" },
    );
    expect(postMock).toHaveBeenNthCalledWith(
      2,
      "/api/v1/cash-movements/movement-1/classify",
      {
        paid_on: "2026-08-13",
        category: "servicios",
        payee_name: "CFE",
        classification: "fixed",
      },
    );
  });

  it("reopens a resolved occurrence with optimistic version and an audit reason", async () => {
    postMock.mockResolvedValueOnce({ id: "occurrence-3", status: "pending", version: 5 });
    const { result } = renderHook(() => useReopenOccurrence(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({ id: "occurrence-3", version: 4, correction_reason: "Se marcó pagado por error" });
    });

    expect(postMock).toHaveBeenCalledWith("/api/v1/expense-occurrences/occurrence-3/reopen", {
      version: 4,
      correction_reason: "Se marcó pagado por error",
    });
  });

  it("lists, pays and reopens an inventory purchase without changing stock twice", async () => {
    getMock.mockResolvedValue({ items: [], total: 0 });
    postMock.mockResolvedValue({ id: "purchase-1" });
    const list = renderHook(() => useInventoryPurchases("unpaid"), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/inventory-purchases", { query: { status: "unpaid", page: 1, page_size: 200 } });

    const pay = renderHook(() => usePayInventoryPurchase(), { wrapper });
    const reopen = renderHook(() => useReopenInventoryPurchase(), { wrapper });
    const correct = renderHook(() => useCorrectInventoryPurchase(), { wrapper });
    await act(async () => {
      await pay.result.current.mutateAsync({ id: "purchase-1", version: 2, paid_on: "2026-08-24", payment_method: "cash", paid_from: "cash_drawer", cash_drawer_id: "drawer-main", idempotency_key: "purchase-payment-1" });
      await reopen.result.current.mutateAsync({ id: "purchase-1", version: 3, correction_reason: "Se pagó por error" });
      await correct.result.current.mutateAsync({ id: "purchase-1", version: 4, quantity: 4, unit_cost: 10, correction_reason: "Eran 4, no 40", idempotency_key: "purchase-correction-1" });
    });
    expect(postMock).toHaveBeenNthCalledWith(1, "/api/v1/inventory-purchases/purchase-1/pay", { version: 2, paid_on: "2026-08-24", payment_method: "cash", paid_from: "cash_drawer", cash_drawer_id: "drawer-main", idempotency_key: "purchase-payment-1" });
    expect(postMock).toHaveBeenNthCalledWith(2, "/api/v1/inventory-purchases/purchase-1/reopen", { version: 3, correction_reason: "Se pagó por error" });
    expect(postMock).toHaveBeenNthCalledWith(3, "/api/v1/inventory-purchases/purchase-1/correct", { version: 4, quantity: 4, unit_cost: 10, correction_reason: "Eran 4, no 40", idempotency_key: "purchase-correction-1" });
  });

  it("elimina un gasto con versión y motivo de corrección", async () => {
    deleteMock.mockResolvedValueOnce(undefined);
    const { result } = renderHook(() => useDeleteExpense(), { wrapper });

    await act(async () => {
      await result.current.mutateAsync({
        id: "expense-1",
        version: 4,
        correction_reason: "Captura duplicada",
      });
    });

    expect(deleteMock).toHaveBeenCalledWith("/api/v1/expenses/expense-1", {
      query: { version: 4, correction_reason: "Captura duplicada" },
    });
  });

  it("lista el historial físico paginado y corrige la clasificación sin mover caja", async () => {
    getMock.mockResolvedValueOnce({ items: [], total: 0, page: 2, page_size: 50 });
    postMock.mockResolvedValueOnce({ id: "movement-1", version: 4, classification_status: "unclassified" });
    const list = renderHook(() => useCashMovements({ from: "2026-08-01", to: "2026-08-24", status: "classified", page: 2, page_size: 50 }), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/cash-movements", { query: { from: "2026-08-01", to: "2026-08-24", status: "classified", page: 2, page_size: 50 } });

    const correction = renderHook(() => useUnclassifyCashMovement(), { wrapper });
    await act(async () => correction.result.current.mutateAsync({ id: "movement-1", version: 3, correction_reason: "Era una transferencia" }));
    expect(postMock).toHaveBeenCalledWith("/api/v1/cash-movements/movement-1/unclassify", { version: 3, correction_reason: "Era una transferencia" });
  });

  it("corrige o anula una captura física con versión y motivo auditable", async () => {
    patchMock.mockResolvedValueOnce({ id: "movement-4", version: 8 });
    deleteMock.mockResolvedValueOnce(undefined);
    const update = renderHook(() => useUpdateCashMovement(), { wrapper });
    const remove = renderHook(() => useDeleteCashMovement(), { wrapper });
    await act(async () => {
      await update.result.current.mutateAsync({ id: "movement-4", version: 7, movement_on: "2026-08-24", amount: 40, movement_type: "cash_out", reason: "Limpieza", cash_drawer_id: "drawer-main", correction_reason: "Se capturaron 400" });
      await remove.result.current.mutateAsync({ id: "movement-5", version: 2, correction_reason: "Captura duplicada" });
    });
    expect(patchMock).toHaveBeenCalledWith("/api/v1/cash-movements/movement-4", { version: 7, movement_on: "2026-08-24", amount: 40, movement_type: "cash_out", reason: "Limpieza", cash_drawer_id: "drawer-main", correction_reason: "Se capturaron 400" });
    expect(deleteMock).toHaveBeenCalledWith("/api/v1/cash-movements/movement-5", { query: { version: 2, correction_reason: "Captura duplicada" } });
  });

  it("pagina vencimientos y versiona la creación, pausa y reactivación de reglas", async () => {
    getMock.mockResolvedValueOnce({ items: [{ id: "occ-1" }], total: 1, page: 1, page_size: 200 });
    postMock.mockResolvedValue({ id: "template-1", version: 1 });
    deleteMock.mockResolvedValue({ id: "template-1", version: 2, active: false });
    const occurrences = renderHook(() => useExpenseOccurrences("2026-01-01", "2026-12-31"), { wrapper });
    await waitFor(() => expect(occurrences.result.current.isSuccess).toBe(true));
    expect(getMock).toHaveBeenCalledWith("/api/v1/expense-occurrences", { query: { from: "2026-01-01", to: "2026-12-31", page: 1, page_size: 200 } });
    const create = renderHook(() => useCreateExpenseTemplate(), { wrapper });
    const active = renderHook(() => useSetExpenseTemplateActive(), { wrapper });
    const template = { name: "Renta", expected_amount: 1500, category: "renta" as const, usual_payment_method: "transfer" as const, classification: "fixed" as const, frequency: "monthly" as const, starts_on: "2026-09-01", idempotency_key: "template-create-1" };
    await act(async () => {
      await create.result.current.mutateAsync(template);
      await active.result.current.mutateAsync({ id: "template-1", active: false, version: 1 });
      await active.result.current.mutateAsync({ id: "template-1", active: true, version: 2 });
    });
    expect(postMock).toHaveBeenCalledWith("/api/v1/expense-templates", template);
    expect(deleteMock).toHaveBeenCalledWith("/api/v1/expense-templates/template-1", { query: { version: 1 } });
    expect(postMock).toHaveBeenCalledWith("/api/v1/expense-templates/template-1/reactivate", undefined, { query: { version: 2 } });
  });
  it("genera pendientes antes de leerlos y vuelve a hacerlo al guardar o reactivar", async () => {
    let generated = 0;
    postMock.mockImplementation(async (path: string) => {
      if (path.endsWith("/materialize")) generated++;
      return { id: "template-1", version: 1 };
    });
    getMock.mockImplementation(async () => ({ items: [{ id: "old-pending", due_on: "2020-01-01", status: "pending", generation: generated }], total: 1 }));
    const list = renderHook(() => useExpenseOccurrences(undefined, "2026-09-30"), { wrapper });
    await waitFor(() => expect(list.result.current.isSuccess).toBe(true));
    expect(generated).toBe(1);
    expect(getMock).toHaveBeenCalledWith("/api/v1/expense-occurrences", { query: { from: undefined, to: "2026-09-30", page: 1, page_size: 200 } });
    const make = renderHook(() => useCreateExpenseTemplate(), { wrapper });
    await act(async () => make.result.current.mutateAsync({ name: "Renta", expected_amount: 100, category: "renta", usual_payment_method: "transfer", classification: "fixed", frequency: "monthly", starts_on: "2026-09-26", idempotency_key: "rent" }));
    await waitFor(() => expect(generated).toBe(2));
    const resume = renderHook(() => useSetExpenseTemplateActive(), { wrapper });
    await act(async () => resume.result.current.mutateAsync({ id: "template-1", active: true, version: 2 }));
    await waitFor(() => expect(generated).toBe(3));
    expect(list.result.current.data?.items[0].id).toBe("old-pending");
  });

  it("muestra un error si no se pudieron generar los pendientes", async () => {
    postMock.mockRejectedValueOnce(new Error("Sin conexión"));
    const list = renderHook(() => useExpenseOccurrences(undefined, "2026-09-30"), { wrapper });
    await waitFor(() => expect(list.result.current.isError).toBe(true));
    expect(getMock).not.toHaveBeenCalled();
  });

});
