import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen, waitFor } from "@testing-library/react";
import { renderWithProviders } from "@/test/utils";
import { AssignPinModal } from "../AssignPinModal";

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: vi.fn(async () => ({ member_id: "m1", pin: "4729" })),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
    },
  };
});

describe("AssignPinModal", () => {
  beforeEach(() => vi.clearAllMocks());

  it("auto-generates and displays the pin on open", async () => {
    renderWithProviders(
      <AssignPinModal memberId="m1" memberName="Juan" open onOpenChange={() => {}} />
    );
    await waitFor(() => expect(screen.getByText("4729")).toBeInTheDocument());
    expect(screen.getByText(/PIN de Juan/i)).toBeInTheDocument();
  });
});
