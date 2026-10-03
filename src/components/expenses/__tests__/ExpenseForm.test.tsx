import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ExpenseForm } from "../ExpenseForm";
vi.mock("@/components/cash/CashDrawerField",()=>({CashDrawerField:()=>null}));
describe("ExpenseForm simple",()=>{
 it("exige elegir una categoría y el origen del pago antes de guardar",async()=>{
  const submit=vi.fn();render(<ExpenseForm mode="create" submitting={false} onSubmit={submit} onCancel={()=>{}}/>);
  fireEvent.change(screen.getByLabelText(/Concepto/),{target:{value:"Pago del gimnasio"}});
  fireEvent.change(screen.getByLabelText(/Monto/),{target:{value:"300"}});
  fireEvent.click(screen.getByRole("button",{name:"Registrar gasto"}));
  expect(submit).not.toHaveBeenCalled();expect(screen.getByLabelText(/Pagado con/)).toHaveValue("");
  fireEvent.change(screen.getByLabelText(/Pagado con/),{target:{value:"gym_fund:transfer"}});
  fireEvent.click(screen.getByRole("button",{name:"Registrar gasto"}));
  expect(submit).not.toHaveBeenCalled();
  expect(screen.getByText("Selecciona una categoría.")).toBeVisible();
  const category = screen.getByRole("combobox", {name: /Categoría/});
  expect(category).toHaveTextContent("Selecciona una categoría");
  expect(category.closest("details")).toBeNull();
  fireEvent.keyDown(category, {key: "ArrowDown"});
  fireEvent.click(await screen.findByRole("option", {name: "Otros"}));
  fireEvent.click(screen.getByRole("button", {name: "Registrar gasto"}));
  expect(submit).toHaveBeenCalledWith(expect.objectContaining({amount:300,category:"otros",payment_method:"transfer",paid_from:"gym_fund"}));
 });
 it("muestra la categoría desde el inicio y deja el proveedor en Más datos",()=>{
  render(<ExpenseForm mode="create" submitting={false} onSubmit={()=>{}} onCancel={()=>{}}/>);
  expect(screen.getByRole("combobox", {name: /Categoría/})).toBeVisible();
  expect(screen.getByLabelText(/Proveedor o persona/)).not.toBeVisible();
  const details=screen.getByText("Más datos").closest("details");expect(details).not.toHaveAttribute("open");
  fireEvent.click(screen.getByText("Más datos"));expect(screen.getByLabelText(/Proveedor o persona/)).toBeInTheDocument();
 });
 it("reutiliza la categoría del pago programado seleccionado",()=>{
  const submit=vi.fn();render(<ExpenseForm mode="create" submitting={false} onSubmit={submit} onCancel={()=>{}} occurrences={[{id:"due-rent",name:"Renta",category:"renta",status:"pending",expected_amount:300,due_on:"2026-09-07"} as any]}/>);
  fireEvent.change(screen.getByLabelText(/Concepto/),{target:{value:"Pago del gimnasio"}});
  fireEvent.change(screen.getByLabelText(/Monto/),{target:{value:"300"}});fireEvent.change(screen.getByLabelText(/Pagado con/),{target:{value:"external:transfer"}});
  fireEvent.click(screen.getByRole("button",{name:"Registrar gasto"}));expect(submit).not.toHaveBeenCalled();
  fireEvent.change(screen.getByLabelText("Hay pagos pendientes similares"),{target:{value:"due-rent"}});
  fireEvent.click(screen.getByRole("button",{name:"Registrar gasto"}));expect(submit).toHaveBeenCalledWith(expect.objectContaining({recurring_occurrence_id:"due-rent",category:"renta",paid_from:"external",payment_method:"transfer"}));
 });
});
