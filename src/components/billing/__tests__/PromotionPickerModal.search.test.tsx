import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/usePromotions", () => ({ usePromotions: () => ({ data: [
  { id: "1", name: "PROMOCIÓN AÑO NUEVO", code: "ENERO10", kind: "percent", value: 10 },
  { id: "2", name: "Socios frecuentes", code: "SOCIOS5", kind: "percent", value: 5 },
] }), fetchPromotionByCode: vi.fn() }));
vi.mock("sonner", () => ({ toast: { success: vi.fn() } }));
import { PromotionPickerModal } from "../PromotionPickerModal";
describe("Selector de promociones", () => {
  it.each(["promoción", "PROMOCIÓN", "promocion", "año", "ano", "enero10"])("busca con %s sin modificar la promoción aplicada", term => {
    const apply = vi.fn();
    render(<PromotionPickerModal open onOpenChange={vi.fn()} target="sale" onApply={apply} />);
    fireEvent.change(screen.getByPlaceholderText("Buscar por nombre o código…"), { target: { value: term } });
    expect(screen.queryByText("Socios frecuentes")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /PROMOCIÓN AÑO NUEVO/ }));
    expect(apply).toHaveBeenCalledWith(expect.objectContaining({ id: "1", name: "PROMOCIÓN AÑO NUEVO", code: "ENERO10" }));
  });
});
