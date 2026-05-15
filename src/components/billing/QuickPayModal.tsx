import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { MemberSearchInput } from "@/components/checkin/MemberSearchInput";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

// QuickPayModal — atajo "Cobrar" desde el dashboard / TopBar. Pide al
// socio con el mismo buscador del check-in y al seleccionarlo navega al
// detalle del socio con ?action=pay para que el PaymentModal se abra
// automáticamente sin extra-clicks.
//
// Mantener este modal mínimo (solo búsqueda) — la lógica de cobro vive
// en MemberDetailPage + PaymentModal, no la duplicamos acá.
export function QuickPayModal({ open, onOpenChange }: Props) {
  const navigate = useNavigate();

  // Cerrar el modal cuando cambia el open externo (cleanup).
  useEffect(() => {
    if (!open) return;
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>¿A quién le vas a cobrar?</DialogTitle>
          <DialogDescription>
            Busca por nombre o teléfono. Te llevo a su perfil con el modal de cobro listo.
          </DialogDescription>
        </DialogHeader>
        <MemberSearchInput
          size="lg"
          autoFocus
          onSelect={(m) => {
            onOpenChange(false);
            navigate(`/members/${m.member_id}?action=pay`);
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
