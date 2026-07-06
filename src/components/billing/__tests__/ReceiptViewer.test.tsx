import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
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
});
