import { describe, it, expect, vi, beforeEach } from "vitest";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "@/stores/useAuthStore";
import { screen, waitFor } from "@testing-library/react";
import { MemoryRouter, useLocation } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import MembersPage from "../MembersPage";

const { mockGet, rowState } = vi.hoisted(() => {
const rowState: { access: string; status: string; membership: boolean; phone: string; photo?: string; expiry: string } = { access: "allowed_active", status: "active", membership: true, phone: "4421234567", expiry: "2026-05-01" };
return {
rowState,
  mockGet: vi.fn(async (url: string, opts?: { query?: Record<string, unknown> }) => {
  if (url === "/api/v1/membership-types") {
    return [];
  }
  if (url === "/api/v1/members") {
    // Conteos de los filtros: page_size 1. El listado real usa otro tamaño.
    const isCount = opts?.query?.page_size === 1;
    if (isCount && opts?.query?.status === "active") {
      return { items: [], total: 5, page: 1, page_size: 1 };
    }
    if (isCount && opts?.query?.status === "expiring_soon") {
      return { items: [], total: 2, page: 1, page_size: 1 };
    }
    if (isCount && opts?.query?.status === "expired") {
      return { items: [], total: 0, page: 1, page_size: 1 };
    }
    if (isCount && opts?.query?.status === "inactive") {
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
            phone: rowState.phone,
            photo_url: rowState.photo,
            status: rowState.status,
            enrollment_paid: true,
            has_member_number: false,
            created_at: "2026-03-01T00:00:00Z",
          },
          current_membership: rowState.membership ? {
            id: "ms1",
            membership_type_id: "p1",
            type_name: "Mensual",
            price: 500,
            start_date: "2026-04-01",
            expiry_date: rowState.expiry,
            status: rowState.status,
            duration_days_snapshot: 30,
          } : null,
          access_status: rowState.access,
        },
      ],
      total: 8,
      page: 1,
      page_size: 25,
    };
  }
  return null;
}),
}; });

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { get: mockGet, post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
  };
});

function Destination() { const location = useLocation(); return <output data-testid="destination">{location.pathname}{location.search}</output>; }

describe("MembersPage", () => {
  beforeEach(() => {
    mockGet.mockClear();
    rowState.access = "allowed_active"; rowState.status = "active"; rowState.membership = true;
    rowState.phone = "4421234567"; rowState.photo = undefined; rowState.expiry = "2026-05-01";
    useAuthStore.setState({ readOnly: false });
  });

  it("renders fetched members and shows status counts", async () => {
    renderWithProviders(
      <MemoryRouter>
        <MembersPage />
      </MemoryRouter>
    );

    expect(await screen.findByText("Juan Pérez")).toBeInTheDocument();
    expect(screen.getByText("Mensual")).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getAllByText("8").length).toBeGreaterThan(0);
      expect(screen.getAllByText("5").length).toBeGreaterThan(0);
      expect(screen.getAllByText("2").length).toBeGreaterThan(0);
    });
  });
  it("abre el primer cobro desde Activar membresía y la ficha desde el nombre", async () => {
    rowState.access = "denied_no_membership"; rowState.membership = false;
    const user = userEvent.setup();
    renderWithProviders(<MemoryRouter><MembersPage /><Destination /></MemoryRouter>);
    await user.click(await screen.findByRole("button", { name: "Activar membresía de Juan Pérez" }));
    expect(screen.getByTestId("destination")).toHaveTextContent("/members/m1?action=pay");
    await user.click(screen.getByRole("link", { name: "Juan Pérez" }));
    expect(screen.getByTestId("destination").textContent).toBe("/members/m1");
  });

  it("no ofrece activar a un socio inactivo", async () => {
    rowState.access = "denied_inactive"; rowState.status = "inactive"; rowState.membership = false;
    renderWithProviders(<MemoryRouter><MembersPage /></MemoryRouter>);
    await screen.findByText("Juan Pérez");
    expect(screen.queryByRole("button", { name: /Activar membresía/ })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /^Cobrar/ })).not.toBeInTheDocument();
  });

  it("deshabilita la activación en solo lectura", async () => {
    rowState.access = "denied_no_membership"; rowState.membership = false;
    useAuthStore.setState({ readOnly: true });
    renderWithProviders(<MemoryRouter><MembersPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Activar membresía de Juan Pérez" })).toBeDisabled();
  });

  it("la vigencia de un vencido dice «Vencido» con el plazo, sin «Vence 1 oct»", async () => {
    rowState.access = "denied_expired"; rowState.expiry = "2020-01-15";
    renderWithProviders(<MemoryRouter><MembersPage /></MemoryRouter>);
    await screen.findByText("Juan Pérez");
    expect(screen.getByText("Vencido")).toBeInTheDocument();
    expect(screen.getByText(/^hace \d+ días$/)).toBeInTheDocument();
    expect(screen.queryByText(/^Vence /)).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cobrar a Juan Pérez" })).toBeEnabled();
  });

  it("no ofrece WhatsApp si el teléfono no tiene dígitos", async () => {
    rowState.phone = "—";
    renderWithProviders(<MemoryRouter><MembersPage /></MemoryRouter>);
    await screen.findByText("Juan Pérez");
    expect(screen.queryByRole("link", { name: /WhatsApp/ })).not.toBeInTheDocument();
  });

  it("abre WhatsApp con código de país cuando hay teléfono", async () => {
    renderWithProviders(<MemoryRouter><MembersPage /></MemoryRouter>);
    expect(await screen.findByRole("link", { name: "Abrir WhatsApp de Juan Pérez" })).toHaveAttribute("href", "https://wa.me/524421234567");
  });

  it("sin foto registrada no pide la foto ni anuncia «Ver foto de…»", async () => {
    renderWithProviders(<MemoryRouter><MembersPage /></MemoryRouter>);
    await screen.findByText("Juan Pérez");
    expect(screen.queryByRole("button", { name: /Ver foto de/ })).not.toBeInTheDocument();
    expect(document.querySelector("img")).toBeNull();
  });

  it("con foto registrada ofrece verla", async () => {
    rowState.photo = "members/m1.jpg";
    renderWithProviders(<MemoryRouter><MembersPage /></MemoryRouter>);
    expect(await screen.findByRole("button", { name: "Ver foto de Juan Pérez" })).toBeInTheDocument();
  });

  it("Todos abre ordenado por nombre, con etiquetas de orden en palabras", async () => {
    renderWithProviders(<MemoryRouter><MembersPage /></MemoryRouter>);
    await screen.findByText("Juan Pérez");
    expect(mockGet).toHaveBeenCalledWith("/api/v1/members", expect.objectContaining({ query: expect.objectContaining({ sort: "name", dir: "asc", page_size: 25 }) }));
    expect(screen.getByRole("combobox", { name: "Ordenar socios" })).toHaveTextContent("Nombre A–Z");
    expect(document.body.textContent).not.toMatch(/[↑↓]/);
  });

  it("Sin vigencia nombra lo que incluye y pone primero a quien venció hace menos", async () => {
    renderWithProviders(<MemoryRouter initialEntries={["/members?status=expired"]}><MembersPage /></MemoryRouter>);
    await screen.findByText("Juan Pérez");
    expect(screen.getByRole("button", { name: /^Sin vigencia/, pressed: true })).toBeInTheDocument();
    // «Vencidos» existe aparte y no está activo: «Sin vigencia» es la suma de los tres casos.
    expect(screen.getByRole("button", { name: /^Vencidos/, pressed: false })).toBeInTheDocument();
    expect(screen.getByText(/Vencidos, socios sin primer pago y socios sin membresía, juntos/)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/api/v1/members", expect.objectContaining({ query: expect.objectContaining({ status: "expired", sort: "expiry", dir: "desc", page_size: 25 }) }));
    expect(screen.getByRole("combobox", { name: "Ordenar socios" })).toHaveTextContent("Vencieron hace menos");
  });

  it("separa los casos sin vigencia en filtros propios, cada uno con su explicación", async () => {
    renderWithProviders(<MemoryRouter initialEntries={["/members?status=lapsed"]}><MembersPage /></MemoryRouter>);
    await screen.findByText("Juan Pérez");
    expect(screen.getByRole("button", { name: /^Vencidos/, pressed: true })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sin membresía/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /^Sin primer pago/ })).toBeInTheDocument();
    expect(screen.getByText(/Cobra la renovación/)).toBeInTheDocument();
    expect(mockGet).toHaveBeenCalledWith("/api/v1/members", expect.objectContaining({ query: expect.objectContaining({ status: "lapsed", sort: "expiry", dir: "desc" }) }));
    for (const status of ["lapsed", "no_membership", "unpaid_enrollment"]) {
      expect(mockGet).toHaveBeenCalledWith("/api/v1/members", expect.objectContaining({ query: expect.objectContaining({ status, page_size: 1 }) }));
    }
  });

});
