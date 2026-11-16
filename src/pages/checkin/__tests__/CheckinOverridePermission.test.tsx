import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { api } from "@/lib/api";
import type { CheckinEvent } from "@/hooks/useCheckin";
import { checkin as t } from "@/strings/checkin";
import CheckinPage from "../CheckinPage";

vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), api: { post: vi.fn(), get: vi.fn(async () => []) } }));
vi.mock("@/hooks/useCheckin", async () => ({
  ...await vi.importActual<typeof import("@/hooks/useCheckin")>("@/hooks/useCheckin"),
  useCheckinMethods: () => ({ data: { number_available: true, manual_available: true } }),
  useRecentCheckins: () => ({ items: [], failed: false, prepend: vi.fn() }),
  useCheckinCountToday: () => ({ data: { count_today: 0 } }),
}));
vi.mock("@/hooks/useBiometric", () => ({ useBiometricStatus: () => ({ data: { available: false } }), useReaderMissing: () => false, useBiometricCheckinFeed: vi.fn() }));
vi.mock("@/hooks/useGym", () => ({ useCheckinFeedbackSettings: () => ({ ttlMs: 5000, volume: 0 }) }));
vi.mock("@/hooks/useSyncStatus", () => ({ useSyncStatus: () => ({ data: {} }), levelOf: () => "ok" }));
vi.mock("@/lib/audio", () => ({ playCheckinTone: vi.fn(), unlockAudio: vi.fn() }));

const expired: CheckinEvent = {
  id: "c1", result: "denied_expired", method: "number", member_id: "m1", member_name: "Ana Ejemplo",
  expiry_date: "2026-11-01", days_until_expiry: -5, manual_override: false, created_at: new Date().toISOString(),
};

function signIn(permissions: string[]) {
  useAuthStore.setState({ readOnly: false, user: { user_id: "u2", role: "operator", permissions } as never });
}

beforeEach(() => vi.clearAllMocks());

describe("Dejar pasar a un socio vencido", () => {
  it("no lo ofrece a un operador sin el permiso", async () => {
    signIn([]);
    vi.mocked(api.post).mockResolvedValue(expired);
    renderWithProviders(<MemoryRouter><CheckinPage /></MemoryRouter>);
    await userEvent.keyboard("0017{Enter}");
    await waitFor(() => expect(api.post).toHaveBeenCalledTimes(1));
    expect(await screen.findByText(/No puedes autorizar su entrada\./)).toBeInTheDocument();
    expect(screen.getByText("«Dejar pasar vencidos»")).toBeInTheDocument();
    expect(screen.queryByText(t.page.overridePrompt)).not.toBeInTheDocument();
    await userEvent.keyboard("o");
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });

  it("lo ofrece a un operador con el permiso", async () => {
    signIn(["checkin_override"]);
    vi.mocked(api.post).mockResolvedValue(expired);
    renderWithProviders(<MemoryRouter><CheckinPage /></MemoryRouter>);
    await userEvent.keyboard("0017{Enter}");
    expect(await screen.findByText(t.page.overridePrompt)).toBeInTheDocument();
    expect(screen.queryByText(/No puedes autorizar su entrada/)).not.toBeInTheDocument();
  });
});
