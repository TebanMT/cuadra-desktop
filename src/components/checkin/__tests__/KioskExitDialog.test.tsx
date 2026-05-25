import { describe, it, expect, vi, beforeEach } from "vitest";
import { screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { renderWithProviders } from "@/test/utils";
import { KioskExitDialog } from "../KioskExitDialog";
import { ApiError } from "@/lib/api";

const postMock = vi.fn();

vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return {
    ...actual,
    api: {
      get: vi.fn(),
      post: (...args: unknown[]) => postMock(...args),
      patch: vi.fn(),
      put: vi.fn(),
      delete: vi.fn(),
      blob: vi.fn(),
    },
  };
});

describe("KioskExitDialog — error differentiation", () => {
  beforeEach(() => {
    postMock.mockReset();
  });

  it("happy path: contraseña correcta dispara onAuthorized y cierra el diálogo", async () => {
    postMock.mockResolvedValueOnce({ ok: true });
    const onAuthorized = vi.fn();
    const onOpenChange = vi.fn();
    const user = userEvent.setup();

    renderWithProviders(
      <KioskExitDialog open onOpenChange={onOpenChange} onAuthorized={onAuthorized} />
    );

    await user.type(screen.getByLabelText(/Contraseña/i), "secret-123");
    await user.click(screen.getByRole("button", { name: /^Salir$/ }));

    await vi.waitFor(() => {
      expect(onAuthorized).toHaveBeenCalledTimes(1);
      expect(onOpenChange).toHaveBeenCalledWith(false);
    });
  });

  it("401 invalid_credentials → 'Contraseña incorrecta'", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(401, "auth.verify.errors.invalid_credentials", "invalid")
    );
    const user = userEvent.setup();

    renderWithProviders(
      <KioskExitDialog open onOpenChange={() => {}} onAuthorized={() => {}} />
    );

    await user.type(screen.getByLabelText(/Contraseña/i), "wrong");
    await user.click(screen.getByRole("button", { name: /^Salir$/ }));

    expect(await screen.findByText(/Contraseña incorrecta/)).toBeInTheDocument();
  });

  // El sidecar nunca tuvo un login con internet → no hay password_hash
  // que comparar. Distinto de "contraseña incorrecta": orientar al operador
  // a conectarse, no a reescribir el password.
  it("401 no_cache → mensaje específico de 'inicia sesión con internet'", async () => {
    postMock.mockRejectedValueOnce(
      new ApiError(401, "auth.verify.errors.no_cache", "no cache")
    );
    const user = userEvent.setup();

    renderWithProviders(
      <KioskExitDialog open onOpenChange={() => {}} onAuthorized={() => {}} />
    );

    await user.type(screen.getByLabelText(/Contraseña/i), "anything");
    await user.click(screen.getByRole("button", { name: /^Salir$/ }));

    expect(await screen.findByText(/Inicia sesión una vez con internet/i)).toBeInTheDocument();
    // Aseguramos que NO mostramos "Contraseña incorrecta" (sería confuso).
    expect(screen.queryByText(/Contraseña incorrecta/)).not.toBeInTheDocument();
  });

  // El proceso del sidecar no responde (TypeError de fetch, abort, timeout).
  // Pre-fix mostrábamos "Contraseña incorrecta" — el operador re-tecleaba
  // password y se frustraba.
  it("non-ApiError (sidecar caído) → mensaje 'sin conexión, reintenta'", async () => {
    postMock.mockRejectedValueOnce(new TypeError("fetch failed"));
    const user = userEvent.setup();

    renderWithProviders(
      <KioskExitDialog open onOpenChange={() => {}} onAuthorized={() => {}} />
    );

    await user.type(screen.getByLabelText(/Contraseña/i), "any");
    await user.click(screen.getByRole("button", { name: /^Salir$/ }));

    expect(await screen.findByText(/No logro contactar al sistema/i)).toBeInTheDocument();
  });

  it("ApiError genérico (500 server) → mensaje genérico, no 'contraseña incorrecta'", async () => {
    postMock.mockRejectedValueOnce(new ApiError(500, "internal", "boom"));
    const user = userEvent.setup();

    renderWithProviders(
      <KioskExitDialog open onOpenChange={() => {}} onAuthorized={() => {}} />
    );

    await user.type(screen.getByLabelText(/Contraseña/i), "any");
    await user.click(screen.getByRole("button", { name: /^Salir$/ }));

    expect(await screen.findByText(/No pude validar la contraseña/i)).toBeInTheDocument();
    expect(screen.queryByText(/Contraseña incorrecta/)).not.toBeInTheDocument();
  });
});
