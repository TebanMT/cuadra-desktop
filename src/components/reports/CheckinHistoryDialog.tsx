import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { api } from "@/lib/api";
import { fmtDate, fmtDateTime } from "@/lib/dates";

interface History {
  items: {
    id: string;
    member_id?: string;
    member_name?: string;
    created_at: string;
    method: string;
    result: string;
  }[];
  has_more?: boolean;
}
const METHODS: Record<string, string> = {
  fingerprint: "Huella",
  manual: "Manual",
  number: "Número de socio",
  pin: "NIP",
};
const RESULTS: Record<string, string> = {
  allowed: "Acceso permitido",
  denied: "Acceso denegado",
  granted: "Acceso permitido",
  active: "Acceso permitido",
  expired: "Membresía vencida",
  inactive: "Socio inactivo",
  success: "Acceso permitido",
};

export function CheckinHistoryDialog({
  from,
  to,
  onClose,
}: {
  from: string;
  to: string;
  onClose(): void;
}) {
  const [page, setPage] = useState(1);
  const query = useQuery<History>({
    queryKey: ["checkins", "report", from, to, page],
    queryFn: () =>
      api.get("/api/v1/checkins", {
        query: { from, to, page, page_size: 50, limit: 50 },
      }),
  });
  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>Asistencias</DialogTitle>
          <DialogDescription>
            {fmtDate(from)} — {fmtDate(to)}
          </DialogDescription>
        </DialogHeader>
        {query.isLoading ? (
          <p role="status">Cargando asistencias…</p>
        ) : query.isError ? (
          <p role="alert">
            No pudimos cargar las asistencias.{" "}
            <Button variant="link" onClick={() => query.refetch()}>
              Reintentar
            </Button>
          </p>
        ) : (
          <>
            <div className="min-h-0 overflow-auto">
              {!query.data?.items.length ? (
                <p className="py-8 text-center text-sm text-muted-foreground">
                  Sin asistencias en este período.
                </p>
              ) : (
                <ul className="divide-y">
                  {query.data.items.map((row) => (
                    <li key={row.id} className="py-3 text-sm">
                      <div className="flex items-start justify-between gap-4">
                        {row.member_id ? (
                          <Link
                            to={`/members/${row.member_id}`}
                            className="font-medium text-primary hover:underline"
                          >
                            {row.member_name || "Ver socio"}
                          </Link>
                        ) : (
                          <span>{row.member_name || "Sin socio"}</span>
                        )}
                        <span className="shrink-0 text-xs text-muted-foreground">
                          {fmtDateTime(row.created_at)}
                        </span>
                      </div>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {METHODS[row.method] ?? "Acceso"} ·{" "}
                        {RESULTS[row.result] ??
                          (row.result.startsWith("allowed")
                            ? "Acceso permitido"
                            : "Acceso denegado")}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            {query.data &&
              query.data.has_more == null &&
              query.data.items.length >= 50 && (
                <p role="status" className="text-sm">
                  Se muestran las primeras 50 asistencias. Actualiza Tinta para
                  consultar las siguientes.
                </p>
              )}
            <div className="flex shrink-0 items-center justify-between border-t pt-3">
              <Button
                variant="outline"
                disabled={page === 1}
                onClick={() => setPage(page - 1)}
              >
                Anterior
              </Button>
              <span className="text-xs text-muted-foreground">
                Página {page}
              </span>
              <Button
                variant="outline"
                disabled={!query.data?.has_more}
                onClick={() => setPage(page + 1)}
              >
                Siguiente
              </Button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
