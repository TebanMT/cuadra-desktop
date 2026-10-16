import { render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
vi.mock("@/hooks/useReports", () => ({ useAttentionRequired: () => ({ data: { pending_balance: [
  { member_id: "1", full_name: "ÁNGEL ÑÚÑEZ", phone: "5512345678", balance: 50, due_since: "2026-09-01" },
  { member_id: "2", full_name: "Bruno Pérez", phone: "5587654321", balance: 100, due_since: "2026-09-01" },
] } }) }));
vi.mock("@/hooks/useMoneyVisibility", () => ({ useMoneyVisibility: () => ({ fmt: (value: number) => `$${value}` }) }));
import { MemberBalances } from "../MemberBalances";
describe("Búsqueda de socios con saldo", () => {
  it.each(["ángel", "ÁNGEL", "angel", "ñúñez", "NUNEZ", "551234"])("encuentra el mismo socio con %s", term => {
    render(<MemoryRouter><MemberBalances search={term} /></MemoryRouter>);
    expect(screen.getByRole("link", { name: "ÁNGEL ÑÚÑEZ" })).toHaveAttribute("href", "/members/1");
    expect(screen.queryByRole("link", { name: "Bruno Pérez" })).not.toBeInTheDocument();
  });
});
