import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { PaymentMethodsCard } from "../PaymentMethodsCard";
import { chosenPaymentMethods, paymentMethodsText, savedPaymentSelection } from "../paymentMethods";

const box = (name: string) => screen.getByRole("checkbox", { name });

describe("PaymentMethodsCard", () => {
  it("treats a gym with none saved as accepting every method, as the checkout does", () => {
    const all = savedPaymentSelection({ cash: false, transfer: false, card: false });
    expect(all).toEqual({ cash: true, transfer: true, card: true });
    expect(savedPaymentSelection({ cash: true, transfer: false, card: false })).toEqual({
      cash: true,
      transfer: false,
      card: false,
    });
  });

  it("names the chosen methods in reading order", () => {
    const selection = { cash: true, transfer: false, card: true };
    expect(chosenPaymentMethods(selection)).toEqual(["cash", "card"]);
    expect(paymentMethodsText(selection)).toBe("Efectivo, Tarjeta");
  });

  it("reports each toggle to the page, which owns the single save", async () => {
    const onToggle = vi.fn();
    render(
      <PaymentMethodsCard
        value={{ cash: true, transfer: false, card: false }}
        loadFailed={false}
        onRetry={vi.fn()}
        onToggle={onToggle}
        disabled={false}
      />,
    );
    expect(box("Efectivo")).toBeChecked();
    expect(box("Tarjeta")).not.toBeChecked();
    expect(screen.queryByRole("button", { name: /guardar/i })).not.toBeInTheDocument();

    await userEvent.setup().click(box("Tarjeta"));
    expect(onToggle).toHaveBeenCalledWith("card", true);
  });

  it("offers a retry instead of empty checkboxes when the saved methods fail to load", async () => {
    const onRetry = vi.fn();
    render(
      <PaymentMethodsCard value={null} loadFailed onRetry={onRetry} onToggle={vi.fn()} disabled={false} />,
    );
    expect(screen.getByText("No pudimos leer los métodos de pago.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
    await userEvent.setup().click(screen.getByRole("button", { name: "Reintentar" }));
    expect(onRetry).toHaveBeenCalled();
  });
});
