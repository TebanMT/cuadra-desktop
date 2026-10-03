import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { useAttentionRequired } from "@/hooks/useReports";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { Button } from "@/components/ui/button";
import { whatsappUrl } from "@/lib/whatsapp";
import { fmtDate } from "@/lib/dates";

// This report includes every outstanding balance, independently of the
// membership's status and the paginated members catalog.
export function MemberBalances({ search }: { search: string }) {
  const query = useAttentionRequired();
  const money = useMoneyVisibility();
  const [page, setPage] = useState(1);
  useEffect(() => setPage(1), [search]);
  const term = search.trim().toLocaleLowerCase("es-MX");
  const rows = (query.data?.pending_balance ?? []).filter(row =>
    !term || row.full_name.toLocaleLowerCase("es-MX").includes(term) || row.phone.includes(term));
  const pages = Math.max(1, Math.ceil(rows.length / 25));
  const current = Math.min(page, pages);
  if (query.isLoading) return <p role="status" className="py-10 text-center">Cargando saldos…</p>;
  if (query.isError) return <p role="alert">No pudimos cargar los saldos. <Button variant="link" onClick={() => query.refetch()}>Reintentar</Button></p>;
  return <div className="space-y-3">
    <div className="rounded-lg border divide-y overflow-hidden">
      {!rows.length ? <p className="p-8 text-center text-sm text-muted-foreground">{term ? "No encontramos socios con saldo pendiente para esa búsqueda." : "No hay saldos pendientes."}</p> :
        rows.slice((current - 1) * 25, current * 25).map(row => {
          const whatsapp = whatsappUrl(row.phone);
          return <div key={row.member_id} className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center">
            <div className="flex min-w-0 flex-1 items-center justify-between gap-3"><div className="min-w-0 flex-1"><Link to={`/members/${row.member_id}`} className="font-medium hover:underline">{row.full_name}</Link>
              <p className="text-xs text-muted-foreground">Pendiente desde {fmtDate(row.due_since)}</p></div>
            <span className="shrink-0 tabular-nums font-semibold">{money.fmt(row.balance)}</span></div>
            <div className="flex gap-2 sm:shrink-0">{whatsapp && <Button asChild variant="outline" size="sm" className="flex-1 sm:flex-none"><a href={whatsapp} target="_blank" rel="noopener noreferrer">WhatsApp</a></Button>}
              <Button asChild size="sm" className="flex-1 sm:flex-none"><Link to={`/members/${row.member_id}?action=settle`}>Abonar</Link></Button>
            </div>
          </div>;
        })}
    </div>
    {pages > 1 && <div className="flex items-center justify-end gap-3"><Button variant="outline" disabled={current <= 1} onClick={() => setPage(current - 1)}>Anterior</Button><span className="text-sm">{current} / {pages}</span><Button variant="outline" disabled={current >= pages} onClick={() => setPage(current + 1)}>Siguiente</Button></div>}
  </div>;
}
