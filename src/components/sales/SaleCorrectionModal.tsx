import { validateDateFields } from "@/lib/date-input";
import { DateInput } from "@/components/ui/date-input";
import { useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, Loader2, Minus, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import {
  useCorrectSale,
  useSaleDetail,
  type CorrectSaleResponse,
  type SaleCorrectionIncreaseResolution,
  type SaleCorrectionMoneyResolution,
  type SaleCorrectionRefundMethod,
} from "@/hooks/useSales";
import { fmtMoney } from "@/hooks/useBilling";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sales as t } from "@/strings/sales";
import { useAuthStore } from "@/stores/useAuthStore";
import { PendingRefundsPanel } from "./PendingRefundsPanel";
import { CashDrawerField } from "@/components/cash/CashDrawerField";
import { useActiveProducts } from "@/hooks/useProducts";
import { keyForPayload } from "@/lib/idempotency";
import { todayIso } from "@/lib/dates";

interface SaleCorrectionModalProps {
  saleId: string | null;
  open: boolean;
  onOpenChange(open: boolean): void;
  onCorrected?(response: CorrectSaleResponse): void;
}

type QuantityDraft = Record<string, number>;

export function SaleCorrectionModal({
  saleId,
  open,
  onOpenChange,
  onCorrected,
}: SaleCorrectionModalProps) {
  const detail = useSaleDetail(saleId, open);
  const products = useActiveProducts();
  const correction = useCorrectSale(saleId ?? "");
  const sale = detail.data;
  const isOwner = useAuthStore((state) => state.user?.role === "owner");

  const [quantities, setQuantities] = useState<QuantityDraft>({});
  const [replacementProducts, setReplacementProducts] = useState<Record<string, string>>({});
  const [addedProductIds, setAddedProductIds] = useState<string[]>([]);
  const [productToAdd, setProductToAdd] = useState("");
  const [reason, setReason] = useState("");
  const [resolution, setResolution] = useState<SaleCorrectionMoneyResolution | "">("");
  const [refundMethod, setRefundMethod] = useState<SaleCorrectionRefundMethod | "">("");
  const [cashDrawerId, setCashDrawerId] = useState<string>();
  const [increaseResolution, setIncreaseResolution] = useState<SaleCorrectionIncreaseResolution | "">("");
  const [collectionMethod, setCollectionMethod] = useState<SaleCorrectionRefundMethod | "">("");
  const [collectionCashDrawerId, setCollectionCashDrawerId] = useState<string>();
  const [collectionDate, setCollectionDate] = useState(todayIso());
  const attempt = useRef<{ fingerprint: string; key: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [versionConflict, setVersionConflict] = useState(false);

  useEffect(() => {
    if (!open || !sale) return;
    setQuantities(Object.fromEntries(sale.lines.map((line) => [line.sale_item_id, line.quantity])));
    setReplacementProducts({});
    setAddedProductIds([]);
    setProductToAdd("");
    setReason("");
    setResolution("");
    setRefundMethod("");
    setCashDrawerId(undefined);
    setIncreaseResolution("");
    setCollectionMethod("");
    setCollectionCashDrawerId(undefined);
    setCollectionDate(todayIso());
    attempt.current = null;
    setError(null);
    setVersionConflict(false);
  }, [open, sale]);

  const catalogByID = useMemo(
    () => new Map((products.data ?? []).map((product) => [product.id, product])),
    [products.data]
  );
  const correctedLines = useMemo(() => {
    const existing = (sale?.lines ?? []).map((line) => {
      const productID = replacementProducts[line.sale_item_id] ?? line.product_id;
      const replacement = productID === line.product_id ? undefined : catalogByID.get(productID);
      return {
        draftKey: line.sale_item_id,
        saleItemID: line.sale_item_id as string | undefined,
        originalProductID: line.product_id,
        productID,
        productName: replacement?.name ?? line.product_name,
        unitPrice: replacement?.price ?? line.unit_price,
        originalQuantity: line.quantity,
        correctedQuantity: quantities[line.sale_item_id] ?? line.quantity,
      };
    });
    const added = addedProductIds.flatMap((productID) => {
      const product = catalogByID.get(productID);
      if (!product) return [];
      const draftKey = `new:${productID}`;
      return [{ draftKey, saleItemID: undefined, originalProductID: undefined, productID, productName: product.name, unitPrice: product.price, originalQuantity: 0, correctedQuantity: quantities[draftKey] ?? 1 }];
    });
    return [...existing, ...added];
  }, [addedProductIds, catalogByID, quantities, replacementProducts, sale?.lines]);

  const preview = useMemo(() => {
    if (!sale) {
      return {
        changed: false,
        restored: 0,
        deducted: 0,
        subtotal: 0,
        total: 0,
        difference: 0,
        refundDue: 0,
        additionalDue: 0,
        annul: false,
      };
    }
    let changed = false;
    let restored = 0;
    let deducted = 0;
    let subtotal = 0;
    for (const line of correctedLines) {
      const quantity = Math.max(0, Math.trunc(line.correctedQuantity));
      const replaced = !!line.originalProductID && line.productID !== line.originalProductID;
      changed ||= quantity !== line.originalQuantity || replaced || (!line.saleItemID && quantity > 0);
      if (replaced) {
        restored += line.originalQuantity;
        deducted += quantity;
      } else {
        restored += Math.max(0, line.originalQuantity - quantity);
        deducted += Math.max(0, quantity - line.originalQuantity);
      }
      subtotal += line.unitPrice * quantity;
    }
    // La corrección conserva la tasa efectiva del descuento original. Usar
    // el monto absoluto viejo exageraba el descuento al bajar cantidades y
    // hacía que la UI confirmara una devolución distinta a la del backend.
    const discountRate = sale.subtotal > 0 ? sale.discount / sale.subtotal : 0;
    const correctedDiscount = Math.round(subtotal * discountRate * 100) / 100;
    const total = Math.max(0, subtotal - correctedDiscount);
    const difference = sale.total - total;
    const netCollected = Math.max(0, sale.collected - sale.refunded);
    const refundDue = Math.max(0, Math.min(sale.refundable, netCollected - total));
    const additionalDue = Math.max(0, total - sale.total);
    const annul = changed && correctedLines.every((line) => Math.max(0, Math.trunc(line.correctedQuantity)) === 0);
    return { changed, restored, deducted, subtotal, total, difference, refundDue, additionalDue, annul };
  }, [correctedLines, sale]);

  const needsMoneyDecision = preview.refundDue >= 0.01;
  const needsIncreaseDecision = preview.additionalDue >= 0.01;

  function setQuantity(lineID: string, next: number) {
    if (!Number.isFinite(next)) return;
    setQuantities((current) => ({
      ...current,
      [lineID]: Math.min(99_999, Math.max(0, Math.trunc(next))),
    }));
    setError(null);
  }

  function selectReplacement(lineID: string, productID: string) {
    const usedElsewhere = correctedLines.some((line) => line.draftKey !== lineID && line.productID === productID && line.correctedQuantity > 0);
    if (usedElsewhere) return toast.error("Ese producto ya está incluido en la venta corregida.");
    setReplacementProducts((current) => ({ ...current, [lineID]: productID }));
    setError(null);
  }

  function addProduct() {
    if (!productToAdd) return;
    if (correctedLines.some((line) => line.productID === productToAdd && line.correctedQuantity > 0)) return toast.error("Ese producto ya está incluido.");
    const draftKey = `new:${productToAdd}`;
    setAddedProductIds((current) => [...current, productToAdd]);
    setQuantities((current) => ({ ...current, [draftKey]: 1 }));
    setProductToAdd("");
    setError(null);
  }

  function removeLine(lineID: string) {
    if (lineID.startsWith("new:")) {
      const productID = lineID.slice(4);
      setAddedProductIds((current) => current.filter((id) => id !== productID));
      return;
    }
    setQuantity(lineID, 0);
  }

  async function reload() {
    setError(null);
    setVersionConflict(false);
    attempt.current = null;
    await detail.refetch();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    setVersionConflict(false);
    if (!sale || !preview.changed) {
      setError(t.page.correction.errors.unchanged);
      return;
    }
    if (reason.trim().length < 3) {
      setError(t.page.correction.errors.reason);
      return;
    }
    if (isOwner && needsMoneyDecision && !resolution) {
      setError("Elige qué pasó realmente con el dinero cobrado.");
      return;
    }
    if (isOwner && needsMoneyDecision && resolution === "refund_excess" && !refundMethod) {
      setError(t.page.correction.errors.refundMethod);
      return;
    }
    if (needsIncreaseDecision && isOwner && !increaseResolution) {
      setError("Elige qué pasó con el monto adicional de la venta corregida.");
      return;
    }
    const effectiveIncreaseResolution: SaleCorrectionIncreaseResolution | undefined = needsIncreaseDecision
      ? isOwner ? increaseResolution || undefined : "pending"
      : undefined;
    if (effectiveIncreaseResolution === "pending" && !sale.member_id) {
      setError("Esta venta no está ligada a un socio; no puede dejarse el monto adicional pendiente.");
      return;
    }
    if (effectiveIncreaseResolution === "collect_now" && !collectionMethod) {
      setError("Selecciona cómo se cobró el monto adicional.");
      return;
    }

    const effectiveResolution: SaleCorrectionMoneyResolution = isOwner && needsMoneyDecision
      ? resolution || "record_only"
      : "record_only";

    try {
      const payload = {
        expected_version: sale.version,
        reason: reason.trim(),
        ...(preview.annul ? { annul: true } : {}),
        lines: preview.annul ? [] : correctedLines
          .filter((line) => line.correctedQuantity > 0)
          .map((line) => ({
            ...(line.saleItemID ? { sale_item_id: line.saleItemID } : {}),
            product_id: line.productID,
            quantity: Math.trunc(line.correctedQuantity),
          })),
        money_resolution: effectiveResolution,
        ...(effectiveIncreaseResolution ? { increase_resolution: effectiveIncreaseResolution } : {}),
        ...(isOwner && effectiveResolution === "refund_excess" && refundMethod
          ? {
              refund_method: refundMethod,
              ...(refundMethod === "cash" && cashDrawerId
                ? { cash_drawer_id: cashDrawerId }
                : {}),
            }
          : {}),
        ...(isOwner && effectiveIncreaseResolution === "collect_now" && collectionMethod
          ? { collection_method: collectionMethod, collection_date: collectionDate, ...(collectionMethod === "cash" && collectionCashDrawerId ? { collection_cash_drawer_id: collectionCashDrawerId } : {}) }
          : {}),
      };
      attempt.current = keyForPayload(attempt.current, { sale_id: sale.id, ...payload });
      const response = await correction.mutateAsync({ ...payload, idempotency_key: attempt.current.key });
      attempt.current = null;

      const money = response.money_effect;
      if (money.money_status === "refund_pending" && money.refund_due > 0) {
        toast.warning(t.page.correction.successPending(fmtMoney(money.refund_due)));
      } else if ((money.refund_amount ?? 0) > 0) {
        toast.success(t.page.correction.successRefund(fmtMoney(money.refund_amount)));
      } else if (money.additional_collected_now > 0) {
        toast.success(`Venta corregida · se cobraron ${fmtMoney(money.additional_collected_now)} ahora.`);
      } else if (money.additional_pending > 0) {
        toast.success(`Venta corregida · quedaron ${fmtMoney(money.additional_pending)} por cobrar.`);
      } else if (money.additional_historical_collected > 0) {
        toast.success(`Venta corregida · registramos ${fmtMoney(money.additional_historical_collected)} que ya se habían cobrado.`);
      } else if (response.annulled) {
        toast.success("Venta anulada.");
      } else {
        toast.success(t.page.correction.success);
      }
      onCorrected?.(response);
      onOpenChange(false);
    } catch (caught) {
      if (caught instanceof ApiError) {
        const details = caught.details as Record<string, unknown> | null;
        const conflict =
          caught.status === 409 &&
          (caught.code === "version_conflict" || details?.error === "version_conflict");
        if (conflict) {
          setVersionConflict(true);
          setError(t.page.correction.errors.versionConflict);
          return;
        }
        setError(
          (details?.exception as string | undefined) ||
            (details?.message as string | undefined) ||
            caught.message ||
            t.page.correction.errors.generic
        );
        return;
      }
      setError(t.page.correction.errors.generic);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !correction.isPending && onOpenChange(next)}>
      <DialogContent
        className="max-w-3xl max-h-[90vh] overflow-y-auto"
        onInteractOutside={(event) => event.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.page.correction.title(sale?.folio)}</DialogTitle>
          <DialogDescription>{t.page.correction.description}</DialogDescription>
        </DialogHeader>

        {detail.isLoading ? (
          <div className="flex items-center justify-center gap-2 py-16 text-sm text-muted-foreground">
            <Loader2 className="h-5 w-5 animate-spin" /> {t.page.correction.loading}
          </div>
        ) : detail.isError || !sale ? (
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
              <span>{t.page.correction.loadError}</span>
              <Button type="button" variant="outline" size="sm" onClick={() => detail.refetch()}>
                <RotateCcw className="h-4 w-4 mr-1.5" /> {t.page.correction.retry}
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <form onSubmitCapture={validateDateFields} onSubmit={submit} className="space-y-5">
            {error && (
              <Alert variant={versionConflict ? "warning" : "destructive"}>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription className="flex flex-wrap items-center justify-between gap-3">
                  <span>{error}</span>
                  {versionConflict && (
                    <Button type="button" variant="outline" size="sm" onClick={reload}>
                      <RotateCcw className="h-4 w-4 mr-1.5" /> Recargar venta
                    </Button>
                  )}
                </AlertDescription>
              </Alert>
            )}

            {(sale.pending_refunds?.length ?? 0) > 0 && (
              <PendingRefundsPanel
                saleId={sale.id}
                pendingRefundDue={sale.pending_refund_due}
                pendingRefunds={sale.pending_refunds}
                defaultMethod={sale.payment?.payment_method}
              />
            )}

            <div className="overflow-x-auto rounded-lg border border-border">
              <table className="w-full min-w-[620px] text-sm">
                <thead className="bg-muted/50 text-xs text-muted-foreground">
                  <tr>
                    <th className="px-4 py-2.5 text-left font-medium">{t.page.correction.product}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t.page.correction.captured}</th>
                    <th className="px-3 py-2.5 text-center font-medium">{t.page.correction.corrected}</th>
                    <th className="px-4 py-2.5 text-right font-medium">{t.page.correction.stockEffect}</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {correctedLines.map((line) => {
                    const replaced = !!line.originalProductID && line.productID !== line.originalProductID;
                    const restored = replaced ? line.originalQuantity : Math.max(0, line.originalQuantity - line.correctedQuantity);
                    const deducted = replaced ? line.correctedQuantity : Math.max(0, line.correctedQuantity - line.originalQuantity);
                    return (
                      <tr key={line.draftKey}>
                        <td className="px-4 py-3">
                          <p className="font-medium text-foreground">{line.productName}</p>
                          <p className="text-xs tabular text-muted-foreground">
                            {fmtMoney(line.unitPrice)} c/u
                          </p>
                          {line.saleItemID && <select aria-label={`Producto correcto para ${line.productName}`} value={line.productID} onChange={(event) => selectReplacement(line.draftKey, event.target.value)} className="mt-2 h-8 max-w-[220px] rounded-md border bg-background px-2 text-xs"><option value={line.originalProductID}>{line.productID === line.originalProductID ? line.productName : "Producto capturado originalmente"}</option>{(products.data ?? []).filter((product) => product.id !== line.originalProductID).map((product) => <option key={product.id} value={product.id}>{product.name} · existencias {product.stock}</option>)}</select>}
                        </td>
                        <td className="px-3 py-3 text-center font-medium tabular">{line.originalQuantity}</td>
                        <td className="px-3 py-3">
                          <div className="mx-auto flex w-fit items-center gap-1.5">
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t.page.correction.decreaseLine(line.productName)}
                              onClick={() => setQuantity(line.draftKey, line.correctedQuantity - 1)}
                              disabled={line.correctedQuantity <= 0}
                            >
                              <Minus className="h-3.5 w-3.5" />
                            </Button>
                            <Input
                              type="number"
                              min={0}
                              step={1}
                              value={line.correctedQuantity}
                              onChange={(event) =>
                                setQuantity(line.draftKey, Number(event.target.value))
                              }
                              aria-label={`${line.productName}, cantidad correcta`}
                              className="h-8 w-20 text-center tabular"
                            />
                            <Button
                              type="button"
                              variant="outline"
                              size="icon"
                              className="h-8 w-8"
                              aria-label={t.page.correction.increaseLine(line.productName)}
                              onClick={() => setQuantity(line.draftKey, line.correctedQuantity + 1)}
                            >
                              <Plus className="h-3.5 w-3.5" />
                            </Button>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              aria-label={t.page.correction.removeLine(line.productName)}
                              onClick={() => removeLine(line.draftKey)}
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          </div>
                        </td>
                        <td
                          className={cn(
                            "px-4 py-3 text-right text-xs font-medium tabular",
                            restored > 0
                              ? "text-success"
                              : deducted > 0
                                ? "text-warning"
                                : "text-muted-foreground"
                          )}
                        >
                          {restored > 0
                            ? t.page.correction.restores(restored)
                            : deducted > 0
                              ? t.page.correction.deducts(deducted)
                              : t.page.correction.unchanged}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div className="flex flex-col gap-2 rounded-md border border-dashed p-3 sm:flex-row sm:items-end">
              <div className="flex-1 space-y-1"><Label htmlFor="sale-correction-add-product">Agregar producto que faltó</Label><select id="sale-correction-add-product" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={productToAdd} onChange={(event) => setProductToAdd(event.target.value)}><option value="">Selecciona un producto</option>{(products.data ?? []).filter((product) => !correctedLines.some((line) => line.productID === product.id && line.correctedQuantity > 0)).map((product) => <option key={product.id} value={product.id}>{product.name} · {fmtMoney(product.price)} · existencias {product.stock}</option>)}</select></div><Button type="button" variant="outline" onClick={addProduct} disabled={!productToAdd || products.isLoading}><Plus className="h-4 w-4 mr-1" />Agregar</Button>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
              <PreviewNumber label={t.page.correction.registeredTotal} value={fmtMoney(sale.total)} />
              <PreviewNumber label={t.page.correction.correctedTotal} value={fmtMoney(preview.total)} />
              <PreviewNumber
                label={t.page.correction.difference}
                value={fmtMoney(Math.abs(preview.difference))}
                tone={Math.abs(preview.difference) >= 0.01 ? "warning" : "neutral"}
              />
            </div>
            <div className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
              <p>{t.page.correction.inventoryPreview(preview.restored, preview.deducted)}</p>
              {sale.discount > 0 && <p className="mt-1">{t.page.correction.discountHint}</p>}
            </div>

            {preview.annul && <Alert variant="warning"><AlertTriangle className="h-4 w-4" /><AlertDescription>Sin productos, la venta quedará anulada. Si el cliente regresó mercancía, usa “Registrar devolución”.</AlertDescription></Alert>}

            {needsIncreaseDecision && isOwner && (
              <fieldset className="space-y-3"><legend className="text-sm font-semibold">¿Qué pasó con los {fmtMoney(preview.additionalDue)} adicionales?</legend><RadioGroup value={increaseResolution} onValueChange={(value) => { setIncreaseResolution(value as SaleCorrectionIncreaseResolution); setError(null); }} className="grid gap-2"><ResolutionOption value="pending" title="Quedaron por cobrar" description={sale.member_id ? "Se suma al saldo pendiente del socio." : "No disponible: esta venta no está ligada a un socio."} selected={increaseResolution === "pending"} /><ResolutionOption value="already_collected" title="Ya se habían cobrado" description="Corrige el cobro original. El corte afectado quedará por revisar." selected={increaseResolution === "already_collected"} /><ResolutionOption value="collect_now" title="Se cobran ahora" description="Registra un cobro nuevo con la fecha y forma de pago de hoy." selected={increaseResolution === "collect_now"} /></RadioGroup></fieldset>
            )}

            {needsIncreaseDecision && !isOwner && <Alert variant="warning"><AlertDescription>{sale.member_id ? `Puedes dejar ${fmtMoney(preview.additionalDue)} pendientes al socio. Para registrar el cobro, pide al dueño que lo confirme.` : "Esta venta no tiene socio y el aumento requiere que el dueño confirme si ya se cobró o se cobra ahora."}</AlertDescription></Alert>}

            {isOwner && increaseResolution === "collect_now" && needsIncreaseDecision && <div className="grid gap-3 sm:grid-cols-2"><div className="space-y-2"><Label htmlFor="sale-correction-collection-method">Método del cobro adicional</Label><select id="sale-correction-collection-method" className="h-10 w-full rounded-md border bg-background px-3 text-sm" value={collectionMethod} onChange={(event) => { setCollectionMethod(event.target.value as SaleCorrectionRefundMethod); if (event.target.value !== "cash") setCollectionCashDrawerId(undefined); }}><option value="">Selecciona</option><option value="cash">Efectivo</option><option value="transfer">Transferencia</option><option value="card">Tarjeta</option></select></div><div className="space-y-2"><Label htmlFor="sale-correction-collection-date">Fecha real del cobro</Label><DateInput id="sale-correction-collection-date" context="recent" max={todayIso()} value={collectionDate} onValueChange={(event) => setCollectionDate(event)} /></div>{collectionMethod === "cash" && <CashDrawerField value={collectionCashDrawerId} onChange={setCollectionCashDrawerId} id="sale-correction-collection-drawer" />}</div>}

            {needsMoneyDecision && isOwner && (
              <fieldset className="space-y-3">
                <legend className="text-sm font-semibold text-foreground">
                  {t.page.correction.moneyQuestion}
                </legend>
                <RadioGroup
                  value={resolution}
                  onValueChange={(value) => {
                    setResolution(value as SaleCorrectionMoneyResolution);
                    setError(null);
                  }}
                  className="grid gap-2"
                >
                  <ResolutionOption
                    value="record_only"
                    title={t.page.correction.recordOnly}
                    description={t.page.correction.recordOnlyHint(fmtMoney(preview.total))}
                    selected={resolution === "record_only"}
                  />
                  <ResolutionOption
                    value="refund_excess"
                    title={t.page.correction.refundNow}
                    description={t.page.correction.refundNowHint(fmtMoney(preview.refundDue))}
                    selected={resolution === "refund_excess"}
                  />
                  <ResolutionOption
                    value="refund_pending"
                    title={t.page.correction.refundPending}
                    description={t.page.correction.refundPendingHint(fmtMoney(preview.refundDue))}
                    selected={resolution === "refund_pending"}
                  />
                </RadioGroup>
              </fieldset>
            )}

            {needsMoneyDecision && !isOwner && (
              <div className="space-y-2 rounded-lg border border-warning/40 bg-warning/5 p-3">
                <p className="text-sm font-semibold text-foreground">
                  {t.page.correction.recordOnly}
                </p>
                <p className="text-xs leading-relaxed text-muted-foreground">
                  {t.page.correction.operatorLimit}
                </p>
                <p className="text-xs font-medium leading-relaxed text-warning">
                  {t.page.correction.operatorNeedsOwner}
                </p>
              </div>
            )}

            {isOwner && needsMoneyDecision && resolution === "refund_excess" && (
              <fieldset className="space-y-2">
                <legend className="text-sm font-semibold text-foreground">
                  {t.page.correction.refundMethod}
                </legend>
                <RadioGroup
                  value={refundMethod}
                  onValueChange={(value) => {
                    setRefundMethod(value as SaleCorrectionRefundMethod);
                    setError(null);
                  }}
                  className="grid grid-cols-2 gap-2 sm:grid-cols-3"
                >
                  {(["cash", "transfer", "card"] as const).map((method) => (
                    <label
                      key={method}
                      className={cn(
                        "flex cursor-pointer items-center gap-2 rounded-md border px-3 py-2 text-sm",
                        refundMethod === method ? "border-primary bg-primary/5" : "border-border"
                      )}
                    >
                      <RadioGroupItem value={method} />
                      {t.page.correction.refundMethods[method]}
                    </label>
                  ))}
                </RadioGroup>
              </fieldset>
            )}

            {isOwner && needsMoneyDecision && resolution === "refund_excess" && refundMethod === "cash" && (
              <CashDrawerField
                value={cashDrawerId}
                onChange={setCashDrawerId}
                id="sale-correction-refund-cash-drawer"
              />
            )}

            <div className="space-y-2">
              <Label htmlFor="sale-correction-reason">{t.page.correction.reason} *</Label>
              <Textarea
                id="sale-correction-reason"
                value={reason}
                onChange={(event) => {
                  setReason(event.target.value);
                  setError(null);
                }}
                placeholder={t.page.correction.reasonPlaceholder}
                rows={3}
                maxLength={500}
              />
            </div>

            <div className="flex justify-end gap-2 pt-1">
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={correction.isPending}
              >
                {t.page.correction.cancel}
              </Button>
              <Button type="submit" disabled={correction.isPending || !preview.changed}>
                {correction.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                {correction.isPending
                  ? t.page.correction.submitting
                  : t.page.correction.submit}
              </Button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}

function PreviewNumber({
  label,
  value,
  tone = "neutral",
}: {
  label: string;
  value: string;
  tone?: "neutral" | "warning";
}) {
  return (
    <div className="rounded-lg border border-border bg-card px-4 py-3">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
      <p
        className={cn(
          "mt-1 text-xl font-bold tabular",
          tone === "warning" ? "text-warning" : "text-foreground"
        )}
      >
        {value}
      </p>
    </div>
  );
}

function ResolutionOption({
  value,
  title,
  description,
  selected,
}: {
  value: SaleCorrectionMoneyResolution | SaleCorrectionIncreaseResolution;
  title: string;
  description: string;
  selected: boolean;
}) {
  return (
    <label
      className={cn(
        "flex cursor-pointer items-start gap-3 rounded-lg border p-3 transition-colors",
        selected ? "border-primary bg-primary/5" : "border-border hover:bg-muted/40"
      )}
    >
      <RadioGroupItem value={value} className="mt-0.5 shrink-0" />
      <span>
        <span className="block text-sm font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-muted-foreground">
          {description}
        </span>
      </span>
    </label>
  );
}
