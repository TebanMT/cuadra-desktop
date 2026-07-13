import { useEffect, useMemo, useState } from "react";
import {
  AlertTriangle,
  Banknote,
  CreditCard,
  Handshake,
  Loader2,
  Smartphone,
} from "lucide-react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { fmtMoney, type PaymentMethod } from "@/hooks/useBilling";
import type { MemberSearchResult } from "@/hooks/useSales";
import { MemberAssociator } from "@/components/sales/MemberAssociator";
import { ApiError } from "@/lib/api";
import { cn } from "@/lib/utils";
import { sales as t } from "@/strings/sales";

// El "momento de cobrar" de la venta rápida, separado del armado de la
// cuenta (mismo patrón que PaymentModal en membresías). Aquí viven el
// método de pago, la calculadora de cambio y el fiado — antes los tres
// bloques colgaban permanentemente de la columna del carrito.
//
// Fiado es un MÉTODO más en la fila de botones, no un toggle al fondo:
// es como el operador lo piensa ("¿cómo me pagas? — luego te lo pago").
// El método del payment (cash/transfer/card) sigue siendo el de lo que
// SÍ se cobra ahora — el mini-selector dentro del pane de fiado.

type CheckoutMode = PaymentMethod | "fiado";

const CASH_QUICK_AMOUNTS = [50, 100, 200, 500, 1000] as const;

interface CheckoutModalProps {
  open: boolean;
  onOpenChange(open: boolean): void;
  total: number;
  itemCount: number;
  member: MemberSearchResult | null;
  onMemberChange(m: MemberSearchResult | null): void;
  submitting: boolean;
  // Lanza la venta. Debe THROW en error — el modal lo muestra sin
  // cerrarse; en éxito el dueño (la página) cierra y limpia.
  onConfirm(input: { method: PaymentMethod; paid?: number }): Promise<void>;
}

export function CheckoutModal({
  open,
  onOpenChange,
  total,
  itemCount,
  member,
  onMemberChange,
  submitting,
  onConfirm,
}: CheckoutModalProps) {
  const [mode, setMode] = useState<CheckoutMode>("cash");
  const [givenCash, setGivenCash] = useState("");
  const [paidValue, setPaidValue] = useState("");
  const [fiadoMethod, setFiadoMethod] = useState<PaymentMethod>("cash");
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      setMode("cash");
      setGivenCash("");
      setPaidValue("");
      setFiadoMethod("cash");
      setError(null);
    }
  }, [open]);

  const isFiado = mode === "fiado";
  const paidNow = useMemo(() => {
    if (!isFiado) return total;
    const v = parseFloat(paidValue);
    return Number.isFinite(v) ? v : 0;
  }, [isFiado, paidValue, total]);
  const balanceLeft = isFiado ? Math.max(0, total - paidNow) : 0;

  // Cambio: aplica cuando lo que entra en efectivo es el total (modo
  // cash) o el "cobrado ahora" del fiado pagado en efectivo.
  const cashToCover = isFiado ? paidNow : total;
  const showChange = (mode === "cash" || (isFiado && fiadoMethod === "cash")) && cashToCover > 0;
  const cashGiven = useMemo(() => {
    const v = parseFloat(givenCash);
    return Number.isFinite(v) ? v : 0;
  }, [givenCash]);
  const change = cashGiven - cashToCover;

  const fiadoInvalid =
    isFiado && (!member || paidNow <= 0 || paidNow > total);

  async function confirm() {
    setError(null);
    if (isFiado) {
      if (!member) {
        setError(t.page.credit.requiresMember);
        return;
      }
      if (paidNow <= 0) {
        setError(t.page.credit.paidMustBePositive);
        return;
      }
      if (paidNow > total) {
        setError(t.page.credit.paidExceedsTotal);
        return;
      }
    }
    try {
      await onConfirm({
        method: isFiado ? fiadoMethod : (mode as PaymentMethod),
        // paid sólo viaja cuando de verdad queda saldo — pagar el total
        // en modo fiado degrada a una venta normal.
        ...(isFiado && paidNow < total ? { paid: paidNow } : {}),
      });
    } catch (err) {
      if (err instanceof ApiError) {
        const data = err.details as Record<string, unknown> | null;
        setError((data?.exception as string | undefined) || t.page.errors.generic);
      } else {
        setError(t.page.errors.generic);
      }
    }
  }

  const modes: Array<{ key: CheckoutMode; label: string; icon: typeof Banknote }> = [
    { key: "cash", label: t.page.cart.methods.cash, icon: Banknote },
    { key: "card", label: t.page.cart.methods.card, icon: CreditCard },
    { key: "transfer", label: t.page.cart.methods.transfer, icon: Smartphone },
    { key: "fiado", label: t.page.checkout.fiado, icon: Handshake },
  ];

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      {/* El cobro no se cierra por clicks afuera: (1) un misclick en el
          momento del dinero tiraría método/monto ya capturados, y (2) el
          Popover del asociador de socio (pane de fiado) vive en un portal
          FUERA del DialogContent — sin esto, Radix trataba el pointerdown
          sobre el resultado de búsqueda como "interacción externa" y
          cerraba el modal antes de que el click asociara al socio. Se
          cierra con la X o Esc. */}
      <DialogContent
        className="max-w-md"
        onInteractOutside={(e) => e.preventDefault()}
        onPointerDownOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>{t.page.checkout.title}</DialogTitle>
          <div className="flex items-baseline justify-between pt-1">
            <span className="text-sm text-muted-foreground">{t.page.checkout.totalLabel}</span>
            <span className="text-3xl font-bold tabular-nums tracking-tight">
              {fmtMoney(total)}
            </span>
          </div>
          <p className="text-xs text-muted-foreground">
            {t.page.checkout.summary(itemCount, member?.full_name)}
          </p>
        </DialogHeader>

        <div className="space-y-4">
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* Métodos: botones grandes, ícono + etiqueta. Fiado al final. */}
          <div className="grid grid-cols-2 gap-2">
            {modes.map(({ key, label, icon: Icon }) => (
              <button
                key={key}
                type="button"
                onClick={() => setMode(key)}
                aria-pressed={mode === key}
                className={cn(
                  "flex items-center gap-2.5 rounded-lg border-2 px-3.5 py-3 text-sm font-semibold transition-colors",
                  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
                  mode === key
                    ? "border-primary bg-primary/5 text-foreground"
                    : "border-border bg-background hover:bg-muted text-foreground"
                )}
              >
                <Icon
                  className={cn("h-5 w-5 shrink-0", mode === key ? "text-primary" : "text-muted-foreground")}
                />
                {label}
              </button>
            ))}
          </div>

          {/* Pane por método */}
          {mode === "cash" && (
            <ChangeCalculator
              label={t.page.checkout.cashQuestion}
              cover={total}
              given={givenCash}
              onGiven={setGivenCash}
              change={change}
              showResult={givenCash !== ""}
            />
          )}

          {(mode === "card" || mode === "transfer") && (
            <div className="rounded-md border border-border bg-muted/40 p-3 text-sm text-muted-foreground">
              {mode === "card" ? t.page.checkout.cardHint : t.page.checkout.transferHint}
            </div>
          )}

          {isFiado && (
            <div className="space-y-3 rounded-md border border-warning/40 bg-warning/5 p-3">
              {!member ? (
                <div className="space-y-2">
                  <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                    {t.page.checkout.fiadoWho}
                  </Label>
                  <MemberAssociator member={member} onChange={onMemberChange} />
                </div>
              ) : (
                <>
                  <div className="space-y-1.5">
                    <Label
                      htmlFor="co-paid"
                      className="text-xs uppercase tracking-wide text-muted-foreground"
                    >
                      {t.page.checkout.fiadoQuestion}
                    </Label>
                    <Input
                      id="co-paid"
                      type="number"
                      inputMode="decimal"
                      min={0}
                      max={total}
                      step="0.01"
                      value={paidValue}
                      onChange={(e) => setPaidValue(e.target.value)}
                      placeholder="0.00"
                      autoFocus
                      className="h-11 text-lg font-semibold tabular-nums"
                    />
                  </div>
                  <div className="space-y-1.5">
                    <Label className="text-xs uppercase tracking-wide text-muted-foreground">
                      {t.page.checkout.fiadoMethodQuestion}
                    </Label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(["cash", "transfer", "card"] as PaymentMethod[]).map((m) => (
                        <button
                          key={m}
                          type="button"
                          onClick={() => setFiadoMethod(m)}
                          aria-pressed={fiadoMethod === m}
                          className={cn(
                            "h-9 rounded-md border text-xs font-medium transition-colors",
                            fiadoMethod === m
                              ? "bg-primary text-primary-foreground border-primary"
                              : "bg-background hover:bg-muted border-border"
                          )}
                        >
                          {t.page.cart.methods[m]}
                        </button>
                      ))}
                    </div>
                  </div>
                  {isFiado && fiadoMethod === "cash" && paidNow > 0 && (
                    <ChangeCalculator
                      label={t.page.change.label}
                      cover={paidNow}
                      given={givenCash}
                      onGiven={setGivenCash}
                      change={change}
                      showResult={givenCash !== ""}
                      compact
                    />
                  )}
                  <div className="flex items-center gap-2 text-sm font-semibold text-warning tabular-nums">
                    <AlertTriangle className="h-4 w-4 shrink-0" />
                    <span>{t.page.credit.balanceLabel(fmtMoney(balanceLeft))}</span>
                  </div>
                </>
              )}
            </div>
          )}

          <Button
            size="lg"
            className="w-full"
            onClick={confirm}
            disabled={submitting || fiadoInvalid}
          >
            {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
            {isFiado && balanceLeft > 0
              ? t.page.checkout.confirmFiado(fmtMoney(paidNow), fmtMoney(balanceLeft))
              : t.page.checkout.confirm(fmtMoney(total))}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Calculadora de cambio compartida entre el pane de efectivo y el de
// fiado-en-efectivo. Informativa: no bloquea el cobro (igual que antes).
function ChangeCalculator({
  label,
  cover,
  given,
  onGiven,
  change,
  showResult,
  compact = false,
}: {
  label: string;
  cover: number;
  given: string;
  onGiven(v: string): void;
  change: number;
  showResult: boolean;
  compact?: boolean;
}) {
  return (
    <div
      className={cn(
        "space-y-2 rounded-md border border-border bg-muted/40 p-3",
        compact && "bg-background/60"
      )}
    >
      <Label htmlFor="co-given" className="text-xs uppercase tracking-wide text-muted-foreground">
        {label}
      </Label>
      <Input
        id="co-given"
        type="number"
        inputMode="decimal"
        min={0}
        step="0.01"
        value={given}
        onChange={(e) => onGiven(e.target.value)}
        placeholder={t.page.change.placeholder}
        className={cn("text-base", compact ? "h-9" : "h-11 text-lg font-semibold tabular-nums")}
      />
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => onGiven(String(cover))}
          className="px-2 py-1 text-xs rounded border border-border bg-background hover:bg-muted transition-colors"
        >
          {t.page.change.exact}
        </button>
        {CASH_QUICK_AMOUNTS.filter((v) => v >= cover).map((v) => (
          <button
            key={v}
            type="button"
            onClick={() => onGiven(String(v))}
            className="px-2 py-1 text-xs rounded border border-border bg-background hover:bg-muted transition-colors tabular-nums"
          >
            ${v}
          </button>
        ))}
      </div>
      {showResult && (
        <div
          className={cn(
            "font-bold tabular-nums",
            compact ? "text-sm" : "text-lg",
            change >= 0 ? "text-success" : "text-destructive"
          )}
        >
          {change >= 0
            ? t.page.change.result(fmtMoney(change))
            : t.page.change.shortfall(fmtMoney(-change))}
        </div>
      )}
    </div>
  );
}
