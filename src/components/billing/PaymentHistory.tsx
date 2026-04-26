import { useMemo, useState } from "react";
import { Loader2, Banknote, CreditCard, ArrowLeftRight, MoreHorizontal } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  usePaymentHistory,
  fmtMoney,
  type Payment,
  type PaymentConcept,
  type PaymentMethod,
} from "@/hooks/useBilling";
import { useAuthStore } from "@/stores/useAuthStore";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { billing as t } from "@/strings/billing";
import { ReceiptViewer } from "./ReceiptViewer";
import { SettleBalanceModal } from "./SettleBalanceModal";
import { RefundModal } from "./RefundModal";

interface Props {
  memberId: string;
  memberName: string;
}

const CONCEPT_OPTIONS: Array<{ value: PaymentConcept | "all"; label: string }> = [
  { value: "all", label: "Todos" },
  { value: "membership", label: "Membresías" },
  { value: "product", label: "Productos" },
  { value: "balance_settlement", label: "Abonos" },
  { value: "refund", label: "Devoluciones" },
  { value: "other", label: "Otros" },
];

function MethodIcon({ method }: { method: PaymentMethod | null }) {
  if (method === "cash") return <Banknote className="h-4 w-4 text-muted-foreground" />;
  if (method === "transfer") return <ArrowLeftRight className="h-4 w-4 text-muted-foreground" />;
  if (method === "card") return <CreditCard className="h-4 w-4 text-muted-foreground" />;
  return <span className="text-muted-foreground">—</span>;
}

export function PaymentHistory({ memberId, memberName }: Props) {
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = role === "owner";

  const [concept, setConcept] = useState<PaymentConcept | "all">("all");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");

  const filters = useMemo(
    () => ({ concept: concept === "all" ? undefined : concept, from, to }),
    [concept, from, to]
  );

  const history = usePaymentHistory(memberId, filters);

  const [receiptId, setReceiptId] = useState<string | null>(null);
  const [receiptFolio, setReceiptFolio] = useState<string | undefined>(undefined);
  const [settleTarget, setSettleTarget] = useState<Payment | null>(null);
  const [refundTarget, setRefundTarget] = useState<Payment | null>(null);

  const items = history.data?.items ?? [];

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-xs">
        <div className="space-y-1">
          <Label htmlFor="ph-concept" className="text-xs">
            {t.history.filters.conceptLabel}
          </Label>
          <Select
            value={concept}
            onValueChange={(v) => setConcept(v as PaymentConcept | "all")}
          >
            <SelectTrigger id="ph-concept" className="h-9 text-sm">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {CONCEPT_OPTIONS.map((o) => (
                <SelectItem key={o.value} value={o.value}>
                  {o.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="ph-from" className="text-xs">
            {t.history.filters.from}
          </Label>
          <Input
            id="ph-from"
            type="date"
            value={from}
            onChange={(e) => setFrom(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="ph-to" className="text-xs">
            {t.history.filters.to}
          </Label>
          <Input
            id="ph-to"
            type="date"
            value={to}
            onChange={(e) => setTo(e.target.value)}
            className="h-9"
          />
        </div>
      </div>

      {history.isLoading ? (
        <div className="flex justify-center py-6">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      ) : history.error ? (
        <Alert variant="destructive">
          <AlertDescription>{t.history.error}</AlertDescription>
        </Alert>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-6">{t.history.empty}</p>
      ) : (
        <div className="rounded-md border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="text-xs">{t.history.columns.date}</TableHead>
                <TableHead className="text-xs">{t.history.columns.concept}</TableHead>
                <TableHead className="text-xs text-right">{t.history.columns.amount}</TableHead>
                <TableHead className="text-xs">{t.history.columns.method}</TableHead>
                <TableHead className="text-xs">{t.history.columns.notes}</TableHead>
                <TableHead className="text-xs">{t.history.columns.operator}</TableHead>
                <TableHead className="w-10" />
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => {
                const isNeg = p.amount < 0;
                return (
                  <TableRow
                    key={p.id}
                    className="cursor-pointer"
                    onClick={() => {
                      setReceiptId(p.id);
                      setReceiptFolio(p.reference);
                    }}
                  >
                    <TableCell className="text-sm tabular-nums">
                      {fmtDate(p.payment_date)}
                    </TableCell>
                    <TableCell className="text-sm">
                      {t.history.concepts[p.concept] || p.concept}
                      {p.balance_pending > 0 && (
                        <span className="ml-1 text-xs text-warning">
                          • {t.history.pendingFlag(fmtMoney(p.balance_pending))}
                        </span>
                      )}
                    </TableCell>
                    <TableCell
                      className={cn(
                        "text-sm text-right tabular-nums font-medium",
                        isNeg && "text-destructive"
                      )}
                    >
                      {fmtMoney(p.amount)}
                    </TableCell>
                    <TableCell>
                      <MethodIcon method={p.payment_method} />
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground max-w-[12rem] truncate">
                      {p.notes || "—"}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {p.operator_name || "—"}
                    </TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem
                            onSelect={() => {
                              setReceiptId(p.id);
                              setReceiptFolio(p.reference);
                            }}
                          >
                            {t.history.rowOpenReceipt}
                          </DropdownMenuItem>
                          {p.balance_pending > 0 && p.concept === "membership" && (
                            <DropdownMenuItem onSelect={() => setSettleTarget(p)}>
                              {t.history.pendingSettle}
                            </DropdownMenuItem>
                          )}
                          {isOwner && p.concept !== "refund" && p.amount > 0 && (
                            <DropdownMenuItem
                              onSelect={() => setRefundTarget(p)}
                              className="text-destructive"
                            >
                              {t.history.rowRefund}
                            </DropdownMenuItem>
                          )}
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </div>
      )}

      <ReceiptViewer
        paymentId={receiptId}
        folio={receiptFolio}
        open={receiptId !== null}
        onOpenChange={(o) => {
          if (!o) {
            setReceiptId(null);
            setReceiptFolio(undefined);
          }
        }}
      />

      {settleTarget && (
        <SettleBalanceModal
          paymentId={settleTarget.id}
          memberName={memberName}
          pendingBalance={settleTarget.balance_pending}
          open={!!settleTarget}
          onOpenChange={(o) => !o && setSettleTarget(null)}
        />
      )}

      {refundTarget && (
        <RefundModal
          payment={refundTarget}
          open={!!refundTarget}
          onOpenChange={(o) => !o && setRefundTarget(null)}
        />
      )}
    </div>
  );
}
