import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { api } from "@/lib/api";
import { PaidExpensesLedger } from "../PaidExpensesLedger";
vi.mock("@/lib/api",()=>({api:{get:vi.fn()}}));
vi.mock("@/hooks/useMoneyVisibility",()=>({useMoneyVisibility:()=>({fmt:(amount:number)=>`$${amount.toFixed(2)}`})}));
vi.mock("@/hooks/useDebounce",()=>({useDebounce:(value:string)=>value}));
vi.mock("@/components/reports/FinancialNotice",()=>({FinancialNotice:()=>null}));
const rows=[{id:"e:1",kind:"expense",expense_id:"expense-1",date:"2026-09-05",description:"Renta",amount:1000},{id:"p:1",kind:"purchase",movement_id:"purchase-1",product_id:"product-1",date:"2026-09-04",description:"Agua · 10 piezas",amount:50,quantity:10,unit_cost:5}];
function setup(onExpense=vi.fn()) {render(<MemoryRouter><QueryClientProvider client={new QueryClient({defaultOptions:{queries:{retry:false}}})}><PaidExpensesLedger from="2026-09-01" to="2026-09-07" onFrom={()=>{}} onTo={()=>{}} onExpense={onExpense}/></QueryClientProvider></MemoryRouter>);return onExpense;}
describe("Pagados",()=>{
 beforeEach(()=>{vi.clearAllMocks();vi.mocked(api.get).mockResolvedValue({items:rows,total:2,total_amount:1050,page:1,page_size:50});});
 it("muestra ambos tipos y abre cada registro sin generar un pago",async()=>{
  const open=setup();fireEvent.click(await screen.findByRole("button",{name:/Renta/}));expect(open).toHaveBeenCalledWith({expense_id:"expense-1"});
  fireEvent.click(screen.getByRole("button",{name:/Agua/}));expect(screen.getByRole("dialog")).toHaveTextContent("Total pagado");expect(screen.getByRole("dialog")).toHaveTextContent("$50.00");
  expect(screen.getByRole("link",{name:"Ver compras en Productos"})).toHaveAttribute("href","/products?view=purchases");
 });
 it("busca en el listado completo y conserva el total del filtro al cambiar de página",async()=>{
  vi.mocked(api.get).mockResolvedValue({items:rows,total:101,total_amount:3500,page:1,page_size:50});setup();
  fireEvent.click(await screen.findByRole("button",{name:"Siguiente"}));await waitFor(()=>expect(api.get).toHaveBeenLastCalledWith("/api/v1/reports/paid-expenses",{query:{from:"2026-09-01",to:"2026-09-07",q:"",page:2,page_size:50}}));
  expect(await screen.findByText("$3500.00")).toBeVisible();fireEvent.change(screen.getByRole("textbox",{name:"Buscar gasto"}),{target:{value:"Agua"}});
  await waitFor(()=>expect(api.get).toHaveBeenLastCalledWith("/api/v1/reports/paid-expenses",{query:{from:"2026-09-01",to:"2026-09-07",q:"Agua",page:1,page_size:50}}));
 });
 it("muestra un error recuperable sin inventar un total en cero",async()=>{
  vi.mocked(api.get).mockRejectedValue(new Error("offline"));setup();expect(await screen.findByRole("alert")).toHaveTextContent("No se pudieron cargar");expect(screen.queryByText("$0.00")).not.toBeInTheDocument();
  vi.mocked(api.get).mockResolvedValue({items:rows,total:2,total_amount:1050,page:1,page_size:50});fireEvent.click(screen.getByRole("button",{name:"Reintentar"}));expect(await screen.findByText("$1050.00")).toBeVisible();
 });
});
