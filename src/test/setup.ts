import "@testing-library/jest-dom/vitest";
import { vi, afterEach } from "vitest";
import { cleanup } from "@testing-library/react";

afterEach(() => cleanup());

if (typeof globalThis.ResizeObserver === "undefined") {
  // @ts-expect-error minimal shim for jsdom
  globalThis.ResizeObserver = class {
    observe() {}
    unobserve() {}
    disconnect() {}
  };
}

if (typeof window !== "undefined" && !window.matchMedia) {
  Object.defineProperty(window, "matchMedia", {
    writable: true,
    value: vi.fn().mockImplementation((query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addListener: vi.fn(),
      removeListener: vi.fn(),
      addEventListener: vi.fn(),
      removeEventListener: vi.fn(),
      dispatchEvent: vi.fn(),
    })),
  });
}

if (typeof window !== "undefined" && !window.HTMLElement.prototype.scrollIntoView) {
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
}

if (typeof window !== "undefined" && !window.HTMLElement.prototype.hasPointerCapture) {
  // @ts-expect-error radix-select probes for this in jsdom
  window.HTMLElement.prototype.hasPointerCapture = vi.fn();
  // @ts-expect-error radix-select probes for this in jsdom
  window.HTMLElement.prototype.releasePointerCapture = vi.fn();
}

vi.mock("@tauri-apps/plugin-dialog", () => ({
  open: vi.fn(async () => null),
}));
