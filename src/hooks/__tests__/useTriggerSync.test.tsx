import type { ReactNode } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useTriggerSync, type SyncStatus } from "../useSyncStatus";

const api = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn() }));
vi.mock("@/lib/api", () => ({ api }));

const status = (busy: boolean, state: SyncStatus["state"] = "online"): SyncStatus => ({
  state, sync_in_progress: busy, last_synced_at: null, last_error: null, queue_pending_count: 0,
});
let client: QueryClient;
function wrapper({ children }: { children: ReactNode }) {
  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
beforeEach(() => {
  vi.resetAllMocks();
  client = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  api.post.mockResolvedValue({ triggered: true });
});

describe("manual sync activity", () => {
  it("stays pending after HTTP 202, shares activity, and publishes the completed status", async () => {
    let finish!: (value: SyncStatus) => void;
    api.get.mockResolvedValueOnce(status(true)).mockImplementationOnce(() => new Promise(resolve => { finish = resolve; }));
    const { result } = renderHook(() => [useTriggerSync(), useTriggerSync()], { wrapper });
    act(() => result.current[0].mutate());
    await waitFor(() => expect(result.current.every(hook => hook.isPending)).toBe(true));
    await waitFor(() => expect(client.getQueryData(["sync", "status"])).toMatchObject({ sync_in_progress: true }));
    await waitFor(() => expect(finish).toBeTypeOf("function"));
    expect(result.current[0].isPending).toBe(true);
    const completed = { ...status(false), last_pulled_at: "2026-09-29T18:00:00Z" };
    await act(async () => finish(completed));
    await waitFor(() => expect(result.current.every(hook => !hook.isPending)).toBe(true));
    expect(client.getQueryData(["sync", "status"])).toEqual(completed);
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it.each(["offline_short", "auth_invalid", "sync_error"] as const)("stops when the completed attempt reports %s", async state => {
    api.get.mockResolvedValueOnce(status(true)).mockResolvedValueOnce(status(false, state));
    const { result } = renderHook(() => useTriggerSync(), { wrapper });
    await act(async () => { await result.current.mutateAsync(); });
    expect(result.current.isPending).toBe(false);
    expect(client.getQueryData(["sync", "status"])).toMatchObject({ state, sync_in_progress: false });
  });

  it.each(["get", "post"] as const)("releases the action when the local %s request fails", async method => {
    api[method].mockRejectedValue(new Error("Sidecar unavailable"));
    const { result } = renderHook(() => useTriggerSync(), { wrapper });
    await act(async () => { await expect(result.current.mutateAsync()).rejects.toThrow("Sidecar unavailable"); });
    await waitFor(() => expect(result.current.isPending).toBe(false));
  });

  it("does not wait forever with an older sidecar", async () => {
    const legacy = { ...status(false), sync_in_progress: undefined };
    api.get.mockResolvedValueOnce(legacy);
    const { result } = renderHook(() => useTriggerSync(), { wrapper });
    await act(async () => { await result.current.mutateAsync(); });
    expect(result.current.isPending).toBe(false);
    expect(api.get).toHaveBeenCalledTimes(1);
  });
});
