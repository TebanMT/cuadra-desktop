import { useEffect, useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { SectionCard } from "@/components/shared/PagePrimitives";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";

type Delivery={id:string;product_id:string;product_name:string;quantity:number;created_at:string};
export function PurchaseDeliveries(){
 const q=useQueryClient();const[page,setPage]=useState(1);const[selected,setSelected]=useState<Delivery|null>(null);const[error,setError]=useState<string|null>(null);
 const deliveries=useQuery({queryKey:["inventory-purchase-deliveries",page],queryFn:()=>api.get<{items:Delivery[];total:number;page_size:number}>("/api/v1/inventory-purchase-deliveries",{query:{page}}),refetchInterval:15_000});
 useEffect(()=>{if(deliveries.data){const last=Math.max(1,Math.ceil(deliveries.data.total/deliveries.data.page_size));if(page>last)setPage(last);}},[deliveries.data,page]);
 const receive=useMutation({mutationFn:(v:Delivery)=>api.post("/api/v1/inventory-purchases/"+v.id+"/receive",{quantity:v.quantity}),onSuccess:()=>{for(const key of ["inventory-purchase-deliveries","inventory-purchases","products","product","stock-movements","reports","dashboard","analytics"])void q.invalidateQueries({queryKey:[key]});}});
 const confirm=async()=>{if(!selected)return;setError(null);try{await receive.mutateAsync(selected);toast.success(`${selected.quantity} unidades recibidas.`);setSelected(null);}catch(err){setError(err instanceof Error?err.message:"No se pudo guardar la recepción. Intenta de nuevo.");}};
 if(deliveries.isLoading)return <p className="text-sm text-muted-foreground">Consultando compras pendientes de recibir…</p>;
 if(deliveries.isError)return <div role="alert" className="rounded-lg border p-4 text-sm">No se pudieron consultar las compras por recibir. <Button variant="link" onClick={()=>deliveries.refetch()}>Reintentar</Button></div>;
 if(!deliveries.data?.total)return null;
 const pages=Math.ceil(deliveries.data.total/deliveries.data.page_size);
 return <><SectionCard title={`Mercancía por recibir · ${deliveries.data.total}`} flush><div className="divide-y">{deliveries.data.items.map(v=><div className="flex flex-wrap items-center justify-between gap-3 p-4" key={v.id}><div><p className="font-medium">{v.product_name}</p><p className="text-sm text-muted-foreground">{v.quantity} unidades · registrada {fmtDate(v.created_at)}</p></div><Button variant="outline" onClick={()=>{setSelected(v);setError(null);}}>Recibir productos</Button></div>)}</div>{pages>1&&<div className="flex items-center justify-end gap-2 border-t p-3"><Button variant="outline" disabled={page<=1} onClick={()=>setPage(page-1)}>Anterior</Button><span className="text-sm">{page} / {pages}</span><Button variant="outline" disabled={page>=pages} onClick={()=>setPage(page+1)}>Siguiente</Button></div>}</SectionCard>
 <Dialog open={!!selected} onOpenChange={open=>{if(!open&&!receive.isPending)setSelected(null);}}><DialogContent><DialogHeader><DialogTitle>Recibir productos</DialogTitle><DialogDescription>Cuenta los productos antes de confirmar la entrega completa.</DialogDescription></DialogHeader>{selected&&<><p className="rounded-md bg-muted p-4"><strong>{selected.quantity} unidades de {selected.product_name}</strong></p><p className="text-sm text-muted-foreground">Se agregarán a las existencias.</p>{error&&<p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex justify-end gap-2"><Button variant="outline" disabled={receive.isPending} onClick={()=>setSelected(null)}>Cancelar</Button><Button disabled={receive.isPending} onClick={confirm}>{receive.isPending?"Guardando…":`Recibí las ${selected.quantity} unidades`}</Button></div></>}</DialogContent></Dialog></>;
}
