import { useMemo, useState, useCallback } from "react";
import { Loader2, Mail, Phone, Pencil, BadgeMinus, BadgeCheck, KeyRound, DollarSign, Lock, Wallet, Fingerprint } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
} from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useMember } from "@/hooks/useMembers";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useBiometricStatus } from "@/hooks/useBiometric";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePaymentHistory, fmtMoney } from "@/hooks/useBilling";
import { fmtDate, daysFromToday } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { members as t } from "@/strings/members";
import { billing as bt } from "@/strings/billing";
import { checkin as ct } from "@/strings/checkin";
import { MemberEditDialog } from "./MemberEditDialog";
import { MemberStatusModal } from "./MemberStatusModal";
import { LockExpiryModal } from "./LockExpiryModal";
import { AssignPinModal } from "./AssignPinModal";
import { RegisterFingerprintModal } from "./RegisterFingerprintModal";
import { PaymentModal } from "@/components/billing/PaymentModal";
import { SettleBalanceModal } from "@/components/billing/SettleBalanceModal";
import { PaymentHistory } from "@/components/billing/PaymentHistory";

interface Props {
  memberId: string | null;
  onClose(): void;
  planMap?: Record<string, string>;
}

function initials(name: string): string {
  const parts = name.trim().split(/\s+/);
  return ((parts[0]?.[0] || "") + (parts[1]?.[0] || "")).toUpperCase();
}

export function MemberDetailSheet({ memberId, onClose }: Props) {
  const open = !!memberId;
  const detail = useMember(memberId);
  const role = useAuthStore((s) => s.user?.role);
  const history = usePaymentHistory(memberId, {});

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [pinOpen, setPinOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [fpOpen, setFpOpen] = useState(false);
  const bio = useBiometricStatus(open);
  const fingerprintAvailable = !!bio.data?.reader?.connected;

  const member = detail.data?.member;
  const membership = detail.data?.current_membership;

  const oldestPendingPayment = useMemo(() => {
    const items = history.data?.items ?? [];
    return [...items]
      .filter((p) => p.balance_pending > 0 && p.concept === "membership")
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date))[0];
  }, [history.data]);
  const totalPending = history.data?.total_pending ?? 0;

  const hotkeyHandlers = useMemo(
    () => ({
      e: () => {
        if (member) setEditOpen(true);
      },
      p: () => {
        if (member) setPayOpen(true);
      },
      c: () => {
        // Check-in viene en la siguiente sesión.
      },
    }),
    [member]
  );
  useHotkeys(
    hotkeyHandlers,
    open && !editOpen && !statusOpen && !lockOpen && !pinOpen && !payOpen && !settleOpen && !fpOpen
  );

  const handleOpenChange = useCallback(
    (next: boolean) => {
      if (!next) onClose();
    },
    [onClose]
  );

  const expiryDays = membership ? daysFromToday(membership.expiry_date) : null;
  const isOwner = role === "owner";

  return (
    <>
      <Sheet open={open} onOpenChange={handleOpenChange}>
        <SheetContent className="flex flex-col overflow-y-auto">
          {detail.isLoading && !member ? (
            <div className="flex flex-1 items-center justify-center">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
            </div>
          ) : detail.error || !member ? (
            <div className="p-6">
              <Alert variant="destructive">
                <AlertDescription>{t.errors.loadDetail}</AlertDescription>
              </Alert>
            </div>
          ) : (
            <>
              <SheetHeader>
                <div className="flex items-start gap-4">
                  <Avatar className="h-14 w-14">
                    {member.photo_url && <AvatarImage src={member.photo_url} alt="" />}
                    <AvatarFallback className="text-base">{initials(member.full_name)}</AvatarFallback>
                  </Avatar>
                  <div className="min-w-0 flex-1">
                    <SheetTitle className="text-xl truncate">{member.full_name}</SheetTitle>
                    <SheetDescription className="space-y-1 mt-1">
                      <span className="flex items-center gap-1.5">
                        <Phone className="h-3.5 w-3.5" />
                        {member.phone}
                      </span>
                      {member.email && (
                        <span className="flex items-center gap-1.5">
                          <Mail className="h-3.5 w-3.5" />
                          {member.email}
                        </span>
                      )}
                    </SheetDescription>
                    <div className="text-xs text-muted-foreground mt-2">
                      {t.detail.folio(member.folio)} · {t.detail.createdAt(fmtDate(member.created_at))}
                    </div>
                  </div>
                </div>
              </SheetHeader>

              <div className="px-6 space-y-4 flex-1">
                <div>
                  <div className="text-sm font-medium text-muted-foreground mb-2">
                    {t.detail.membership.title}
                  </div>
                  {membership ? (
                    <Card>
                      <CardContent className="pt-4 space-y-3">
                        <div className="flex items-baseline justify-between">
                          <div className="font-semibold text-base">{membership.type_name}</div>
                          <span
                            className={cn(
                              "text-xs px-2 py-0.5 rounded-full",
                              expiryDays !== null && expiryDays > 7 && "bg-success/10 text-success",
                              expiryDays !== null && expiryDays >= 0 && expiryDays <= 7 && "bg-warning/10 text-warning",
                              expiryDays !== null && expiryDays < 0 && "bg-destructive/10 text-destructive"
                            )}
                          >
                            {membership.status === "active" ? t.detail.membership.vigente : membership.status}
                          </span>
                        </div>
                        <div className="text-sm text-muted-foreground">
                          {t.detail.membership.due}: <span className="text-foreground font-medium">{fmtDate(membership.expiry_date)}</span>
                          {expiryDays !== null && (
                            <span className="ml-2">
                              {expiryDays >= 0
                                ? `(${t.detail.membership.expiring(expiryDays)})`
                                : `(${t.detail.membership.expired(expiryDays)})`}
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap gap-2 pt-1">
                          <Button size="sm" onClick={() => setPayOpen(true)}>
                            <DollarSign className="h-4 w-4" />
                            {t.detail.membership.pay}
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => setLockOpen(true)}
                            disabled={!isOwner}
                            title={!isOwner ? t.lockExpiry.ownerOnly : undefined}
                          >
                            <Lock className="h-4 w-4" />
                            {t.detail.membership.lock}
                          </Button>
                        </div>
                      </CardContent>
                    </Card>
                  ) : (
                    <Card>
                      <CardContent className="pt-4 text-sm text-muted-foreground">
                        {t.detail.membership.none}
                      </CardContent>
                    </Card>
                  )}
                </div>

                {totalPending > 0 && oldestPendingPayment && (
                  <button
                    type="button"
                    onClick={() => setSettleOpen(true)}
                    className="w-full flex items-center justify-between rounded-md border border-warning/40 bg-warning/10 px-3 py-2 text-sm text-warning hover:bg-warning/15"
                  >
                    <span className="flex items-center gap-2">
                      <Wallet className="h-4 w-4" />
                      {bt.detailFlag.pending(fmtMoney(totalPending))}
                    </span>
                    <span className="text-xs underline">{bt.detailFlag.pendingTitle}</span>
                  </button>
                )}

                <Tabs defaultValue="payments">
                  <TabsList>
                    <TabsTrigger value="payments">{t.detail.tabs.payments}</TabsTrigger>
                    <TabsTrigger value="attendance">{t.detail.tabs.attendance}</TabsTrigger>
                    <TabsTrigger value="notes">{t.detail.tabs.notes}</TabsTrigger>
                  </TabsList>
                  <TabsContent value="payments" className="py-3">
                    <PaymentHistory memberId={member.id} memberName={member.full_name} />
                  </TabsContent>
                  <TabsContent value="attendance" className="text-sm text-muted-foreground py-6 text-center">
                    {t.detail.tabs.attendanceEmpty}
                  </TabsContent>
                  <TabsContent value="notes" className="text-sm py-3">
                    {member.notes ? (
                      <p className="whitespace-pre-wrap">{member.notes}</p>
                    ) : (
                      <p className="text-muted-foreground text-center py-3">{t.detail.tabs.notesEmpty}</p>
                    )}
                  </TabsContent>
                </Tabs>

                <div className="text-xs text-muted-foreground border-t pt-3 grid grid-cols-2 gap-1">
                  <div>{t.detail.shortcuts.pay}</div>
                  <div>{t.detail.shortcuts.checkin}</div>
                  <div>{t.detail.shortcuts.edit}</div>
                  <div>{t.detail.shortcuts.close}</div>
                </div>
              </div>

              <div className="border-t p-6 flex flex-wrap gap-2 justify-between">
                <div className="flex gap-2 flex-wrap">
                  <Button variant="outline" onClick={() => setEditOpen(true)}>
                    <Pencil className="h-4 w-4" />
                    {t.detail.actions.edit}
                  </Button>
                  <Button variant="outline" onClick={() => setPinOpen(true)}>
                    <KeyRound className="h-4 w-4" />
                    {t.detail.actions.assignPin}
                  </Button>
                  {fingerprintAvailable && (
                    <Button variant="outline" onClick={() => setFpOpen(true)}>
                      <Fingerprint className="h-4 w-4" />
                      {ct.fingerprint.triggerLabel}
                    </Button>
                  )}
                </div>
                <Button variant="outline" onClick={() => setStatusOpen(true)}>
                  {member.status === "active" ? (
                    <>
                      <BadgeMinus className="h-4 w-4" />
                      {t.detail.actions.markInactive}
                    </>
                  ) : (
                    <>
                      <BadgeCheck className="h-4 w-4" />
                      {t.detail.actions.markActive}
                    </>
                  )}
                </Button>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {member && (
        <>
          <MemberEditDialog
            memberId={member.id}
            initial={member}
            open={editOpen}
            onOpenChange={setEditOpen}
          />
          <MemberStatusModal
            memberId={member.id}
            currentStatus={member.status}
            memberName={member.full_name}
            open={statusOpen}
            onOpenChange={setStatusOpen}
          />
          {membership && (
            <LockExpiryModal
              membershipId={membership.id}
              currentExpiry={membership.expiry_date}
              memberName={member.full_name}
              open={lockOpen}
              onOpenChange={setLockOpen}
            />
          )}
          <AssignPinModal
            memberId={member.id}
            memberName={member.full_name}
            open={pinOpen}
            onOpenChange={setPinOpen}
          />
          <RegisterFingerprintModal
            memberId={member.id}
            memberName={member.full_name}
            open={fpOpen}
            onOpenChange={setFpOpen}
          />
          <PaymentModal
            member={member}
            currentMembership={membership}
            open={payOpen}
            onOpenChange={setPayOpen}
          />
          {oldestPendingPayment && (
            <SettleBalanceModal
              paymentId={oldestPendingPayment.id}
              memberName={member.full_name}
              pendingBalance={oldestPendingPayment.balance_pending}
              open={settleOpen}
              onOpenChange={setSettleOpen}
            />
          )}
        </>
      )}
    </>
  );
}
