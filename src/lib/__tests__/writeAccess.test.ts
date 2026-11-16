import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
import { api } from "../api";
import { assertRequestAllowed, READ_ONLY_MESSAGE } from "../writeAccess";
import { useAuthStore } from "@/stores/useAuthStore";

vi.mock("../tauri-bridge", () => ({
  getSidecarUrl: async () => "http://localhost:9999",
  getLocalAuthToken: async () => "test-local",
  secureStorageGet: async () => "test-token",
  secureStorageSet: vi.fn(), secureStorageDelete: vi.fn(),
}));
const fetchMock = vi.fn(async () => new Response("{}", { headers: { "Content-Type": "application/json" } }));
beforeEach(() => { useAuthStore.setState({ readOnly: true }); fetchMock.mockClear(); vi.stubGlobal("fetch", fetchMock); });
afterEach(() => { useAuthStore.setState({ readOnly: false }); vi.unstubAllGlobals(); });

describe("read-only writes", () => {
  it("blocks JSON and multipart writes before transport, including direct URLs and skipAuth", async () => {
    await expect(api.post("/api/v1/members", { full_name: "Ana Ejemplo" })).rejects.toThrow(READ_ONLY_MESSAGE);
    await expect(api.post("http://localhost:9999/api/v1/payments/p1/send", {}, { skipAuth: true })).rejects.toThrow(READ_ONLY_MESSAGE);
    await expect(api.patch("/api/v1/members/m1", {})).rejects.toThrow(READ_ONLY_MESSAGE);
    await expect(api.delete("/api/v1/products/p1")).rejects.toThrow(READ_ONLY_MESSAGE);
    await expect(api.postFormData("/api/v1/members/import-csv", new FormData())).rejects.toThrow(READ_ONLY_MESSAGE);
    expect(fetchMock).not.toHaveBeenCalled();
  });
  it("preserves reads, login recovery and sync, without allowing changes to personal credentials", async () => {
    await api.get("/api/v1/members");
    await api.post("/api/v1/sync/trigger", {});
    await api.post("/api/v1/auth/login-pin", {});
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(() => assertRequestAllowed("POST", "/api/v1/auth/me/pin")).toThrow(READ_ONLY_MESSAGE);
  });
  it("resumes normal mutations after leaving read-only", async () => {
    useAuthStore.setState({ readOnly: false });
    await api.post("/api/v1/members", {});
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
