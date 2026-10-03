import { beforeEach, describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter, Route, Routes, useLocation } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { TooltipProvider } from "@/components/ui/tooltip";
import { MemberProductLinks } from "@/components/shared/MemberProductLinks";
import { MemberLastEntry } from "@/components/members/MemberLastEntry";
import MembersPage from "@/pages/members/MembersPage";
import LegacyAttentionPage from "@/pages/dashboard/AttentionRequiredPage";

const { get, report } = vi.hoisted(() => ({ get: vi.fn(), report: {
  expiring_soon: [], expired_recoverable: [], inactive_involuntary: [], low_stock: [], birthdays_today: [],
  pending_balance: Array.from({length: 30}, (_, i) => ({member_id: `member-${i}`, full_name: `Socio ${i}`, phone: "4421234567", balance: 100 + i, due_since: "2026-09-01"})),
} }));
vi.mock("@/lib/api", async () => {
  const actual = await vi.importActual<typeof import("@/lib/api")>("@/lib/api");
  return { ...actual, api: { ...actual.api, get } };
});
function Destination() { const loc = useLocation(); return <div>{loc.pathname + loc.search}</div>; }
function mount(children: React.ReactNode, path = "/members") {
  const client = new QueryClient({defaultOptions:{queries:{retry:false,gcTime:0}}});
  return render(<QueryClientProvider client={client}><TooltipProvider><MemoryRouter initialEntries={[path]}>{children}</MemoryRouter></TooltipProvider></QueryClientProvider>);
}
beforeEach(() => {
  get.mockReset();
  get.mockImplementation(async (url: string) => {
    if (url === "/api/v1/attention-required") return report;
    if (url === "/api/v1/membership-types") return [];
    if (url === "/api/v1/members") return {items:[],total:0,page:1,page_size:25};
    if (url.endsWith("/checkins")) return {items:[],last_entry_at:null};
    throw new Error(url);
  });
});
describe("Consultas dentro de su módulo", () => {
  it("Inicio lleva directo a cada filtro, sin cumpleaños ni ausencias", () => {
    mount(<MemberProductLinks summary={{expiring_soon:2,pending_balance:3,low_stock:1}} />);
    expect(screen.getByRole("link",{name:/Membresías por vencer/})).toHaveAttribute("href","/members?status=expiring_soon");
    expect(screen.getByRole("link",{name:/saldo pendiente/})).toHaveAttribute("href","/members?status=balance");
    expect(screen.getByRole("link",{name:/pocas existencias/})).toHaveAttribute("href","/products?low_stock=1");
    expect(screen.queryByText(/Atención inmediata|cumpleañ|sin venir/i)).not.toBeInTheDocument();
  });
  it("no ofrece Productos a un rol sin acceso ni celebra una lista vacía", () => {
    const view = mount(<MemberProductLinks summary={{expiring_soon:0,pending_balance:0,low_stock:2}} showProducts={false} />);
    expect(view.container).toBeEmptyDOMElement();
  });
  it.each([["?filter=balance","/members?status=balance"],["#expiring_soon","/members?status=expiring_soon"],["#expired_recoverable","/members?status=expired"],["#birthdays_today","/members"]])("conserva el enlace antiguo %s", (old, destination) => {
    mount(<Routes><Route path="/attention-required" element={<LegacyAttentionPage/>}/><Route path="/members" element={<Destination/>}/></Routes>, `/attention-required${old}`);
    expect(screen.getByText(destination)).toBeInTheDocument();
  });
  it("Con saldo incluye socios fuera de la primera página y permite buscarlos", async () => {
    mount(<MembersPage/>,"/members?status=balance");
    expect(await screen.findByText("Socio 0")).toBeInTheDocument();
    expect(screen.queryByText("Socio 29")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button",{name:"Siguiente"}));
    expect(screen.getByText("Socio 29")).toBeInTheDocument();
    expect(screen.getAllByRole("link",{name:"Abonar"})[0]).toHaveAttribute("href","/members/member-25?action=settle");
    fireEvent.change(screen.getByRole("textbox"), {target:{value:"Socio 29"}});
    await waitFor(() => expect(screen.queryByText("Socio 25")).not.toBeInTheDocument());
    expect(screen.getByText("Socio 29")).toBeInTheDocument();
  });
  it("el enlace de vencidos aplica el filtro real del catálogo", async () => {
    mount(<MembersPage/>,"/members?status=expired");
    await waitFor(() => expect(get).toHaveBeenCalledWith("/api/v1/members", expect.objectContaining({query:expect.objectContaining({status:"expired",page_size:25})})));
  });
  it("no interpreta la ausencia del campo en un API anterior como falta de entradas", async () => {
    get.mockResolvedValue({items:[]});
    const view = mount(<MemberLastEntry memberID="member-1"/>);
    await waitFor(() => expect(get).toHaveBeenCalled());
    expect(view.container).toBeEmptyDOMElement();
  });
  it("muestra la última entrada informada, sin afirmar que el socio dejó de venir", async () => {
    get.mockResolvedValue({items:[{result:"denied_expired",created_at:"2026-09-20T12:00:00Z"}],last_entry_at:"2026-08-01T12:00:00Z"});
    mount(<MemberLastEntry memberID="member-1"/>);
    expect(await screen.findByText(/Última entrada registrada/)).toBeInTheDocument();
    expect(screen.queryByText(/sin venir|inactivo involuntario/i)).not.toBeInTheDocument();
  });
});
