import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { MemberForm } from "../MemberForm";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(async () => [
        {
          id: "p1",
          name: "Mensual",
          price: 500,
          duration_days: 30,
          enrollment_fee: 0,
          maintenance_fee: 0,
          active: true,
        },
      ]),
      post: vi.fn(),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("MemberForm", () => {
  beforeEach(() => vi.clearAllMocks());

  it("flags missing name on submit", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <MemberForm
        mode="create"
        submitting={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /guardar socio/i }));

    expect(await screen.findByText(/el nombre debe tener entre 3 y 100/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("flags invalid phone (less than 10 digits)", async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    renderWithProviders(
      <MemberForm
        mode="create"
        submitting={false}
        onSubmit={onSubmit}
        onCancel={() => {}}
      />
    );

    await user.type(screen.getByLabelText(/nombre completo/i), "Juan Pérez");
    await user.type(screen.getByLabelText(/teléfono/i), "12345");
    await user.click(screen.getByRole("button", { name: /guardar socio/i }));

    expect(await screen.findByText(/necesito 10 dígitos/i)).toBeInTheDocument();
    expect(onSubmit).not.toHaveBeenCalled();
  });
});
