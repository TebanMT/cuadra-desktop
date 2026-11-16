import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { BILLING_URL } from "@/lib/billing";
import { openExternalUrl } from "@/lib/openExternal";
import { trialEndedBody } from "@/lib/trialEnded";
import { auth } from "@/strings/auth";
import { useAuthStore } from "@/stores/useAuthStore";

const t = auth.login.trialExpired;

interface TrialEndedDialogProps {
  open: boolean;
  // Sigue al inicio. Lo llaman los dos botones y cerrar el aviso: la
  // recepción nunca se queda atorada en el login por la prueba.
  onContinue(): void;
}

// TrialEndedDialog es el aviso que muestran los logins (PIN y correo) cuando
// la prueba ya terminó. Solo informa: lo que se puede hacer lo decide el gym
// sincronizado (isTrialReadOnly), no este botón. El pago vive en el
// dashboard, así que solo el dueño ve "Activar mi plan".
export function TrialEndedDialog({ open, onContinue }: TrialEndedDialogProps) {
  const gym = useAuthStore((s) => s.gym);
  const isOwner = useAuthStore((s) => s.user?.role === "owner");

  async function activate() {
    await openExternalUrl(BILLING_URL);
    onContinue();
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onContinue()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t.title}</DialogTitle>
          <DialogDescription>{trialEndedBody(gym)}</DialogDescription>
        </DialogHeader>
        {!isOwner && <p className="text-sm text-muted-foreground">{t.operatorHint}</p>}
        <DialogFooter className="gap-2">
          {isOwner ? (
            <>
              <Button variant="outline" onClick={onContinue}>
                {t.later}
              </Button>
              <Button onClick={activate}>{t.activate}</Button>
            </>
          ) : (
            <Button onClick={onContinue}>{t.ok}</Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
