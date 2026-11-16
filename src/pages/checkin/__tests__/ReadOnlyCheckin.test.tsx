import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { api } from "@/lib/api";
import { ReadOnlyError, READ_ONLY_MESSAGE } from "@/lib/writeAccess";
import { checkinErrorMessage, type CheckinEvent } from "@/hooks/useCheckin";
import { checkin as t } from "@/strings/checkin";
import CheckinPage from "../CheckinPage";
import KioskPage from "@/pages/kiosk/KioskPage";
import { OverrideDialog } from "@/components/checkin/OverrideDialog";

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
beforeEach(() => { useAuthStore.setState({ readOnly: true }); vi.clearAllMocks(); });

// Socio vencido: es justo el caso en que recepción usaría "Permitir de todos
// modos", que en solo lectura no se ofrece.
const expired: CheckinEvent = {
  id: "c1", result: "denied_expired", method: "number", member_id: "m1", member_name: "Ana Ejemplo",
  expiry_date: "2026-11-01", days_until_expiry: -5, manual_override: false, created_at: new Date().toISOString(),
};

// Solo lectura = prueba terminada (UC-002): se registran entradas por número y
// por búsqueda; cobrar y autorizar socios vencidos esperan al plan.
describe("Entradas con la recepción en solo lectura", () => {
  it("mantiene la causa del bloqueo y no expone errores técnicos", () => {
    expect(checkinErrorMessage(new ReadOnlyError(), "Número incorrecto")).toBe(READ_ONLY_MESSAGE);
    expect(checkinErrorMessage(new Error("socket failure"), "No pudimos confirmar la entrada")).toBe("No pudimos confirmar la entrada");
  });
  it("registra por número y no ofrece la autorización de un socio vencido", async () => {
    vi.mocked(api.post).mockResolvedValue(expired);
    renderWithProviders(<MemoryRouter><CheckinPage /></MemoryRouter>);
    expect(screen.getByText("Recepción en solo lectura")).toBeVisible();
    expect(screen.getByRole("button", { name: "1" })).toBeEnabled();
    await userEvent.keyboard("0017{Enter}");
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/checkins/number", { member_number: 17 }, { retry: 0 }));
    await userEvent.keyboard("o");
    expect(screen.queryByText(t.page.overridePrompt)).not.toBeInTheDocument();
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
    expect(api.post).toHaveBeenCalledTimes(1);
  });
  it("deja buscar al socio para registrar su entrada", async () => {
    renderWithProviders(<MemoryRouter><CheckinPage /></MemoryRouter>);
    await userEvent.click(screen.getByRole("button", { name: "Buscar" }));
    expect(screen.getByRole("combobox")).toBeEnabled();
  });
  it("el kiosco sigue registrando entradas por número", async () => {
    vi.mocked(api.post).mockResolvedValue({ ...expired, result: "allowed_active", days_until_expiry: 20 });
    renderWithProviders(<MemoryRouter><KioskPage /></MemoryRouter>);
    expect(screen.queryByText(/Pide ayuda en recepción/)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "1" })).toBeEnabled();
    await userEvent.keyboard("0017");
    await waitFor(() => expect(api.post).toHaveBeenCalledWith("/api/v1/checkins/number", { member_number: 17 }, { retry: 0 }));
  });
  it("bloquea también el envío directo de la autorización manual", () => {
    renderWithProviders(<OverrideDialog open memberId="m1" memberName="Ana Ejemplo" onOpenChange={vi.fn()} onSuccess={vi.fn()} />);
    const submit = screen.getByRole("button", { name: "Permitir entrada" });
    expect(submit).toBeDisabled();
    fireEvent.submit(submit.closest("form")!);
    expect(api.post).not.toHaveBeenCalled();
  });
});
