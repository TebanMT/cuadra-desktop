import { render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { describe, expect, it } from "vitest";
import { OwnerOnlyRoute } from "../RouteGuards";
import { useAuthStore, type AuthUser } from "@/stores/useAuthStore";

const user = (role: AuthUser["role"]): AuthUser => ({
  user_id: "user-1",
  full_name: "Ana Dueña",
  email: "ana@example.test",
  phone: null,
  role,
  has_pin: true,
});

function renderGuard(role: AuthUser["role"]) {
  useAuthStore.setState({ user: user(role), hydrated: true });
  return render(<MemoryRouter initialEntries={["/expenses"]}>
    <Routes>
      <Route path="/" element={<div>Inicio operativo</div>} />
      <Route element={<OwnerOnlyRoute />}>
        <Route path="/expenses" element={<div>Finanzas administrativas</div>} />
      </Route>
    </Routes>
  </MemoryRouter>);
}

describe("OwnerOnlyRoute", () => {
  it("redirects an operator away from the Expenses administrative surface", () => {
    renderGuard("operator");
    expect(screen.getByText("Inicio operativo")).toBeInTheDocument();
    expect(screen.queryByText("Finanzas administrativas")).not.toBeInTheDocument();
  });

  it("allows an owner to mount the Expenses administrative surface", () => {
    renderGuard("owner");
    expect(screen.getByText("Finanzas administrativas")).toBeInTheDocument();
  });
});
