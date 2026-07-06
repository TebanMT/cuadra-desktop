import { toast } from "sonner";
import { billing as t } from "@/strings/billing";

// Respuesta real de POST /payments/:id/send-receipt. `status` distingue lo
// que antes era un "éxito" ciego: queued (se encoló un envío), already_
// pending (el comprobante del pago sigue en la cola — no se duplica) y
// skipped (no se puede enviar: sin socio / sin teléfono). `note` viene del
// BE en es-MX lista para mostrarse.
export interface SendReceiptOutcome {
  status: string;
  note?: string;
}

// Traduce el veredicto del BE al toast correcto — compartido por el visor
// de comprobante y el modal de cobro. Las strings locales son fallback si
// la nota viene vacía (BE viejo).
export function notifySendReceiptOutcome(res: SendReceiptOutcome) {
  switch (res.status) {
    case "already_pending":
      toast.info(res.note || t.payment.afterAction.whatsappAlready);
      break;
    case "skipped":
      toast.warning(res.note || t.payment.afterAction.whatsappSkipped);
      break;
    default:
      toast.success(res.note || t.payment.afterAction.whatsappOk);
  }
}
