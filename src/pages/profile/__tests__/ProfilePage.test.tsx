import { beforeEach, describe, expect, it } from "vitest";
import { screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { renderWithProviders } from "@/test/utils";
import { useAuthStore } from "@/stores/useAuthStore";
import ProfilePage from "../ProfilePage";

function renderAs(user: Record<string, unknown>) {
  useAuthStore.setState({ readOnly: false, user: user as never, gym: { id: "g1", name: "Gimnasio Ejemplo" } as never });
  return renderWithProviders(<MemoryRouter><ProfilePage /></MemoryRouter>);
}

// Datos ficticios.
beforeEach(() => useAuthStore.setState({ user: null }));

describe("Mi perfil", () => {
  it("a un operador sin correo no le muestra un campo vacío ni le habla de contraseña", () => {
    renderAs({ user_id: "u2", role: "operator", full_name: "Persona Ejemplo", email: "", phone: "+525512345678", has_pin: true });
    expect(screen.queryByText("Correo electrónico")).not.toBeInTheDocument();
    expect(screen.queryByText(/correo y contraseña/)).not.toBeInTheDocument();
    expect(screen.getByText(/Son los 4 dígitos con los que entras a la recepción/)).toBeInTheDocument();
    // Sin correo, el PIN es su única forma de entrar: no se ofrece borrarlo.
    expect(screen.queryByRole("button", { name: /Borrar PIN/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Cambiar PIN/ })).toBeInTheDocument();
  });

  it("al dueño con correo se lo muestra como texto y le permite borrar el PIN", () => {
    renderAs({ user_id: "u1", role: "owner", full_name: "Persona Dueña", email: "dueno@example.com", has_pin: true });
    expect(screen.getByText("dueno@example.com")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("dueno@example.com")).not.toBeInTheDocument();
    expect(screen.getByText(/sin escribir tu correo y contraseña/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Borrar PIN/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Volver a Configuración" })).toHaveAttribute("href", "/settings");
  });
});
