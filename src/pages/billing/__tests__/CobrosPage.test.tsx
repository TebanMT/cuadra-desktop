import { beforeEach, describe, expect, it, vi } from "vitest";
import { screen, within } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import { api } from "@/lib/api";
import { todayIso } from "@/lib/dates";
import { billing as t } from "@/strings/billing";
import CobrosPage from "../CobrosPage";

const totals = { total_paid: 1250, refund_total: 0, cash_total: 500, transfer_total: 750, card_total: 0 };
vi.mock("@/lib/api", async () => ({
  ...await vi.importActual<typeof import("@/lib/api")>("@/lib/api"),
  api: { get: vi.fn(), post: vi.fn(), patch: vi.fn(), put: vi.fn(), delete: vi.fn() },
}));
// The page's dialogs stay closed here; keep their own data out of the test.
vi.mock("@/components/billing/PaymentModal", () => ({ PaymentModal: () => null }));
vi.mock("@/components/billing/OtherIncomeDialog", () => ({ OtherIncomeDialog: () => null }));
vi.mock("@/components/billing/ReceiptViewer", () => ({ ReceiptViewer: () => null }));
vi.mock("@/components/billing/RefundModal", () => ({ RefundModal: () => null }));
vi.mock("@/components/billing/PaymentCorrectionModal", () => ({ PaymentCorrectionModal: () => null }));
vi.mock("@/components/sales/SaleCorrectionModal", () => ({ SaleCorrectionModal: () => null }));
vi.mock("@/components/sales/ProductRefundModal", () => ({ ProductRefundModal: () => null }));
vi.mock("@/components/checkin/MemberSearchInput", () => ({ MemberSearchInput: () => null }));

function signIn(role: "owner" | "operator", permissions: string[]) {
  useAuthStore.setState({ readOnly: false, user: { user_id: "u1", role, permissions } as never });
}
function show(path: string, state?: unknown) {
  return renderWithProviders(<MemoryRouter initialEntries={[{ pathname: path.split("?")[0], search: path.includes("?") ? `?${path.split("?")[1]}` : "", state }]}><CobrosPage /></MemoryRouter>);
}
const paymentCalls = () => vi.mocked(api.get).mock.calls.filter(([path]) => path === "/api/v1/payments");

beforeEach(() => {
  vi.clearAllMocks();
});

describe("Cobros y el permiso de ver totales", () => {
  it("sin el permiso sólo pide hoy, sin periodos ni resumen", async () => {
    signIn("operator", []);
    // The backend leaves the totals out for this operator.
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });
    show("/billing?period=month&from=2026-01-01&to=2026-01-31");

    expect(await screen.findByText(t.cobranza.empty.todayTitle)).toBeInTheDocument();
    const today = todayIso();
    for (const [, options] of paymentCalls()) {
      expect((options as { query: Record<string, unknown> }).query).toMatchObject({ from: today, to: today });
    }
    // Only today exists for this operator: the subtitle says it, no lone pill.
    expect(screen.getByText(t.cobranza.todayOnly.subtitle)).toBeInTheDocument();
    for (const name of ["Hoy", "7 días", "30 días", "Rango"]) {
      expect(screen.queryByRole("button", { name })).not.toBeInTheDocument();
    }
    expect(screen.getByRole("note")).toHaveTextContent("Ves solo los cobros de hoy, sin totales. Requiere el permiso «Ver totales de dinero». Pídeselo al dueño.");
    expect(screen.queryByLabelText("Resumen del período")).not.toBeInTheDocument();
    expect(screen.queryByText("Total cobrado")).not.toBeInTheDocument();
  });

  it("con el permiso conserva los periodos y el resumen del período", async () => {
    signIn("operator", ["view_totals"]);
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50, ...totals });
    show("/billing?period=month");

    expect(await screen.findByLabelText("Resumen del período")).toBeInTheDocument();
    expect(screen.getByText("Total cobrado")).toBeInTheDocument();
    for (const name of ["Hoy", "7 días", "30 días", "Rango"]) {
      expect(screen.getByRole("button", { name })).toBeInTheDocument();
    }
    expect(screen.queryByRole("note")).not.toBeInTheDocument();
    const [, options] = paymentCalls().at(-1)!;
    expect((options as { query: { from: string } }).query.from).not.toBe(todayIso());
  });

  it("no pinta totales en $0 si la respuesta no los trae", async () => {
    // A session saved before permissions existed: the UI lets the backend decide.
    useAuthStore.setState({ readOnly: false, user: { user_id: "u1", role: "operator" } as never });
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });
    show("/billing");
    expect(await screen.findByText(t.cobranza.empty.todayTitle)).toBeInTheDocument();
    expect(screen.queryByLabelText("Resumen del período")).not.toBeInTheDocument();
  });
});

const payment = {
  id: "pay-1", version: 1, gym_id: "g1", member_id: "m1", member_name: "Socia de prueba", amount: 500,
  payment_method: "transfer", concept: "membership", reference: "F-1", balance_pending: 0,
  payment_date: "2026-11-13", operator_id: "u2", operator_name: "Operador de prueba", created_at: "2026-11-13T18:42:00",
};

describe("Tabla de Ingresos compacta", () => {
  it("pone fecha y hora en una línea, el operador bajo el concepto y acciones con nombre", async () => {
    signIn("owner", []);
    vi.mocked(api.get).mockResolvedValue({ items: [payment], total: 1, page: 1, page_size: 50, ...totals });
    show("/billing");

    const row = (await screen.findByText("Socia de prueba")).closest("tr")!;
    expect(within(row).getByText("13 nov · 18:42")).toHaveClass("whitespace-nowrap");
    expect(within(row).getByText("Membresía · Registró Operador de prueba")).toBeInTheDocument();
    expect(within(row).getByText("Transferencia")).toBeInTheDocument();
    for (const name of ["Corregir cobro de Socia de prueba", "Devolver cobro de Socia de prueba", "Ver comprobante de Socia de prueba"]) {
      const button = within(row).getByRole("button", { name });
      expect(button).toHaveClass("h-11", "w-11");
      expect(button).toHaveAttribute("title");
    }
    // No separate time or operator columns that push «Corregir» off-screen.
    expect(screen.queryByRole("columnheader", { name: "Hora" })).not.toBeInTheDocument();
    expect(screen.queryByRole("columnheader", { name: "Operador" })).not.toBeInTheDocument();
  });

  it("el vacío de ventas de productos lleva a Venta rápida, no a cobrar a un socio", async () => {
    signIn("operator", []);
    vi.mocked(api.get).mockResolvedValue({ items: [], total: 0, page: 1, page_size: 50 });
    show("/billing?concept=product", { from: "sales" });

    expect(await screen.findByRole("link", { name: "Ir a Venta rápida" })).toHaveAttribute("href", "/sales");
    // Only the header keeps «Cobrar a un socio».
    expect(screen.getAllByRole("button", { name: t.cobranza.chargeMember })).toHaveLength(1);
    expect(screen.getByRole("link", { name: "Volver a Venta rápida" })).toHaveAttribute("href", "/sales");
  });
});
