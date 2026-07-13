import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { CheckoutModal } from "../CheckoutModal";

// El modal no llama la API directamente: recibe onConfirm (la página es
// dueña del POST /sales). Aquí se fija el CONTRATO de ese callback —
// método correcto y `paid` sólo cuando de verdad queda saldo — más las
// validaciones de fiado que antes vivían sueltas en la página.

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(async () => ({ items: [] })),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      blob: vi.fn(),
    },
  };
});

const MEMBER = { member_id: "m1", full_name: "Rosa Robles", phone: "+525511122233" };

function renderModal(overrides: Partial<Parameters<typeof CheckoutModal>[0]> = {}) {
  const onConfirm = vi.fn(async () => {});
  const props = {
    open: true,
    onOpenChange: vi.fn(),
    total: 180,
    itemCount: 3,
    member: null,
    onMemberChange: vi.fn(),
    submitting: false,
    onConfirm,
    ...overrides,
  };
  renderWithProviders(<CheckoutModal {...props} />);
  return { onConfirm, props };
}

describe("CheckoutModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("efectivo por default: confirma con method=cash y sin paid", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.click(screen.getByRole("button", { name: /Confirmar — cobrar/ }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({ method: "cash" })
    );
  });

  it("tarjeta: confirma con method=card", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal();

    await user.click(screen.getByRole("button", { name: "Tarjeta" }));
    await user.click(screen.getByRole("button", { name: /Confirmar — cobrar/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ method: "card" }));
  });

  it("fiado sin socio: pide asociar y NO confirma", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal({ member: null });

    await user.click(screen.getByRole("button", { name: "Fiado" }));
    // Sin socio el pane muestra el asociador y el CTA queda deshabilitado.
    expect(screen.getByText(/¿A quién se lo fías\?/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Confirmar — cobrar/ })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("fiado parcial: manda paid y el método de lo cobrado ahora", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal({ member: MEMBER });

    await user.click(screen.getByRole("button", { name: "Fiado" }));
    await user.type(screen.getByLabelText(/Cuánto te deja ahora/i), "100");
    // "Queda a deber" refleja el faltante en vivo.
    expect(screen.getByText(/Queda a deber/)).toBeInTheDocument();

    await user.click(screen.getByRole("button", { name: /Confirmar — cobrar/ }));
    await waitFor(() =>
      expect(onConfirm).toHaveBeenCalledWith({ method: "cash", paid: 100 })
    );
  });

  it("fiado pagando el total: degrada a venta normal (sin paid)", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal({ member: MEMBER });

    await user.click(screen.getByRole("button", { name: "Fiado" }));
    await user.type(screen.getByLabelText(/Cuánto te deja ahora/i), "180");
    await user.click(screen.getByRole("button", { name: /Confirmar — cobrar/ }));
    await waitFor(() => expect(onConfirm).toHaveBeenCalledWith({ method: "cash" }));
  });

  it("fiado con monto mayor al total queda deshabilitado", async () => {
    const user = userEvent.setup();
    const { onConfirm } = renderModal({ member: MEMBER });

    await user.click(screen.getByRole("button", { name: "Fiado" }));
    await user.type(screen.getByLabelText(/Cuánto te deja ahora/i), "500");
    expect(screen.getByRole("button", { name: /Confirmar — cobrar/ })).toBeDisabled();
    expect(onConfirm).not.toHaveBeenCalled();
  });

  it("error del onConfirm se muestra sin cerrar el modal", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderModal({
      onOpenChange,
      onConfirm: vi.fn(async () => {
        throw new Error("boom");
      }),
    });

    await user.click(screen.getByRole("button", { name: /Confirmar — cobrar/ }));
    expect(await screen.findByText(/No pudimos registrar la venta/i)).toBeInTheDocument();
    expect(onOpenChange).not.toHaveBeenCalledWith(false);
  });
});
