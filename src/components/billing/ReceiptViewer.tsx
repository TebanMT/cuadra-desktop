import { useState } from "react";
import { Loader2, Download, Printer, MessageCircle, Link as LinkIcon } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useReceiptPdf, useSendReceipt } from "@/hooks/useBilling";
import { printPdf } from "@/lib/tauri-bridge";
import { billing as t } from "@/strings/billing";

interface Props {
  paymentId: string | null;
  folio?: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}

export function ReceiptViewer({ paymentId, folio, open, onOpenChange }: Props) {
  const receipt = useReceiptPdf(open ? paymentId : null);
  const send = useSendReceipt(paymentId || "");
  const [copying, setCopying] = useState(false);

  async function download() {
    if (!receipt.data) return;
    const url = URL.createObjectURL(receipt.data);
    const a = document.createElement("a");
    a.href = url;
    a.download = `comprobante_${folio || paymentId || "pago"}.pdf`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  async function print() {
    if (!receipt.data) return;
    try {
      const buf = new Uint8Array(await receipt.data.arrayBuffer());
      await printPdf(buf);
      toast.success(t.payment.afterAction.printOk);
    } catch {
      toast.error(t.payment.afterAction.printError);
    }
  }

  async function sendWhatsapp() {
    try {
      await send.mutateAsync({ channel: "whatsapp" });
      toast.success(t.payment.afterAction.whatsappOk);
    } catch {
      toast.error(t.payment.afterAction.whatsappError);
    }
  }

  async function copyLink() {
    if (!paymentId) return;
    setCopying(true);
    try {
      const link = `${window.location.origin}/payments/${paymentId}/receipt`;
      await navigator.clipboard.writeText(link);
      toast.success(t.receipt.linkCopied);
    } finally {
      setCopying(false);
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
          <Button variant="outline" onClick={copyLink} disabled={copying || !paymentId}>
            <LinkIcon className="h-4 w-4" />
            {t.receipt.copyLink}
          </Button>
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
