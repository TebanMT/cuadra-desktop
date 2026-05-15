import { describe, it, expect, vi } from "vitest";
import { render, fireEvent } from "@testing-library/react";
import { useHotkeys } from "../useHotkeys";

function Probe({
  onP,
  onEsc,
  enabled = true,
}: {
  onP: () => void;
  onEsc: () => void;
  enabled?: boolean;
}) {
  useHotkeys({ p: onP, Escape: onEsc }, enabled);
  return <div data-testid="probe">probe</div>;
}

describe("useHotkeys", () => {
  it("fires the handler when the matching key is pressed on window", () => {
    const onP = vi.fn();
    const onEsc = vi.fn();
    render(<Probe onP={onP} onEsc={onEsc} />);
    fireEvent.keyDown(window, { key: "p" });
    expect(onP).toHaveBeenCalledOnce();
    expect(onEsc).not.toHaveBeenCalled();
  });

  it("normalises capital letters via toLowerCase", () => {
    const onP = vi.fn();
    const onEsc = vi.fn();
    render(<Probe onP={onP} onEsc={onEsc} />);
    fireEvent.keyDown(window, { key: "P" });
    expect(onP).toHaveBeenCalledOnce();
  });

  it("handles Escape (multi-char key) without lowercasing", () => {
    const onP = vi.fn();
    const onEsc = vi.fn();
    render(<Probe onP={onP} onEsc={onEsc} />);
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onEsc).toHaveBeenCalledOnce();
  });

  it("skips when a modifier key is held (Cmd/Ctrl/Alt)", () => {
    const onP = vi.fn();
    const onEsc = vi.fn();
    render(<Probe onP={onP} onEsc={onEsc} />);
    fireEvent.keyDown(window, { key: "p", ctrlKey: true });
    fireEvent.keyDown(window, { key: "p", metaKey: true });
    fireEvent.keyDown(window, { key: "p", altKey: true });
    expect(onP).not.toHaveBeenCalled();
  });

  it("ignores key presses while an input is focused (except Escape)", () => {
    const onP = vi.fn();
    const onEsc = vi.fn();
    const { container } = render(
      <>
        <Probe onP={onP} onEsc={onEsc} />
        <input data-testid="input" />
      </>
    );
    const input = container.querySelector("input")!;
    input.focus();
    fireEvent.keyDown(input, { key: "p", bubbles: true });
    expect(onP).not.toHaveBeenCalled();
    fireEvent.keyDown(input, { key: "Escape", bubbles: true });
    expect(onEsc).toHaveBeenCalledOnce();
  });

  it("respects the enabled flag (no fire when disabled), and re-fires when re-enabled mid-life", () => {
    const onP = vi.fn();
    const onEsc = vi.fn();
    const { rerender } = render(<Probe onP={onP} onEsc={onEsc} enabled={false} />);
    fireEvent.keyDown(window, { key: "p" });
    expect(onP).not.toHaveBeenCalled();
    rerender(<Probe onP={onP} onEsc={onEsc} enabled={true} />);
    fireEvent.keyDown(window, { key: "p" });
    expect(onP).toHaveBeenCalledOnce();
  });

  it("picks up an updated handler ref between renders without missing keydowns", () => {
    const calls: string[] = [];
    function Wrapper({ id }: { id: string }) {
      useHotkeys({ p: () => calls.push(id) });
      return null;
    }
    const { rerender } = render(<Wrapper id="first" />);
    fireEvent.keyDown(window, { key: "p" });
    rerender(<Wrapper id="second" />);
    fireEvent.keyDown(window, { key: "p" });
    expect(calls).toEqual(["first", "second"]);
  });
});
