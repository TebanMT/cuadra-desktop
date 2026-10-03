import { DateRangePicker } from "@/components/ui/date-range-picker";
import { FinancialNotice } from "@/components/reports/FinancialNotice";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import { ChevronRight, Search } from "lucide-react";
import { api } from "@/lib/api";
import { fmtDate, todayIso } from "@/lib/dates";
import { useDebounce } from "@/hooks/useDebounce";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type PaidItem = { id: string; kind: "expense" | "purchase"; date: string; description: string; amount: number; expense_id?: string; movement_id?: string; product_id?: string; quantity?: number; unit_cost?: number };
type PaidPage = { missing_purchase_amount_count?: number; items: PaidItem[]; total: number; total_amount: number; page: number; page_size: number };
export function PaidExpensesLedger({from,to,onFrom,onTo,onExpense}:{from:string;to:string;onFrom(value:string):void;onTo(value:string):void;onExpense(item:{expense_id:string}):void}) {
 const money=useMoneyVisibility();
 const [search,setSearch]=useState(""); const query=useDebounce(search,300);
 const [page,setPage]=useState(1); const [purchase,setPurchase]=useState<PaidItem|null>(null);
 const valid=!!from&&!!to&&from<=to;
 const list=useQuery({queryKey:["reports","paid-expenses",from,to,query,page],queryFn:()=>api.get<PaidPage>("/api/v1/reports/paid-expenses",{query:{from,to,q:query,page,page_size:50}}),enabled:valid,refetchInterval:30_000});
 const data=list.data;
 return <div className="space-y-4">
  <div className="flex flex-wrap items-center gap-3">
   <label className="relative flex-1 min-w-40"><span className="sr-only">Buscar gasto</span><Search className="absolute left-3 top-3 h-4 w-4 text-muted-foreground"/><Input placeholder="Buscar gasto" className="pl-9" value={search} onChange={e=>{setSearch(e.target.value);setPage(1);}} /></label>
   <DateRangePicker from={from} to={to} onChange={(start, end) => { onFrom(start); onTo(end); setPage(1); }} />
  </div>
  {data && <FinancialNotice count={data.missing_purchase_amount_count ?? 0} warnings={[]} incomplete={false} from={from} to={to} />}
  {!valid ? <p role="alert" className="text-sm text-destructive">Revisa las fechas del período.</p> : list.isError ? <div role="alert" className="rounded-lg border p-5 text-sm">No se pudieron cargar los gastos. <Button variant="link" onClick={()=>list.refetch()}>Reintentar</Button></div> : list.isLoading ? <p role="status" className="py-12 text-center text-muted-foreground">Cargando gastos…</p> : data && <>
   <div className="flex items-baseline justify-between gap-3 px-1"><span className="text-sm text-muted-foreground">{data.total} {data.total===1?"pago":"pagos"}</span><strong className="text-xl tabular-nums">{money.fmt(data.total_amount)}</strong></div>
   <div className="rounded-lg border bg-card overflow-hidden divide-y">{data.items.length===0 ? <p className="py-14 text-center text-sm text-muted-foreground">{query?"No encontramos ese gasto.":"No hay pagos en este período."}</p> : data.items.map(item=><button type="button" key={item.id} onClick={()=>item.kind==="expense"&&item.expense_id?onExpense({expense_id:item.expense_id}):setPurchase(item)} className="w-full flex items-center gap-4 p-4 text-left hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-ring"><span className="min-w-0 flex-1"><span className="block font-medium break-words">{item.description}</span><span className="block text-xs text-muted-foreground mt-1">{fmtDate(item.date)}{item.kind==="purchase"?" · Compra de productos":""}</span></span><strong className="shrink-0 tabular-nums text-sm">{money.fmt(item.amount)}</strong><ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground"/></button>)}</div>
   {data.total>50&&<div className="flex items-center justify-end gap-3"><Button variant="outline" size="sm" disabled={page===1} onClick={()=>setPage(p=>p-1)}>Anterior</Button><span className="text-sm">{page} / {Math.ceil(data.total/50)}</span><Button variant="outline" size="sm" disabled={page*50>=data.total} onClick={()=>setPage(p=>p+1)}>Siguiente</Button></div>}
  </>}
  <Dialog open={!!purchase} onOpenChange={open=>{if(!open)setPurchase(null);}}><DialogContent><DialogHeader><DialogTitle>Compra de productos</DialogTitle><DialogDescription>{purchase?.description}</DialogDescription></DialogHeader>{purchase&&<div className="space-y-4"><dl className="grid grid-cols-2 gap-3 text-sm"><dt>Fecha de pago</dt><dd className="text-right">{fmtDate(purchase.date)}</dd><dt>Costo por pieza</dt><dd className="text-right">{money.fmt(purchase.unit_cost??0)}</dd><dt className="font-medium">Total pagado</dt><dd className="text-right font-semibold">{money.fmt(purchase.amount)}</dd></dl><Button asChild variant="outline" className="w-full"><Link to="/products?view=purchases">Ver compras en Productos</Link></Button></div>}</DialogContent></Dialog>
 </div>;
}
