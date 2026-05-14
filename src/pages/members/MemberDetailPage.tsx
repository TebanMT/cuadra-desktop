import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { toast } from "sonner";
import {
  ArrowLeft,
  Loader2,
  Mail,
  Phone,
  Pencil,
  BadgeMinus,
  BadgeCheck,
  KeyRound,
  DollarSign,
  Lock,
  Wallet,
  Fingerprint,
  Copy,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { MemberPhotoLightbox } from "@/components/members/MemberPhotoLightbox";
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
import { MemberEditDialog } from "@/components/members/MemberEditDialog";
import { MemberStatusModal } from "@/components/members/MemberStatusModal";
import { LockExpiryModal } from "@/components/members/LockExpiryModal";
import { AssignPinModal } from "@/components/members/AssignPinModal";
import { RegisterFingerprintModal } from "@/components/members/RegisterFingerprintModal";
import { PaymentModal } from "@/components/billing/PaymentModal";
import { SettleBalanceModal } from "@/components/billing/SettleBalanceModal";
import { PaymentHistory } from "@/components/billing/PaymentHistory";

// MemberDetailPage — versión ruta de lo que antes era MemberDetailSheet.
// Mismo contenido (avatar/info, tarjeta de membresía, alerta de saldo
// pendiente, tabs de historial, acciones secundarias) pero como página
// completa con su propia URL navegable (`/members/:id`). El operador
// puede compartir/marcar la URL y el botón "Atrás" del navegador
// regresa a la lista — patrón familiar de cualquier app web.
//
// Los sub-modales (editar, status, pin, pago, etc.) siguen siendo
// dialogs porque son acciones cortas con contexto del socio actual.
export default function MemberDetailPage() {
  const navigate = useNavigate();
  const { id: memberId = null } = useParams<{ id: string }>();
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
  const bio = useBiometricStatus(true);
  const fingerprintAvailable = !!bio.data?.connected;

  const member = detail.data?.member;
  const membership = detail.data?.current_membership;

  const oldestPendingPayment = useMemo(() => {
    const items = history.data?.items ?? [];
    return [...items]
      .filter((p) => p.balance_pending > 0 && p.concept === "membership")
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date))[0];
  }, [history.data]);
  const totalPending = history.data?.total_pending ?? 0;

  // Hotkeys: las desactivamos mientras algún sub-modal está abierto
  // para no interceptar teclas dentro de los inputs del modal.
  const hotkeyHandlers = useMemo(
    () => ({
      e: () => {
        if (member) setEditOpen(true);
      },
      p: () => {
        if (member) setPayOpen(true);
      },
      Escape: () => {
        if (!editOpen && !statusOpen && !lockOpen && !pinOpen && !payOpen && !settleOpen && !fpOpen) {
          navigate("/members");
        }
      },
    }),
    [member, editOpen, statusOpen, lockOpen, pinOpen, payOpen, settleOpen, fpOpen, navigate]
  );
  useHotkeys(
    hotkeyHandlers,
    !editOpen && !statusOpen && !lockOpen && !pinOpen && !payOpen && !settleOpen && !fpOpen
  );

  const expiryDays =
    membership && membership.expiry_date ? daysFromToday(membership.expiry_date) : null;
  const isPending = membership?.status === "pending_payment";
  const isOwner = role === "owner";

  if (detail.isLoading && !member) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (detail.error || !member) {
    return (
      <div className="p-6 max-w-3xl mx-auto space-y-4">
        <Button variant="outline" onClick={() => navigate("/members")}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{t.errors.loadDetail}</AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        {/* Header: back + identidad + acciones principales */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 min-w-0">
            <Button
              variant="outline"
              size="sm"
              onClick={() => navigate("/members")}
              className="mt-1"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
            <MemberPhotoLightbox
              memberId={member.id}
              fullName={member.full_name}
              avatarClassName="h-16 w-16"
              fallbackClassName="text-lg"
            />
            <div className="min-w-0 flex-1">
              <h1
                className="text-2xl font-bold text-foreground truncate"
                style={{ letterSpacing: "-0.02em" }}
              >
                {member.full_name}
              </h1>
              <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                <div className="flex items-center gap-1.5">
                  <Phone className="h-3.5 w-3.5" />
                  {member.phone}
                </div>
                {member.email && (
                  <div className="flex items-center gap-1.5">
                    <Mail className="h-3.5 w-3.5" />
                    {member.email}
                  </div>
                )}
              </div>
              <div className="text-xs text-muted-foreground mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                <span>{t.detail.folio(member.folio)}</span>
                <span aria-hidden>·</span>
                <span>{t.detail.createdAt(fmtDate(member.created_at))}</span>
                <span aria-hidden>·</span>
                <PinInline pin={member.pin} onChange={() => setPinOpen(true)} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap">
            <Button variant="outline" onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              {t.detail.actions.edit}
            </Button>
            <Button variant="outline" onClick={() => setStatusOpen(true)}>
              {member.status === "active" ? (
                <>
                  <BadgeMinus className="h-4 w-4 mr-2" />
                  {t.detail.actions.markInactive}
                </>
              ) : (
                <>
                  <BadgeCheck className="h-4 w-4 mr-2" />
                  {t.detail.actions.markActive}
                </>
              )}
            </Button>
          </div>
        </div>

        {/* Membresía */}
        <div>
          <div className="text-sm font-medium text-muted-foreground mb-2">
            {t.detail.membership.title}
          </div>
          {membership && isPending ? (
            // Pending payment: el socio fue inscrito pero no ha pagado.
            // Card warning con CTA prominente para cobrar (lo activa
            // automáticamente, abono parcial cuenta).
            <Card className="border-warning/40 bg-warning/5">
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-baseline justify-between gap-2 flex-wrap">
                  <div className="font-semibold text-base">{membership.type_name}</div>
                  <span className="text-xs px-2 py-0.5 rounded-full bg-warning/15 text-warning">
                    {t.detail.membership.pendingTitle}
                  </span>
                </div>
                <p className="text-sm text-muted-foreground">{t.detail.membership.pendingBody}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button size="sm" onClick={() => setPayOpen(true)}>
                    <DollarSign className="h-4 w-4 mr-1" />
                    {t.detail.membership.payFirst}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : membership ? (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-baseline justify-between">
                  <div className="font-semibold text-base">{membership.type_name}</div>
                  <span
                    className={cn(
                      "text-xs px-2 py-0.5 rounded-full",
                      expiryDays !== null && expiryDays > 7 && "bg-success/10 text-success",
                      expiryDays !== null &&
                        expiryDays >= 0 &&
                        expiryDays <= 7 &&
                        "bg-warning/10 text-warning",
                      expiryDays !== null && expiryDays < 0 && "bg-destructive/10 text-destructive"
                    )}
                  >
                    {membership.status === "active" ? t.detail.membership.vigente : membership.status}
                  </span>
                </div>
                <div className="text-sm text-muted-foreground">
                  {t.detail.membership.due}:{" "}
                  <span className="text-foreground font-medium">
                    {membership.expiry_date ? fmtDate(membership.expiry_date) : "—"}
                  </span>
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
                    <DollarSign className="h-4 w-4 mr-1" />
                    {t.detail.membership.pay}
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => setLockOpen(true)}
                    disabled={!isOwner}
                    title={!isOwner ? t.lockExpiry.ownerOnly : undefined}
                  >
                    <Lock className="h-4 w-4 mr-1" />
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

        {/* Saldo pendiente */}
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

        {/* Tabs */}
        <Tabs defaultValue="payments">
          <TabsList>
            <TabsTrigger value="payments">{t.detail.tabs.payments}</TabsTrigger>
            <TabsTrigger value="attendance">{t.detail.tabs.attendance}</TabsTrigger>
            <TabsTrigger value="notes">{t.detail.tabs.notes}</TabsTrigger>
          </TabsList>
          <TabsContent value="payments" className="py-3">
            <PaymentHistory memberId={member.id} memberName={member.full_name} />
          </TabsContent>
          <TabsContent
            value="attendance"
            className="text-sm text-muted-foreground py-6 text-center"
          >
            {t.detail.tabs.attendanceEmpty}
          </TabsContent>
          <TabsContent value="notes" className="text-sm py-3">
            {member.notes ? (
              <p className="whitespace-pre-wrap">{member.notes}</p>
            ) : (
              <p className="text-muted-foreground text-center py-3">
                {t.detail.tabs.notesEmpty}
              </p>
            )}
          </TabsContent>
        </Tabs>

        {/* Acción secundaria de huella. El "Cambiar PIN" se gestiona
            inline desde la metadata strip (junto al PIN), así esta fila
            solo aparece cuando hay lector conectado — y desaparece por
            completo en gyms sin huella. */}
        {fingerprintAvailable && (
          <div className="border-t pt-4 flex flex-wrap gap-2">
            <Button variant="outline" onClick={() => setFpOpen(true)}>
              <Fingerprint className="h-4 w-4 mr-2" />
              {ct.fingerprint.triggerLabel}
            </Button>
          </div>
        )}

        {/* Atajos de teclado */}
        <div className="text-xs text-muted-foreground border-t pt-3 grid grid-cols-2 md:grid-cols-4 gap-1">
          <div>{t.detail.shortcuts.pay}</div>
          <div>{t.detail.shortcuts.checkin}</div>
          <div>{t.detail.shortcuts.edit}</div>
          <div>{t.detail.shortcuts.close}</div>
        </div>
      </div>

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
        initialPin={member.pin}
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
  );
}

// PinInline — el PIN como una pieza más de metadata, junto al folio /
// fecha de inscripción. Dos affordances inline para evitar competir con
// las acciones principales del header:
//   - Click en la "píldora" del PIN  → copia al portapapeles.
//   - Click en "Cambiar"             → abre el modal de regeneración.
// Si el socio no tiene PIN (caso histórico pre-auto-assign), la píldora
// degenera en un link "Asignar PIN" que abre el mismo modal.
function PinInline({ pin, onChange }: { pin?: string; onChange(): void }) {
  async function copy() {
    if (!pin) return;
    try {
      await navigator.clipboard.writeText(pin);
      toast.success(t.pin.copied);
    } catch {
      // silencioso — el operador puede leer el dígito y escribirlo.
    }
  }
  if (!pin) {
    return (
      <button
        type="button"
        onClick={onChange}
        className="inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-ring underline-offset-2 hover:underline"
      >
        <KeyRound className="h-3 w-3" />
        <span>{t.pin.profileAssign}</span>
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={`${t.pin.profileLabel} ${pin} · ${t.pin.profileCopy}`}
      >
        <KeyRound className="h-3 w-3" />
        <span>{t.pin.profileLabel}</span>{" "}
        <span className="font-medium tabular-nums tracking-wider text-foreground">{pin}</span>
        <Copy className="h-3 w-3 opacity-60" />
      </button>
      <button
        type="button"
        onClick={onChange}
        className="underline-offset-2 hover:underline hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded"
      >
        {t.pin.triggerChange}
      </button>
    </span>
  );
}
