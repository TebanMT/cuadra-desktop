import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberSearchInput } from "@/components/checkin/MemberSearchInput";
import type { MemberSearchResult } from "@/hooks/useSales";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  /**
   * Socio de la ficha abierta cuando no se le puede cobrar (inactivo). Se
   * explica arriba del buscador en lugar de dejar que el cobro no abra.
   */
  inactiveOpenMember?: { full_name: string } | null;
}

function isInactive(m: MemberSearchResult) {
  return m.access_status === "denied_inactive" || (m.status != null && m.status !== "active");
}

// QuickPayModal — atajo "Cobrar" desde el dashboard / TopBar. Pide al
// socio con el mismo buscador del check-in y al seleccionarlo navega al
// detalle del socio con ?action=pay para que el PaymentModal se abra
// automáticamente sin extra-clicks. Cada resultado trae número de socio
// y vigencia para no cobrarle a un homónimo.
//
// Mantener este modal mínimo (solo búsqueda) — la lógica de cobro vive
// en MemberDetailPage + PaymentModal, no la duplicamos acá.
export function QuickPayModal({ open, onOpenChange, inactiveOpenMember }: Props) {
  const navigate = useNavigate();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>¿A quién le vas a cobrar?</DialogTitle>
          <DialogDescription>
            Busca al socio por nombre o teléfono.
          </DialogDescription>
        </DialogHeader>
        {inactiveOpenMember && (
          <p role="note" className="rounded-md bg-muted px-3 py-2 text-sm text-muted-foreground">
            <span className="font-medium text-foreground">{inactiveOpenMember.full_name}</span> (socio abierto) está inactivo. Reactívalo en su ficha para cobrarle.
          </p>
        )}
        <MemberSearchInput
          size="lg"
          autoFocus
          onSelect={(m) => {
            onOpenChange(false);
            if (isInactive(m)) {
              // La ficha no abre el cobro a un socio inactivo: llevarlo ahí
              // con la explicación, nunca un cobro que no aparece.
              navigate(`/members/${m.member_id}`);
              toast.info(`${m.full_name} está inactivo. Reactívalo para cobrarle.`);
              return;
            }
            navigate(`/members/${m.member_id}?action=pay`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
