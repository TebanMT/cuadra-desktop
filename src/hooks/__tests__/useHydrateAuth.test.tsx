import { renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useHydrateAuth } from "../useAuth";
import { useAuthStore, type AuthGym, type AuthUser } from "@/stores/useAuthStore";
import { canAccessFeature } from "@/lib/features";

const mocks = vi.hoisted(() => ({ get: vi.fn(), pulled: null as string | null }));
vi.mock("@/lib/api", () => ({ api: { get: mocks.get }, getAccessToken: vi.fn(async () => "token") }));
vi.mock("@/hooks/useSyncStatus", () => ({ useSyncStatus: () => ({ data: { last_pulled_at: mocks.pulled } }) }));
vi.mock("@/lib/runtime", () => ({ isDev: false }));
const user: AuthUser = { user_id: "owner", full_name: "Owner", email: "owner@example.com", phone: null, role: "owner", has_pin: false };
const gym: AuthGym = { gym_id: "gym", name: "Gym", setup_completed: true, subscription_plan: "standard_monthly", subscription_status: "active", subscription_ends_at: null, trial_ends_at: null };
beforeEach(() => {
  vi.clearAllMocks();
  mocks.pulled = null;
  useAuthStore.getState().setSession(user, gym);
  mocks.get.mockResolvedValue({ user, gym });
});
it.each([
  { subscription_plan: "plus_monthly" },
  { subscription_plan: "plus_annual" },
  { all_features_access: true },
])("refreshes Plus access after a pull: %j", async update => {
  const { rerender } = renderHook(() => useHydrateAuth());
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
  expect(canAccessFeature(useAuthStore.getState().gym, "product_margins")).toBe(false);
  mocks.get.mockResolvedValue({ user, gym: { ...gym, ...update } });
  mocks.pulled = "2026-10-26T16:00:00Z";
  rerender();
  await waitFor(() => expect(canAccessFeature(useAuthStore.getState().gym, "product_margins")).toBe(true));
  rerender();
  expect(mocks.get).toHaveBeenCalledTimes(2);
});
it("keeps the cached session if the local server is unavailable after a pull", async () => {
  const { rerender } = renderHook(() => useHydrateAuth());
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(1));
  mocks.get.mockRejectedValue(new Error("unavailable"));
  mocks.pulled = "2026-10-26T16:00:00Z";
  rerender();
  await waitFor(() => expect(mocks.get).toHaveBeenCalledTimes(2));
  expect(useAuthStore.getState().gym).toEqual(gym);
});
