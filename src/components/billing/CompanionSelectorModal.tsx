import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, X } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { useMembersList, type MemberListItem } from "@/hooks/useMembers";
import { promotions as t } from "@/strings/promotions";
import { useDebounce } from "@/hooks/useDebounce";
import { MemberHitSummary } from "@/components/checkin/MemberSearchInput";

interface CompanionSelectorModalProps {
  open: boolean;
  onOpenChange(o: boolean): void;
  companionCount: number;
  excludeMemberID?: string | null; // socio principal del cobro
  onConfirm(memberIDs: string[]): void;
}

// CompanionSelectorModal — usado para promos kind=companion_memberships.
// El operador elige N socios destinatarios (N = companion_count de la
// promo). Search debounced + selección múltiple con badges. No cierra
// solo: el operador confirma con "Confirmar" cuando tiene los N slots
// llenos.
export function CompanionSelectorModal({
  open,
  onOpenChange,
  companionCount,
  excludeMemberID,
  onConfirm,
}: CompanionSelectorModalProps) {
  const [search, setSearch] = useState("");
  const dq = useDebounce(search, 250);
  // Sin filtro de status: al acompañante del 2x1 se le REGALA una membresía,
  // así que casi siempre es alguien sin membresía vigente (socio nuevo en
  // pending_payment, o vencido). Limitar a "active" lo ocultaba. GiftMembership
  // maneja los 3 estados (sin/pending/activo) en el backend.
  const list = useMembersList({ q: dq, status: "", page: 1, page_size: 20 });
  const [selected, setSelected] = useState<MemberListItem[]>([]);

  useEffect(() => {
    if (open) {
      setSearch("");
      setSelected([]);
    }
  }, [open]);

  const need = companionCount - selected.length;
  const canConfirm = selected.length === companionCount;

  const filtered = useMemo(() => {
    const rows = list.data?.items ?? [];
    return rows.filter(
      (m) => m.member.id !== excludeMemberID && !selected.find((s) => s.member.id === m.member.id),
    );
  }, [list.data?.items, excludeMemberID, selected]);

  function add(m: MemberListItem) {
    if (selected.length >= companionCount) return;
    setSelected((s) => [...s, m]);
  }

  function remove(id: string) {
    setSelected((s) => s.filter((m) => m.member.id !== id));
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.companion.title}</DialogTitle>
        </DialogHeader>

        <p className="text-sm text-muted-foreground">{t.companion.subtitle(companionCount)}</p>

        {/* Slots elegidos. Badges con X para quitar. */}
        <div className="flex flex-wrap gap-1.5 min-h-[2rem]">
          {Array.from({ length: companionCount }).map((_, idx) => {
            const m = selected[idx];
            if (!m) {
              return (
                <Badge key={idx} variant="outline" className="border-dashed font-normal text-muted-foreground">
                  {t.companion.slotPlaceholder(idx)}
                </Badge>
              );
            }
            return (
              <Badge key={m.member.id} variant="secondary" className="gap-1">
                {m.member.full_name}
                <button
                  type="button"
                  onClick={() => remove(m.member.id)}
                  className="hover:text-destructive"
                  aria-label={`Quitar ${m.member.full_name}`}
                >
                  <X className="h-3 w-3" />
                </button>
              </Badge>
            );
          })}
        </div>

        <div className="relative">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder={t.companion.searchPlaceholder}
            className="pl-9"
            disabled={need === 0}
          />
        </div>

        <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
          {list.isLoading ? (
            <div className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground" role="status">
              <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
              Buscando socios…
            </div>
          ) : filtered.length === 0 ? (
            <p className="text-sm text-muted-foreground p-3 text-center">
              {dq ? `Ningún socio coincide con «${dq}».` : "Escribe un nombre, teléfono o número de socio."}
            </p>
          ) : (
            filtered.map((m) => (
              <button
                key={m.member.id}
                type="button"
                onClick={() => add(m)}
                disabled={need === 0}
                aria-label={`Elegir a ${m.member.full_name}`}
                className="flex min-h-14 w-full items-center gap-3 px-3 py-2 text-left text-sm hover:bg-muted/60 focus-visible:bg-accent focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-inset focus-visible:ring-ring disabled:opacity-40"
              >
                {/* Mismo resumen que la búsqueda y el cobro: número para homónimos
                    y vigencia, que casi siempre es «Sin membresía» o «Vencido». */}
                <MemberHitSummary
                  member={{
                    member_id: m.member.id,
                    full_name: m.member.full_name,
                    phone: m.member.phone,
                    member_number: m.member.member_number,
                    folio: m.member.folio,
                    photo_url: m.member.photo_url,
                    access_status: m.access_status,
                    current_membership: m.current_membership ?? null,
                  }}
                />
              </button>
            ))
          )}
        </div>

        <div className="flex items-center justify-between gap-2 pt-2">
          {!canConfirm && (
            <p className="text-xs text-muted-foreground">
              {t.companion.needMore(selected.length, companionCount)}
            </p>
          )}
          <div className="ml-auto flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              {t.companion.cancel}
            </Button>
            <Button
              onClick={() => {
                onConfirm(selected.map((m) => m.member.id));
                onOpenChange(false);
              }}
              disabled={!canConfirm}
            >
              {t.companion.confirm}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
