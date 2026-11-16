import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { useState } from "react";
import userEvent from "@testing-library/user-event";
import { useAuthStore } from "@/stores/useAuthStore";
import { api } from "@/lib/api";
import { renderWithProviders } from "@/test/utils";
import { ReceiptViewer } from "../ReceiptViewer";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      blob: vi.fn(async () => ({
        blob: new Blob(["fake-pdf"], { type: "application/pdf" }),
        filename: "comprobante.pdf",
      })),
    },
  };
});

describe("ReceiptViewer", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({ readOnly: false });
    if (!URL.createObjectURL) {
      // jsdom shim
      URL.createObjectURL = vi.fn(() => "blob:fake");
      URL.revokeObjectURL = vi.fn();
    }
  });

  it("renderiza un iframe con el blob URL del PDF", async () => {
    renderWithProviders(
      <ReceiptViewer paymentId="pay-1" folio="MEM-000087" open onOpenChange={() => {}} />
    );

    await waitFor(() => {
      const iframe = document.querySelector("iframe");
      expect(iframe).not.toBeNull();
      expect(iframe?.getAttribute("src")).toMatch(/^blob:/);
    });

    expect(screen.getByRole("button", { name: /descargar/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /imprimir/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /enviar por whatsapp/i })).toBeInTheDocument();
  });

  it("permite consultar el comprobante sin permitir envíos en solo lectura", async () => {
    useAuthStore.setState({ readOnly: true });
    renderWithProviders(<ReceiptViewer paymentId="pay-1" open onOpenChange={() => {}} />);
    await waitFor(() => expect(screen.getByRole("button", { name: /descargar/i })).toBeEnabled());
    expect(screen.getByRole("button", { name: /imprimir/i })).toBeEnabled();
    const send = screen.getByRole("button", { name: /enviar por whatsapp/i });
    expect(send).toBeDisabled();
    await userEvent.click(send);
    expect(api.post).not.toHaveBeenCalled();
    expect(screen.getByText(/la recepción está en solo lectura/)).toBeVisible();
  });

  it("Escape cierra el comprobante y devuelve el foco al botón que lo abrió", async () => {
    function Harness() {
      const [open, setOpen] = useState(false);
      return <>
        <button onClick={event => { event.currentTarget.focus(); setOpen(true); }}>Ver comprobante</button>
        <ReceiptViewer paymentId="pay-1" folio="MEM-000087" open={open} onOpenChange={setOpen} />
      </>;
    }
    renderWithProviders(<Harness />);
    const opener = screen.getByRole("button", { name: "Ver comprobante" });
    await userEvent.click(opener);
    expect(screen.getByRole("dialog", { name: /MEM-000087/ })).toBeVisible();
    await userEvent.keyboard("{Escape}");
    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    await waitFor(() => expect(opener).toHaveFocus());
  });
});
