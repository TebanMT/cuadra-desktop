import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import MembersPage from "../MembersPage";

const { mockGet } = vi.hoisted(() => ({
  mockGet: vi.fn(async (url: string, opts?: { query?: Record<string, unknown> }) => {
  if (url === "/api/v1/membership-types") {
    return [];
  }
  if (url === "/api/v1/members") {
    if (opts?.query?.status === "active") {
      return { items: [], total: 5, page: 1, page_size: 1 };
    }
    if (opts?.query?.status === "expiring_soon") {
      return { items: [], total: 2, page: 1, page_size: 1 };
    }
    if (opts?.query?.status === "expired") {
      return { items: [], total: 0, page: 1, page_size: 1 };
    }
    if (opts?.query?.status === "inactive") {
      return { items: [], total: 1, page: 1, page_size: 1 };
    }
    return {
      items: [
        {
          member: {
            id: "m1",
            gym_id: "g1",
            folio: "MEM-000001",
            full_name: "Juan Pérez",
            phone: "4421234567",
            status: "active",
            enrollment_paid: true,
            has_pin: false,
            created_at: "2026-03-01T00:00:00Z",
          },
          current_membership: {
            id: "ms1",
            membership_type_id: "p1",
            type_name: "Mensual",
            price: 500,
            start_date: "2026-04-01",
            expiry_date: "2026-05-01",
            status: "active",
            duration_days_snapshot: 30,
          },
          access_status: "allowed_active",
        },
      ],
      total: 8,
      page: 1,
      page_size: 25,
    };
  }
  return null;
}),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { get: mockGet, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

describe("MembersPage", () => {
  beforeEach(() => mockGet.mockClear());

  it("renders fetched members and shows status counts", async () => {
    renderWithProviders(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Mensual")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByText("8")).toBeInTheDocument();
      expect(screen.getByText("5")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument();
    });
  });
});
