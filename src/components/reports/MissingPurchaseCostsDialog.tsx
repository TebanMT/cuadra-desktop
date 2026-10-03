import { useState } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { api } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface MissingCost {
  movement_id: string;
  product_name: string;
  quantity: number;
  version: number;
  recorded_on: string;
}
interface MissingCostsPage { items: MissingCost[]; total: number; page: number; page_size: number }

export function MissingPurchaseCostsDialog({ from, to, onClose }: { from: string; to: string; onClose(): void }) {
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<MissingCost | null>(null);
  const [cost, setCost] = useState("");
  const [reason, setReason] = useState("");
  const queryClient = useQueryClient();
  const query = useQuery({
    queryKey: ["missing-purchase-costs", from, to, page],
    queryFn: () => api.get<MissingCostsPage>("/api/v1/inventory-purchase-missing-costs", { query: { from, to, page } }),
  });
  const save = useMutation({
    mutationFn: () => api.post(`/api/v1/inventory-purchase-missing-costs/${selected!.movement_id}/complete`, {
      version: selected!.version, unit_cost: Number(cost), reason: reason.trim() || "Captura de costo histórico",
    }),
    onSuccess: async () => {
      setSelected(null); setCost(""); setReason(""); setPage(1);
      toast.success("Costo guardado.");
      await Promise.all(["missing-purchase-costs", "inventory-purchases", "reports", "dashboard", "analytics"].map(key => queryClient.invalidateQueries({ queryKey: [key] })));
    },
  });
  const validCost = /^\d+(\.\d{1,2})?$/.test(cost) && Number(cost) > 0 && Number(cost) <= 9999999999.99;
  return <Dialog open onOpenChange={open => { if (!open && !save.isPending) onClose(); }}>
    <DialogContent className="max-h-[85dvh] overflow-y-auto sm:max-w-xl">
      <DialogHeader>
        <DialogTitle>{selected ? "Completar costo" : "Compras sin costo"}</DialogTitle>
        <DialogDescription>{selected
          ? "Usa el costo del ticket o factura de esa compra. Las existencias y la caja no cambian."
          : "Estas compras aún no se descuentan del resultado. Selecciona una para registrar su costo."}</DialogDescription>
      </DialogHeader>
      {selected ? <form className="space-y-4" onSubmit={event => { event.preventDefault(); if (validCost && (!reason.trim() || reason.trim().length >= 3) && !save.isPending) save.mutate(); }}>
        <div className="rounded-md bg-muted p-3 text-sm">
          <strong className="block">{selected.product_name}</strong>
          <span>{fmtDate(selected.recorded_on)} · {selected.quantity} {selected.quantity === 1 ? "unidad" : "unidades"}</span>
        </div>
        <div className="space-y-2">
          <Label htmlFor="missing-unit-cost">Costo por unidad</Label>
          <Input id="missing-unit-cost" autoFocus inputMode="decimal" value={cost} onChange={event => setCost(event.target.value)} placeholder="0.00" disabled={save.isPending} />
          {validCost && <p className="text-sm">Total de la compra: {(Math.round(Number(cost) * 100) * selected.quantity / 100).toLocaleString("es-MX", { style: "currency", currency: "MXN" })}</p>}
        </div>
        <div className="space-y-2">
          <Label htmlFor="missing-cost-reason">Nota (opcional)</Label>
          <Input id="missing-cost-reason" maxLength={200} value={reason} onChange={event => setReason(event.target.value)} placeholder="Ej. Factura 204 del proveedor" disabled={save.isPending} />
        </div>
        <p className="text-xs text-muted-foreground">Se incluirá en el reporte del {fmtDate(selected.recorded_on)}. Si no conoces el costo, déjalo pendiente.</p>
        {save.isError && <p role="alert" className="text-sm text-destructive">{save.error instanceof Error ? save.error.message : "No se pudo guardar el costo. Intenta de nuevo."}</p>}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" disabled={save.isPending} onClick={() => { setSelected(null); save.reset(); }}>Volver</Button>
          <Button type="submit" disabled={!validCost || (!!reason.trim() && reason.trim().length < 3) || save.isPending}>{save.isPending ? "Guardando…" : "Guardar costo"}</Button>
        </div>
      </form> : <>
        <p className="text-xs text-muted-foreground">{fmtDate(from)} — {fmtDate(to)}</p>
        {query.isLoading ? <p>Cargando compras…</p> : query.isError ? <div role="alert"><p>No se pudieron cargar las compras.</p><Button variant="outline" onClick={() => query.refetch()}>Reintentar</Button></div> : query.data?.items.length ? <>
          <ul className="divide-y rounded-md border">
            {query.data.items.map(row => <li key={row.movement_id} className="flex items-center justify-between gap-3 p-3">
              <div className="min-w-0 text-sm"><strong className="block break-words">{row.product_name}</strong><span className="text-muted-foreground">{fmtDate(row.recorded_on)} · {row.quantity} {row.quantity === 1 ? "unidad" : "unidades"}</span></div>
              <Button size="sm" variant="outline" disabled={row.quantity <= 0} aria-label={`Completar costo de ${row.product_name}`} onClick={() => { setSelected(row); setCost(""); setReason(""); save.reset(); }}>Completar</Button>
            </li>)}
          </ul>
          <div className="flex items-center justify-between gap-2 text-sm"><span>{query.data.total} {query.data.total === 1 ? "compra pendiente" : "compras pendientes"}</span><div className="flex gap-2"><Button variant="ghost" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</Button><Button variant="ghost" size="sm" disabled={page * query.data.page_size >= query.data.total} onClick={() => setPage(page + 1)}>Siguiente</Button></div></div>
        </> : <p role="status">No quedan compras sin costo en este período.</p>}
      </>}
    </DialogContent>
  </Dialog>;
}
