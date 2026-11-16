import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { SidecarFailed } from "../SidecarFailed";

vi.mock("@/lib/tauri-bridge", () => ({ quitApp: vi.fn() }));

describe("Pantalla de arranque", () => {
  it("el arranque normal no suena a falla ni usa jerga", () => {
    render(<SidecarFailed state="loading" />);
    expect(screen.getByRole("heading", { name: "Abriendo Tinta…" })).toBeInTheDocument();
    expect(screen.getByText("Preparando la recepción…")).toBeInTheDocument();
    expect(screen.queryByText(/reinici/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/motor local/i)).not.toBeInTheDocument();
    expect(screen.queryByRole("button")).not.toBeInTheDocument();
  });

  it("el reinicio real se nombra como reinicio", () => {
    render(<SidecarFailed state="restarting" />);
    expect(screen.getByRole("heading", { name: "Tinta se está reiniciando…" })).toBeInTheDocument();
  });

  it("la falla dice qué pasó y ofrece las dos salidas", () => {
    render(<SidecarFailed state="failed" />);
    expect(screen.getByRole("alert")).toHaveTextContent("Tinta no pudo abrir la recepción");
    expect(screen.getByRole("alert")).toHaveTextContent("Pulsa «Reintentar»");
    expect(screen.getByRole("button", { name: "Reintentar" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cerrar Tinta" })).toBeInTheDocument();
  });
});
