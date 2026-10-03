import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import { ExpenseOverview } from "../ExpenseOverview";
import { financialResultIsPartial, scheduledBuckets } from "@/lib/expensesOverview";
const day="2026-09-05";const until="2026-10-05";
const pending=[{due_on:"2026-08-31",status:"pending",expected_amount:800},{due_on:day,status:"pending",expected_amount:100},{due_on:"2026-09-10",status:"pending",expected_amount:200},{due_on:"2026-10-06",status:"pending",expected_amount:400}];
describe("Resumen cotidiano", () => {
 it("separa atrasos, hoy y los próximos treinta días",()=>{const groups=scheduledBuckets(pending,day,until);expect(groups.overdue.map(p=>p.expected_amount)).toEqual([800]);expect(groups.today.map(p=>p.expected_amount)).toEqual([100]);expect(groups.upcoming.map(p=>p.expected_amount)).toEqual([200]);});
 it("mantiene el criterio de integridad aun si la ecuación cuadra",()=>{expect(financialResultIsPartial({canonical:true,integrity:{status:"incomplete"},income:100,outflows:80,result:20})).toBe(true);expect(financialResultIsPartial({canonical:true,integrity:{status:"complete"},income:100,outflows:80,result:20})).toBe(false);expect(financialResultIsPartial({canonical:true,integrity:{status:"complete"},income:100,outflows:80,result:20.01})).toBe(true);});
 it("muestra compras pendientes y abre el grupo exacto sin afirmar que todo está al día",()=>{
  const onPending=vi.fn();render(<MemoryRouter><ExpenseOverview report={{totals:{income:{value:1000},outflows:{value:100},period_result:{value:900}},integrity:{status:"incomplete",missing_purchase_amount_count:1}}} pending={pending} purchaseCount={1} purchaseTotal={450} cashCount={0} paidCount={1} paidTotal={100} from="2026-09-01" to={day} today={day} until={until} showScheduled loading={false} error={null} fmt={n=>`$${n}`} onPending={onPending} onMovements={()=>{}} /></MemoryRouter>);
  expect(screen.getByText("Resultado parcial")).toBeInTheDocument();expect(screen.getByText(/Falta completar el importe/)).toBeInTheDocument();expect(screen.queryByText(/Todo está al corriente/)).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole("button",{name:/Compras por pagar/}));expect(onPending).toHaveBeenLastCalledWith("purchases");fireEvent.click(screen.getByRole("button",{name:/Próximos 30 días/}));expect(onPending).toHaveBeenLastCalledWith("upcoming");
  expect(screen.getByRole("link",{name:/Resultado parcial/})).toHaveAttribute("href","/reports?range=custom&from=2026-09-01&to=2026-09-05");
 });
});
