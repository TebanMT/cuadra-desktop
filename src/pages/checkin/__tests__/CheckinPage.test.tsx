import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import type { CheckinEvent } from "@/hooks/useCheckin";
import CheckinPage from "../CheckinPage";

const { recents, bio, methods } = vi.hoisted(() => ({
  recents: { items: [] as unknown[] },
  bio: { available: false },
  methods: { data: { number_available: true, manual_available: true } as unknown },
}));
vi.mock("@/lib/api", async () => ({ ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"), api: { post: vi.fn(), get: vi.fn(async () => []) } }));
vi.mock("@/hooks/useCheckin", async () => ({
  ...await vi.importActual<typeof import("@/hooks/useCheckin")>("@/hooks/useCheckin"),
  useCheckinMethods: () => methods,
  useRecentCheckins: () => ({ items: recents.items, failed: false, prepend: vi.fn() }),
}));
vi.mock("@/hooks/useBiometric", () => ({ useBiometricStatus: () => ({ data: { available: bio.available } }), useReaderMissing: () => false, useBiometricCheckinFeed: vi.fn() }));
vi.mock("@/hooks/useGym", () => ({ useCheckinFeedbackSettings: () => ({ ttlMs: 5000, volume: 0 }) }));
vi.mock("@/lib/audio", () => ({ playCheckinTone: vi.fn(), unlockAudio: vi.fn() }));

const entry = (id: string, at: Date, extra: Partial<CheckinEvent> = {}): CheckinEvent => ({
  id, result: "allowed_active", method: "number", member_id: id, member_name: `Socio ${id}`,
  expiry_date: "2026-12-03", days_until_expiry: 19, manual_override: false, created_at: at.toISOString(), ...extra,
});

function mount() {
  return renderWithProviders(<MemoryRouter><CheckinPage /></MemoryRouter>);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date(2026, 10, 14, 12, 0));
  useAuthStore.setState({ readOnly: false, user: { user_id: "u1", role: "owner" } as never });
  recents.items = []; bio.available = false;
  methods.data = { number_available: true, manual_available: true };
});
afterEach(() => vi.useRealTimers());

describe("Entradas", () => {
  it("abre en «Número» aunque la huella esté disponible: la huella entra igual", () => {
    bio.available = true;
    mount();
    expect(screen.getByRole("button", { name: "Número" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Huella" })).toHaveAttribute("aria-pressed", "false");
    expect(screen.getByText(/o pídele que ponga su huella/)).toBeInTheDocument();
  });

  it("no elige método mientras no sabe cuáles hay", () => {
    methods.data = undefined;
    mount();
    expect(screen.getByText("Consultando métodos de entrada…")).toBeInTheDocument();
    expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
  });

  it("«Últimas entradas» dice el día además de la hora, con el resultado en palabras", () => {
    recents.items = [
      entry("1", new Date(2026, 10, 14, 9, 5)),
      entry("2", new Date(2026, 10, 11, 21, 55), { result: "denied_expired", expiry_date: "2026-11-01", days_until_expiry: -10 }),
      entry("3", new Date(2025, 10, 11, 7, 0), { result: "allowed_override", manual_override: true }),
    ];
    mount();
    expect(screen.getByText("Hoy · 09:05")).toBeInTheDocument();
    expect(screen.getByText("11 nov · 21:55")).toBeInTheDocument();
    expect(screen.getByText("11 nov 2025 · 07:00")).toBeInTheDocument();
    expect(screen.getByText("Entrada registrada")).toBeInTheDocument();
    expect(screen.getByText("Acceso negado · Vencido")).toBeInTheDocument();
    expect(screen.getByText("Permitido por operador")).toBeInTheDocument();
  });
});
