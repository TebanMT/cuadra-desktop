import { Loader2, Download, Printer, MessageCircle } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useReceiptPdf, useSendReceipt } from "@/hooks/useBilling";
import { printPdf, saveBlob } from "@/lib/tauri-bridge";
import { notifySendReceiptOutcome } from "@/lib/receiptToasts";
import { billing as t } from "@/strings/billing";

interface Props {
  paymentId: string | null;
  folio?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

// Nota: no hay botón "Copiar enlace" — no existe (todavía) un link público
// de comprobante; el que se copiaba antes era la URL local del app
// (tauri://…), inútil fuera de esta máquina. El canal para compartir es
// WhatsApp. Si algún día hay links públicos firmados, vuelve el botón.
export function ReceiptViewer({ paymentId, folio, open, onOpenChange }: Props) {
  const receipt = useReceiptPdf(open ? paymentId : null);
  const send = useSendReceipt(paymentId || "");

  async function download() {
    if (!receipt.data) return;
    try {
      const path = await saveBlob(receipt.data, `comprobante_${folio || paymentId || "pago"}.pdf`);
      if (path) toast.success(t.receipt.downloadOk(path));
      // path null = canceló el diálogo — silencio.
    } catch {
      toast.error(t.receipt.downloadError);
    }
  }

  async function print() {
    if (!receipt.data) return;
    try {
      const buf = new Uint8Array(await receipt.data.arrayBuffer());
      const mode = await printPdf(buf);
      if (mode === "printed") {
        toast.success(t.payment.afterAction.printOk);
      } else {
        toast.info(t.payment.afterAction.printOpened);
      }
    } catch {
      toast.error(t.payment.afterAction.printError);
    }
  }

  async function sendWhatsapp() {
    try {
      const res = await send.mutateAsync({ channel: "whatsapp" });
      notifySendReceiptOutcome(res);
    } catch {
      toast.error(t.payment.afterAction.whatsappError);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-3xl h-[85vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t.receipt.title(folio || paymentId || "")}</DialogTitle>
        </DialogHeader>

        <div className="flex-1 overflow-hidden bg-muted/40 rounded-md border">
          {receipt.isLoading ? (
            <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
              <Loader2 className="h-5 w-5 animate-spin mr-2" />
              {t.receipt.loading}
            </div>
          ) : receipt.error || !receipt.objectUrl ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>{t.receipt.error}</AlertDescription>
              </Alert>
            </div>
          ) : (
            <iframe
              title={`receipt-${paymentId}`}
              src={receipt.objectUrl}
              className="w-full h-full bg-white"
            />
          )}
        </div>

        <div className="flex flex-wrap gap-2 justify-end pt-2">
          <Button variant="outline" onClick={download} disabled={!receipt.data}>
            <Download className="h-4 w-4" />
            {t.receipt.download}
          </Button>
          <Button variant="outline" onClick={print} disabled={!receipt.data}>
            <Printer className="h-4 w-4" />
            {t.receipt.print}
          </Button>
          <Button onClick={sendWhatsapp} disabled={send.isPending || !paymentId}>
            {send.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <MessageCircle className="h-4 w-4" />
            )}
            {t.receipt.sendWhatsapp}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
