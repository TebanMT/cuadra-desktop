import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { MemberStatusModal } from "../MemberStatusModal";

const { patch } = vi.hoisted(() => ({
  patch: vi.fn(async (_path: string, _body?: unknown) => ({ id: "m1", status: "inactive" })),
}));

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: { get: vi.fn(), post: vi.fn(), patch, put: vi.fn(), delete: vi.fn() },
  };
});

describe("MemberStatusModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits chosen status with reason", async () => {
    const user = userEvent.setup();
    const onOpenChange = vi.fn();
    renderWithProviders(
      <MemberStatusModal
        memberId="m1"
        memberName="Juan"
        currentStatus="active"
        open
        onOpenChange={onOpenChange}
      />
    );

    const reason = screen.getByLabelText(/razón/i);
    await user.type(reason, "Se mudó");

    await user.click(screen.getByRole("button", { name: /guardar cambio/i }));

    await waitFor(() => {
      expect(patch).toHaveBeenCalled();
    });
    const [path, body] = patch.mock.calls[0];
    expect(path).toBe("/api/v1/members/m1/status");
    expect(body).toEqual(expect.objectContaining({ status: "inactive", reason: "Se mudó" }));
    await waitFor(() => expect(onOpenChange).toHaveBeenCalledWith(false));
  });
});
