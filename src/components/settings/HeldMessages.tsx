import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useGymProfile } from "@/hooks/useGym";
import { useAuthStore } from "@/stores/useAuthStore";
import { canAccessFeature } from "@/lib/features";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

type Held = { id: string; version: number; recipient: string; template_key: string; channel: string; created_at: string; reason: string | null; blocked: string };
const names: Record<string, string> = { receipt_membership: "Comprobante de membresía", receipt_product: "Comprobante de compra", member_welcome_number: "Bienvenida al socio", operator_welcome_pin: "Acceso del personal", owner_welcome: "Bienvenida al dueño", broadcast_freeform: "Aviso a socios", whatsapp_connect_otp: "Código de WhatsApp", expiry_reminder_3d: "Próximo vencimiento", expiry_reminder_today: "Vencimiento de hoy", expiry_reminder_5d_post: "Membresía vencida", owner_alert_low_stock: "Pocas existencias", owner_alert_cash_close_diff: "Diferencia en caja", owner_alert_expired_batch: "Membresías vencidas", owner_alert_vip_no_visit: "Socio sin visitas", owner_alert_no_payments_today: "Día sin cobros" };

export function HeldMessages() {
  const gym = useAuthStore(s => s.gym); const owner = useAuthStore(s => s.user?.role === "owner");
  if (!owner || !canAccessFeature(gym, "held_messages")) return null;
  return <HeldList />;
}
function HeldList() {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false); const [page, setPage] = useState(1);
  const [choice, setChoice] = useState<{ row: Held; action: "send" | "discard" } | null>(null);
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const [error, setError] = useState(""); const [notice, setNotice] = useState("");
  const gym = useGymProfile();
  const list = useQuery({ queryKey: ["held-notifications", page], queryFn: () => api.get<{ items: Held[]; total: number }>("/api/v1/held-notifications", { query: { page } }), staleTime: 15000 });
  useEffect(() => {
    if (list.data) setPage(p => Math.min(p, Math.max(1, Math.ceil(list.data.total / 20))));
  }, [list.data]);
  async function act() {
    if (!choice || lock.current) return; lock.current = true; setBusy(true); setError("");
    try {
      await api.post(`/api/v1/held-notifications/${choice.row.id}`, { version: choice.row.version, action: choice.action });
      setNotice(choice.action === "send" ? "Mensaje en cola. Todavía no es una confirmación de entrega." : "Mensaje descartado.");
      setChoice(null); await queryClient.invalidateQueries({ queryKey: ["held-notifications"] });
    } catch (e) { setError(e instanceof Error ? e.message : "No pudimos confirmar el cambio. Puedes reintentar la misma acción."); }
    finally { lock.current = false; setBusy(false); }
  }
  const total = list.data?.total;
  return <section className="border-t pt-4 space-y-3">
    <Button variant="ghost" className="text-muted-foreground" aria-expanded={open} onClick={() => { setOpen(!open); if (!open) void list.refetch(); }}>Mensajes retenidos{total ? ` (${total})` : ""}</Button>
    {open && <div className="space-y-4">
      <p className="text-sm text-muted-foreground">Estos mensajes llegaron tarde y no se enviaron. Revisa cada uno antes de decidir. Necesitas internet.</p>
      {notice && <p role="status" className="text-sm">{notice}</p>}
      {list.isError ? <p role="alert" className="text-sm">No pudimos consultar los mensajes. <Button variant="link" onClick={() => list.refetch()}>Reintentar</Button></p> : list.isLoading ? <p>Cargando…</p> : total === 0 ? <p className="text-sm text-muted-foreground">No hay mensajes retenidos.</p> : <div className="divide-y rounded-lg border">{list.data?.items.map(row => <article className="p-4 space-y-2" key={row.id}>
        <div className="flex flex-wrap gap-2 justify-between"><p className="font-medium">{row.recipient}</p><p className="text-xs text-muted-foreground">{new Date(row.created_at).toLocaleString("es-MX", { timeZone: gym.data?.timezone ?? "America/Mexico_City", dateStyle: "medium", timeStyle: "short" })}</p></div>
        <p className="text-sm">{names[row.template_key] ?? "Aviso del gimnasio"} · {row.channel === "whatsapp" ? "WhatsApp" : "Correo"}</p>
        <p className="text-sm text-muted-foreground">{row.reason ?? "Pasó demasiado tiempo desde que se creó."}</p>
        {row.blocked && <p className="text-sm text-amber-700 dark:text-amber-400">{row.blocked}</p>}
        <div className="flex justify-end gap-2"><Button size="sm" variant="ghost" onClick={() => { setChoice({ row, action: "discard" }); setError(""); }}>Descartar</Button><Button size="sm" variant="outline" disabled={!!row.blocked} onClick={() => { setChoice({ row, action: "send" }); setError(""); }}>Enviar</Button></div>
      </article>)}</div>}
      {(total ?? 0) > 20 && <div className="flex items-center gap-3 justify-end"><Button variant="outline" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Anterior</Button><span>{page}</span><Button variant="outline" disabled={page * 20 >= (total ?? 0)} onClick={() => setPage(p => p + 1)}>Siguiente</Button></div>}
    </div>}
    <Dialog open={!!choice} onOpenChange={value => { if (!value && !busy) setChoice(null); }}><DialogContent><DialogHeader><DialogTitle>{choice?.action === "send" ? "¿Enviar este mensaje?" : "¿Descartar este mensaje?"}</DialogTitle><DialogDescription>{choice?.row.recipient}. {choice?.action === "send" ? "Se pondrá en cola con los permisos actuales. Revisa que el aviso todavía tenga sentido." : "No se enviará. La decisión quedará registrada."}</DialogDescription></DialogHeader>
      {error && <p role="alert" className="text-sm text-destructive">{error}</p>}<div className="flex gap-2 justify-end"><Button variant="ghost" disabled={busy} onClick={() => setChoice(null)}>Volver</Button><Button disabled={busy} onClick={act}>{busy ? "Guardando…" : choice?.action === "send" ? "Enviar mensaje" : "Descartar mensaje"}</Button></div>
    </DialogContent></Dialog>
  </section>;
}
