import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { LockExpiryModal } from "../LockExpiryModal";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(async () => ({ membership_id: "m1", previous_expiry: "2026-05-12", new_expiry: "2026-05-26", days_added: 14 })),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("LockExpiryModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("requires a reason of at least 5 chars", async () => {
    const user = userEvent.setup();
    renderWithProviders(
      <LockExpiryModal
        membershipId="m1"
        memberName="Juan"
        currentExpiry="2026-05-12"
        open
        onOpenChange={() => {}}
      />
    );

    await user.click(screen.getByRole("button", { name: /guardar ajuste/i }));

    expect(
      await screen.findByText(/escribe una razón \(mínimo 5 caracteres\)/i)
    ).toBeInTheDocument();
  });

  it("submits when valid", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <LockExpiryModal
        membershipId="m1"
        memberName="Juan"
        currentExpiry="2026-05-12"
        open
        onOpenChange={onOpenChange}
      />
    );

    const reason = screen.getByLabelText(/razón/i);
    await user.type(reason, "Cortesía COVID");
    await user.click(screen.getByRole("button", { name: /guardar ajuste/i }));

    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
