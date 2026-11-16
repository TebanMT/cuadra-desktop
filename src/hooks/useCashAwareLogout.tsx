import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useLogout } from "@/hooks/useAuth";
import { cashPendingDaysKey, fetchCashPendingDays, type CashPendingDay } from "@/hooks/useCashClose";
import { useAuthStore } from "@/stores/useAuthStore";

// Logging out must never wait on this check: offline, slow or failing reads
// simply let the user leave.
const CHECK_TIMEOUT_MS = 1500;

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("timeout")), ms);
    promise.then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}

const todayReason: Record<CashPendingDay["reason"], string> = {
  open: "sigue abierta",
  no_opening: "tiene movimientos de efectivo sin abrir la caja",
  after_close: "tiene movimientos después del último corte",
  changed: "cambió después del corte",
  not_counted: "tiene un corte sin conteo",
};

/**
 * Cerrar sesión es el fin de turno en recepción: si la caja de hoy sigue sin
 * corte, lo recuerda una vez, sin impedir salir.
 */
export function useCashAwareLogout() {
  const logout = useLogout();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const readOnly = useAuthStore(s => s.readOnly);
  const [checking, setChecking] = useState(false);
  const [pending, setPending] = useState<CashPendingDay[] | null>(null);

  async function requestLogout() {
    if (checking || logout.isPending) return;
    if (readOnly) return logout.mutate();
    setChecking(true);
    let today: CashPendingDay[] = [];
    try {
      const days = await withTimeout(queryClient.fetchQuery({
        queryKey: cashPendingDaysKey(true),
        queryFn: () => fetchCashPendingDays(true),
        staleTime: 0,
      }), CHECK_TIMEOUT_MS);
      today = days.filter(day => day.is_today);
    } catch {
      today = [];
    } finally {
      setChecking(false);
    }
    if (!today.length) return logout.mutate();
    setPending(today);
  }

  const multiple = (pending?.length ?? 0) > 1 || pending?.some(day => !day.is_main_drawer);
  const dialog = <Dialog open={!!pending} onOpenChange={open => { if (!open) setPending(null); }}>
    <DialogContent className="max-w-md">
      <DialogHeader>
        <DialogTitle>La caja de hoy sigue sin corte</DialogTitle>
        <DialogDescription>Si terminas tu turno, haz el corte antes de salir. Si alguien más sigue en recepción, puedes salir sin corte.</DialogDescription>
      </DialogHeader>
      <ul className="space-y-1 text-sm">{pending?.map(day => <li key={day.cash_drawer_id}>{multiple ? `${day.drawer_name}: ` : "La caja "}{todayReason[day.reason]}.</li>)}</ul>
      <div className="flex flex-wrap justify-end gap-2">
        <Button variant="outline" disabled={logout.isPending} onClick={() => { setPending(null); logout.mutate(); }}>Salir sin corte</Button>
        <Button onClick={() => { setPending(null); navigate("/reports/cash-close"); }}>Ir a Caja</Button>
      </div>
    </DialogContent>
  </Dialog>;

  return { requestLogout, dialog, isPending: checking || logout.isPending };
}
