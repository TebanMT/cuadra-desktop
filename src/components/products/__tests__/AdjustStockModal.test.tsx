import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
const { adjust } = vi.hoisted(() => ({ adjust: vi.fn() }));
vi.mock("@/hooks/useProducts", () => ({ useAdjustStock: () => ({ mutateAsync: adjust, isPending: false }) }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { AdjustStockModal } from "../AdjustStockModal";
import type { Product } from "@/hooks/useProducts";
const product = { id: "water", name: "Agua", stock: -3 } as Product;
describe("Ajustar existencias", () => {
  beforeEach(() => { vi.clearAllMocks(); adjust.mockResolvedValue({ new_stock: 17 }); });
  it("corrige un conteo negativo sin registrar una compra ni un pago", async () => {
    render(<AdjustStockModal product={product} open onOpenChange={vi.fn()} />);
    expect(screen.queryByText(/Ya pagué|Costo por unidad|Registrar compra/)).not.toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Cuántas unidades tienes realmente"), { target: { value: "17" } });
    fireEvent.change(screen.getByLabelText("Motivo"), { target: { value: "Conteo físico" } });
    fireEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    await waitFor(() => expect(adjust).toHaveBeenCalledWith({ movement_type: "count", new_stock: 17, notes: "Conteo físico", idempotency_key: expect.any(String) }));
  });
  it("no interpreta una cantidad vacía como un conteo de cero", () => {
    render(<AdjustStockModal product={product} open onOpenChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Guardar ajuste" }));
    expect(screen.getByRole("alert")).toHaveTextContent("cantidad válida"); expect(adjust).not.toHaveBeenCalled();
  });
});
