import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { SyncIndicator } from "../SyncIndicator";
import { useSyncStatus, type SyncStatus } from "@/hooks/useSyncStatus";

vi.mock("@/hooks/useSyncStatus", async (importOriginal) => ({
  ...await importOriginal<typeof import("@/hooks/useSyncStatus")>(),
  useSyncStatus: vi.fn(),
  useTriggerSync: () => ({ mutate: vi.fn(), isPending: false }),
}));

function show(state: SyncStatus["state"], pending: number, busy = false) {
  vi.mocked(useSyncStatus).mockReturnValue({ data: {
    state, queue_pending_count: pending, last_synced_at: null, last_error: "test-only diagnostic", sync_in_progress: busy,
  } } as ReturnType<typeof useSyncStatus>);
  return render(<MemoryRouter><SyncIndicator /></MemoryRouter>);
}

describe("Synchronization status copy", () => {
  it("animates the action and blocks another click while the agent works", () => {
    show("online", 0, true);
    const action = screen.getByRole("button", { name: "Sincronizando…" });
    expect(action).toBeDisabled();
    expect(action).toHaveAttribute("aria-busy", "true");
    expect(action.querySelector("svg")).toHaveClass("animate-spin");
  });
  it.each(["online", "offline_short", "sync_error"] as const)("stops the animation when the attempt ends in %s", state => {
    show(state, 0);
    const action = screen.getByRole("button", { name: "Sincronizar ahora" });
    expect(action).toBeEnabled();
    expect(action).toHaveAttribute("aria-busy", "false");
    expect(action.querySelector("svg")).not.toHaveClass("animate-spin");
  });
  it("does not claim changes are synchronized while they are pending", () => {
    show("online", 3);
    expect(screen.getByText("Cambios pendientes")).toBeInTheDocument();
    expect(screen.queryByText("Sincronizado")).not.toBeInTheDocument();
  });
  it("shows a short disconnection without hiding the pending changes or diagnosis", () => {
    show("offline_short", 3);
    expect(screen.getByText("Sin conexión")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Estado de sincronización" }));
    expect(screen.getByText("3")).toBeInTheDocument();
    expect(screen.getByText("test-only diagnostic").closest("details")).not.toHaveAttribute("open");
    expect(screen.getByText(/Puedes seguir trabajando/)).toBeInTheDocument();
  });
});
