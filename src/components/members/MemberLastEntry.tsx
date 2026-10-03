import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { daysFromToday, fmtDate } from "@/lib/dates";

export function MemberLastEntry({ memberID }: { memberID: string }) {
  const query = useQuery({
    queryKey: ["checkins", "last-entry", memberID],
    queryFn: () => api.get<{ last_entry_at?: string | null }>(`/api/v1/members/${memberID}/checkins`, { query: { limit: 1 } }),
    enabled: !!memberID,
    staleTime: 10_000,
  });
  if (query.isError) return <p className="text-sm text-muted-foreground">No pudimos consultar la última entrada.</p>;
  const at = query.data?.last_entry_at;
  // Older APIs omit this field. Omission is not evidence of no attendance.
  if (at === undefined) return null;
  const days = at ? daysFromToday(at) : null;
  return <p className="text-sm text-muted-foreground">{at ? <>
    Última entrada registrada: <span className="text-foreground">{fmtDate(at)}</span>
    {days != null && days < 0 ? ` (hace ${Math.abs(days)} ${days === -1 ? "día" : "días"})` : ""}
  </> : "Sin entradas registradas."}</p>;
}
