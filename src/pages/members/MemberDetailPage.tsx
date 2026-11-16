import { PageContainer } from "@/components/shared/PagePrimitives";
import { MemberLastEntry } from "@/components/members/MemberLastEntry";
import { useCallback, useEffect, useId, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import { format, parseISO } from "date-fns";
import { es } from "date-fns/locale";
import {
  ArrowLeft,
  Loader2,
  LogIn,
  Mail,
  Phone,
  Pencil,
  BadgeMinus,
  BadgeCheck,
  KeyRound,
  DollarSign,
  Lock,
  CalendarClock,
  Wallet,
  Fingerprint,
  Copy,
  CheckCircle2,
  XCircle,
  ShieldCheck,
  Search as SearchIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { MemberPhotoLightbox } from "@/components/members/MemberPhotoLightbox";
import { VigenciaBadge } from "@/components/members/VigenciaBadge";
import { vigenciaFrom } from "@/lib/vigencia";
import { useMember, useDeleteFingerprint } from "@/hooks/useMembers";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useBiometricStatus } from "@/hooks/useBiometric";
import { useAuthStore } from "@/stores/useAuthStore";
import { usePaymentHistory, fmtMoney } from "@/hooks/useBilling";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import {
  checkinErrorMessage,
  useCheckinManual,
  useMemberCheckins,
  type CheckinEvent,
} from "@/hooks/useCheckin";
import { eventToFeedback, feedbackDetail, feedbackTone } from "@/components/checkin/CheckinFeedback";
import { fmtDate, daysFromToday } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { members as t } from "@/strings/members";
import { billing as bt } from "@/strings/billing";
import { checkin as ct } from "@/strings/checkin";
import { MemberEditDialog } from "@/components/members/MemberEditDialog";
import { MemberStatusModal } from "@/components/members/MemberStatusModal";
import { usePermission } from "@/lib/permissions";
import { LockExpiryModal } from "@/components/members/LockExpiryModal";
import { AssignMemberNumberModal } from "@/components/members/AssignMemberNumberModal";
import { RegisterFingerprintModal } from "@/components/members/RegisterFingerprintModal";
import { PaymentModal } from "@/components/billing/PaymentModal";
import { SettleBalanceModal } from "@/components/billing/SettleBalanceModal";
import { ReceiptViewer } from "@/components/billing/ReceiptViewer";
import type { RegisterMembershipPaymentResponse } from "@/hooks/useBilling";
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
  const location = useLocation();
  const { id: memberId = null } = useParams<{ id: string }>();
  const [searchParams, setSearchParams] = useSearchParams();
  const detail = useMember(memberId);
  const money = useMoneyVisibility();
  const role = useAuthStore((s) => s.user?.role);
  const readOnly = useAuthStore(s => s.readOnly);
  // Deactivating a member needs "member_status"; reactivating is always allowed.
  const canDeactivate = usePermission("member_status");
  const [lastReceipt, setLastReceipt] = useState<RegisterMembershipPaymentResponse | null>(null);
  const [receiptId, setReceiptId] = useState<string | null>(null);
  useEffect(() => {
    setLastReceipt(location.state?.paymentReceipt ?? null);
    setReceiptId(null);
  }, [memberId, location.state]);
  const history = usePaymentHistory(memberId, {});

  const [editOpen, setEditOpen] = useState(false);
  const [statusOpen, setStatusOpen] = useState(false);
  const [lockOpen, setLockOpen] = useState(false);
  const [numberOpen, setNumberOpen] = useState(false);
  const [payOpen, setPayOpen] = useState(false);
  const [settleOpen, setSettleOpen] = useState(false);
  const [fpOpen, setFpOpen] = useState(false);
  const [confirmFpDeleteOpen, setConfirmFpDeleteOpen] = useState(false);
  const deleteFingerprint = useDeleteFingerprint(memberId ?? "");
  const bio = useBiometricStatus(true);
  const fingerprintAvailable = !!bio.data?.connected;

  const member = detail.data?.member;
  const membership = detail.data?.current_membership;

  // La deuda más vieja SIN filtrar por concepto: una venta fiada abona
  // igual que una mensualidad (UC-019 acepta ambos padres). El filtro
  // por membership que vivía aquí dejaba huérfana la deuda de ventas —
  // el banner ni aparecía aunque total_pending sí la contaba.
  const oldestPendingPayment = useMemo(() => {
    const items = history.data?.items ?? [];
    return [...items]
      .filter((p) => p.balance_pending > 0)
      .sort((a, b) => a.payment_date.localeCompare(b.payment_date))[0];
  }, [history.data]);
  const totalPending = history.data?.total_pending ?? 0;
  // Desglose por concepto para el banner ("$100 de venta · $45 de
  // mensualidad") — sólo se muestra cuando hay más de un origen.
  const pendingByConcept = useMemo(() => {
    const sums = new Map<string, number>();
    for (const p of history.data?.items ?? []) {
      if (p.balance_pending > 0) {
        sums.set(p.concept, (sums.get(p.concept) ?? 0) + p.balance_pending);
      }
    }
    return sums;
  }, [history.data]);

  const checkinManual = useCheckinManual();

  // Soporte ?action=pay para que las CTAs de "Atención requerida" (vencer,
  // saldos pendientes) lancen directo al modal de cobro al aterrizar en
  // el detalle. Cuando se abre, consumimos el param para que un refresh
  // no re-dispare el modal y para que el URL quede limpio.
  useEffect(() => {
    if (!readOnly && member?.status === "active" && searchParams.get("action") === "pay" && detail.data && !payOpen) {
      payRef.current?.focus();
      setPayOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, detail.data, payOpen, setSearchParams, readOnly, member?.status]);

  useEffect(() => {
    const receipt = searchParams.get("receipt");
    if (!receipt) return;
    setReceiptId(receipt);
    const next = new URLSearchParams(searchParams);
    next.delete("receipt");
    setSearchParams(next, { replace: true });
  }, [searchParams, setSearchParams]);

  // ?action=settle — espejo de action=pay para las CTAs de deuda
  // (Atención requerida → "Abonar"). Espera a que el historial cargue
  // porque el modal necesita el payment padre con saldo.
  useEffect(() => {
    if (!readOnly && searchParams.get("action") === "settle" && oldestPendingPayment && !settleOpen) {
      settleRef.current?.focus();
      setSettleOpen(true);
      const next = new URLSearchParams(searchParams);
      next.delete("action");
      setSearchParams(next, { replace: true });
    }
  }, [searchParams, oldestPendingPayment, settleOpen, setSearchParams, readOnly, member?.status]);

  // Dispara un check-in manual del socio actual y muestra un toast con el
  // resultado. La feedback usa el mismo mapping que la pantalla de Check-in
  // para que el copy se mantenga uniforme entre superficies. Sigue activo en
  // solo lectura: registrar entradas es lo que la prueba terminada permite.
  const handleCheckin = useCallback(async () => {
    if (!member || checkinManual.isPending) return;
    try {
      const ev = await checkinManual.mutateAsync({ member_id: member.id });
      const fb = eventToFeedback(ev);
      const detail = feedbackDetail(fb);
      const tone = feedbackTone(fb.kind);
      const title = `${member.full_name}`;
      if (tone === "success") toast.success(title, { description: detail });
      else if (tone === "warning") toast.warning(title, { description: detail });
      else toast.error(title, { description: detail });
    } catch (err) {
      const msg = checkinErrorMessage(err, "No pudimos registrar la entrada. Revisa la conexión con recepción e intenta de nuevo.");
      toast.error(member.full_name, { description: msg });
    }
  }, [member, checkinManual]);

  // Botones que reciben el foco cuando un atajo o una URL abre su
  // diálogo: DialogContent devuelve el foco al elemento enfocado al abrir,
  // así que al cerrar el operador vuelve al control que corresponde y no
  // a <body> (donde los atajos seguirían vivos sin contexto).
  const checkinRef = useRef<HTMLButtonElement>(null);
  const payRef = useRef<HTMLButtonElement>(null);
  const editRef = useRef<HTMLButtonElement>(null);
  const settleRef = useRef<HTMLButtonElement>(null);
  const checkinHintId = useId();

  // C prepara la entrada (enfoca el botón y muestra la pista); Enter la
  // confirma con el comportamiento nativo del botón. Una sola letra nunca
  // escribe un registro de asistencia.
  const [checkinArmed, setCheckinArmed] = useState(false);
  useEffect(() => {
    if (!checkinArmed) return;
    const timer = window.setTimeout(() => setCheckinArmed(false), 6000);
    return () => window.clearTimeout(timer);
  }, [checkinArmed]);

  // Esc vuelve a donde venías (búsqueda, Inicio, cobros…); si la ficha se
  // abrió sin historial dentro de la app, a la lista de socios.
  const goBack = useCallback(() => {
    if (location.key !== "default") navigate(-1);
    else navigate("/members");
  }, [location.key, navigate]);

  // Hotkeys: las desactivamos mientras algún sub-modal está abierto
  // para no interceptar teclas dentro de los inputs del modal.
  const anyModalOpen =
    editOpen || statusOpen || lockOpen || numberOpen || payOpen || settleOpen || fpOpen || !!receiptId || confirmFpDeleteOpen;

  const hotkeyHandlers = useMemo(
    () => ({
      e: () => {
        if (!member || readOnly) return;
        editRef.current?.focus();
        setEditOpen(true);
      },
      p: () => {
        if (member?.status !== "active" || readOnly) return;
        payRef.current?.focus();
        setPayOpen(true);
      },
      c: () => {
        const button = checkinRef.current;
        if (!member || !button || button.disabled) return;
        button.focus();
        setCheckinArmed(true);
      },
      Escape: () => {
        // Con la entrada preparada, el primer Esc sólo la cancela.
        if (checkinArmed) {
          setCheckinArmed(false);
          return;
        }
        goBack();
      },
    }),
    [member, goBack, readOnly, checkinArmed]
  );
  useHotkeys(hotkeyHandlers, !anyModalOpen);

  const expiryDays =
    membership && membership.expiry_date ? daysFromToday(membership.expiry_date) : null;
  const isPending = membership?.status === "pending_payment";
  const isOwner = role === "owner";
  // La vigencia sale de access_status (la decisión del backend), nunca de
  // membership.status: una membresía puede seguir «active» con la fecha
  // vencida. Define también la jerarquía: un solo botón relleno.
  const accessStatus = detail.data?.access_status;
  const vigencia = vigenciaFrom({ accessStatus, expiryDate: membership?.expiry_date });
  const isActiveMember = member?.status === "active";
  const checkinPrimary = isActiveMember && vigencia.canEnter;
  const payPrimary = isActiveMember && !vigencia.canEnter;

  if (detail.isLoading && !member) {
    return (
      <div className="flex flex-1 items-center justify-center p-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (detail.error || !member) {
    return (
      <PageContainer contentWidth="form" className="space-y-4">
        <Button variant="outline" onClick={goBack}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Volver
        </Button>
        <Alert variant="destructive">
          <AlertDescription>{t.errors.loadDetail}</AlertDescription>
        </Alert>
      </PageContainer>
    );
  }

  return (
    <>
      <PageContainer className="space-y-6">
        {/* Header: back + identidad + acciones principales */}
        <div className="flex items-start justify-between gap-4 flex-wrap">
          <div className="flex items-start gap-4 min-w-0">
            <Button
              variant="outline"
              size="sm"
              onClick={goBack}
              className="mt-1"
            >
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
            <MemberPhotoLightbox
              memberId={member.id}
              fullName={member.full_name}
              hasPhoto={!!member.photo_url}
              avatarClassName="h-16 w-16"
              fallbackClassName="text-lg"
            />
            <div className="min-w-0 flex-1">
              <h1 className="font-display text-2xl text-foreground truncate">
                {member.full_name}
              </h1>
              <div className="text-sm text-muted-foreground space-y-0.5 mt-1">
                {member.phone && (
                  <div className="flex items-center gap-1.5">
                    <Phone className="h-3.5 w-3.5" />
                    {member.phone}
                  </div>
                )}
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
                <NumberInline number={member.member_number} readOnly={readOnly} onChange={() => { if (!readOnly) setNumberOpen(true); }} />
              </div>
            </div>
          </div>
          <div className="flex gap-2 flex-wrap items-center">
            <div className="relative">
              <Button
                ref={checkinRef}
                variant={checkinPrimary ? "default" : "outline"}
                size={checkinPrimary ? "lg" : "default"}
                className={checkinPrimary ? undefined : "h-12"}
                onClick={() => {
                  setCheckinArmed(false);
                  void handleCheckin();
                }}
                onBlur={() => setCheckinArmed(false)}
                disabled={checkinManual.isPending}
                aria-describedby={checkinArmed ? checkinHintId : undefined}
              >
                {checkinManual.isPending ? (
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                ) : (
                  <LogIn className="h-4 w-4 mr-2" />
                )}
                {checkinPrimary ? t.detail.actions.checkin : t.detail.actions.verify}
              </Button>
              {/* Pista de la tecla C: visible junto al botón enfocado y
                  anunciada por lectores de pantalla. */}
              <span
                id={checkinHintId}
                role="status"
                className={cn(
                  checkinArmed
                    ? "absolute left-0 top-full z-10 mt-1.5 whitespace-nowrap rounded-md border bg-popover px-2.5 py-1.5 text-xs text-popover-foreground"
                    : "sr-only"
                )}
              >
                {checkinArmed && (
                  <>
                    <Kbd>Enter</Kbd> {checkinPrimary ? t.detail.checkinHint.enter : t.detail.checkinHint.verify}
                  </>
                )}
              </span>
            </div>
            <Button ref={editRef} variant="outline" className="h-12" disabled={readOnly} onClick={() => setEditOpen(true)}>
              <Pencil className="h-4 w-4 mr-2" />
              {t.detail.actions.edit}
            </Button>
            {(member.status !== "active" || canDeactivate) && <Button variant={member.status === "active" ? "outline" : "default"} size={member.status === "active" ? "default" : "lg"} className={member.status === "active" ? "h-12" : undefined} disabled={readOnly} onClick={() => setStatusOpen(true)}>
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
            </Button>}
          </div>
        </div>

        {member.status !== "active" && <p className="text-sm text-muted-foreground">{t.detail.inactiveNote}</p>}
        {lastReceipt && <div role="status" className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-success/30 bg-success-soft p-4 text-success-text">
          <p><strong>Cobro registrado · {fmtMoney(lastReceipt.paid)}</strong><br />Comprobante {lastReceipt.folio} · Vigencia hasta {fmtDate(lastReceipt.new_expiry)}</p>
          <Button variant="outline" onClick={event => { event.currentTarget.focus(); setReceiptId(lastReceipt.payment_id); }}>Ver comprobante</Button>
        </div>}
        {/* Membresía: la insignia de vigencia contesta «¿puede pasar?»; la
            línea de fecha da el dato exacto sin repetir el plazo. */}
        <section aria-labelledby="membership-title">
          <h2 id="membership-title" className="text-sm font-medium text-muted-foreground mb-2">
            {t.detail.membership.title}
          </h2>
          {membership && isPending ? (
            // Sin primer pago: el socio fue inscrito pero no ha pagado. El
            // cobro lo activa (un abono parcial cuenta).
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-semibold text-base">{membership.type_name}</div>
                  <VigenciaBadge size="md" vigencia={vigencia} hideDetail />
                </div>
                <p className="text-sm text-muted-foreground">{t.detail.membership.pendingBody}</p>
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    ref={payRef}
                    requiresWrite
                    variant={payPrimary ? "default" : "outline"}
                    size={payPrimary ? "lg" : "default"}
                    disabled={readOnly || member.status !== "active"}
                    onClick={() => setPayOpen(true)}
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    {t.detail.membership.payFirst}
                  </Button>
                </div>
              </CardContent>
            </Card>
          ) : membership ? (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between gap-3 flex-wrap">
                  <div className="font-semibold text-base">{membership.type_name}</div>
                  <VigenciaBadge
                    size="md"
                    vigencia={vigencia}
                    // «Vigente · hasta 3 dic» repetiría la fecha de abajo.
                    hideDetail={accessStatus === "allowed_active"}
                  />
                </div>
                {membership.expiry_date && (
                  <p className="text-sm text-muted-foreground">
                    {expiryDays !== null && expiryDays < 0 ? t.detail.membership.duePast : t.detail.membership.dueFuture}{" "}
                    <span className="tabular font-medium text-foreground">{fmtDate(membership.expiry_date)}</span>
                  </p>
                )}
                <div className="flex flex-wrap gap-2 pt-1">
                  <Button
                    ref={payRef}
                    requiresWrite
                    variant={payPrimary ? "default" : "outline"}
                    size={payPrimary ? "lg" : "default"}
                    disabled={readOnly || member.status !== "active"}
                    onClick={() => setPayOpen(true)}
                  >
                    <DollarSign className="h-4 w-4 mr-1" />
                    {t.detail.membership.pay}
                  </Button>
                  <Button
                    requiresWrite
                    variant="outline"
                    className={payPrimary ? "h-12" : undefined}
                    onClick={() => setLockOpen(true)}
                    disabled={readOnly || !isOwner}
                    aria-describedby={!isOwner ? "lock-expiry-reason" : undefined}
                  >
                    <CalendarClock className="h-4 w-4 mr-1" aria-hidden />
                    {t.detail.membership.lock}
                  </Button>
                </div>
                {!isOwner && (
                  <p id="lock-expiry-reason" className="text-xs text-muted-foreground">
                    {t.lockExpiry.ownerOnly}
                  </p>
                )}
              </CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-4 space-y-3">
                <VigenciaBadge size="md" vigencia={vigencia} />
                {/* Activo: «Sin membresía» y el botón bastan. Inactivo: la
                    insignia dice «Inactivo», así que falta decir lo del plan. */}
                {member.status !== "active" && <p className="text-sm text-muted-foreground">{t.detail.membership.none}</p>}
                {member.status === "active" && (
                  <Button ref={payRef} requiresWrite size="lg" disabled={readOnly} onClick={() => setPayOpen(true)}>
                    <DollarSign className="h-4 w-4 mr-1" />
                    {t.detail.membership.activate}
                  </Button>
                )}
              </CardContent>
            </Card>
          )}
        </section>

        {/* Saldo pendiente — cualquier concepto (membresía o venta fiada). */}
        {totalPending > 0 && oldestPendingPayment && (
          <button
            ref={settleRef}
            type="button"
            disabled={readOnly} onClick={() => setSettleOpen(true)}
            className="w-full min-h-11 flex items-center justify-between gap-2 rounded-md border border-warning/45 bg-warning-soft px-3 py-2 text-sm text-warning-foreground hover:bg-warning/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
          >
            <span className="flex items-center gap-2 min-w-0">
              <Wallet className="h-4 w-4 shrink-0" aria-hidden />
              <span className="truncate">
                {bt.detailFlag.pending(money.fmt(totalPending))}
                {pendingByConcept.size > 1 && (
                  <span className="opacity-80">
                    {" — "}
                    {[...pendingByConcept.entries()]
                      .map(([c, v]) => bt.detailFlag.breakdownPart(c, money.fmt(v)))
                      .join(" · ")}
                  </span>
                )}
              </span>
            </span>
            <span className="text-xs underline shrink-0">{bt.detailFlag.pendingTitle}</span>
          </button>
        )}

        <MemberLastEntry memberID={member.id} />

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
          <TabsContent value="attendance" className="py-3">
            <AttendanceHistory memberId={member.id} />
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

        {/* Acción secundaria de huella. El "Cambiar número de socio" se
            gestiona inline desde la metadata strip (junto al número), así
            esta fila solo aparece cuando hay lector conectado — y desaparece
            por completo en gyms sin huella. */}
        {fingerprintAvailable && (
          <div className="border-t pt-4 flex flex-wrap gap-2">
            <Button
              disabled={readOnly}
              variant="outline"
              onClick={() => {
                if (member?.has_fingerprint) {
                  setConfirmFpDeleteOpen(true);
                } else {
                  setFpOpen(true);
                }
              }}
            >
              <Fingerprint className="h-4 w-4 mr-2" />
              {member?.has_fingerprint
                ? ct.fingerprint.triggerLabelHas
                : ct.fingerprint.triggerLabel}
            </Button>
          </div>
        )}

        {/* Atajos de teclado: sólo los que corresponden a acciones disponibles. */}
        <ul aria-label={t.detail.shortcuts.title} className="text-xs text-muted-foreground border-t pt-3 flex flex-wrap gap-x-6 gap-y-2">
          {!readOnly && member.status === "active" && <li><Kbd>P</Kbd> {t.detail.shortcuts.pay}</li>}
          <li><Kbd>C</Kbd> {checkinPrimary ? t.detail.shortcuts.checkin : t.detail.shortcuts.verify}</li>
          {!readOnly && <li><Kbd>E</Kbd> {t.detail.shortcuts.edit}</li>}
          <li><Kbd>Esc</Kbd> {t.detail.shortcuts.back}</li>
        </ul>
      </PageContainer>

      <AlertDialog open={confirmFpDeleteOpen} onOpenChange={setConfirmFpDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>¿Borrar la huella actual?</AlertDialogTitle>
            <AlertDialogDescription>
              Se eliminará la huella registrada de {member?.full_name} y se abrirá
              el asistente para registrar una nueva.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction requiresWrite
              onClick={() => {
                deleteFingerprint.mutate(undefined, {
                  onSuccess: () => setFpOpen(true),
                });
              }}
            >
              Borrar y re-registrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

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
      <AssignMemberNumberModal
        memberId={member.id}
        memberName={member.full_name}
        initialNumber={member.member_number}
        open={numberOpen}
        onOpenChange={setNumberOpen}
      />
      <RegisterFingerprintModal
        memberId={member.id}
        memberName={member.full_name}
        open={fpOpen}
        onOpenChange={setFpOpen}
      />
      <ReceiptViewer folio={receiptId === lastReceipt?.payment_id ? lastReceipt.folio : history.data?.items.find(payment => payment.id === receiptId)?.reference} paymentId={receiptId} open={!!receiptId} onOpenChange={value => { if (!value) setReceiptId(null); }} />
      <PaymentModal
        member={member}
        currentMembership={membership}
        accessStatus={detail.data?.access_status}
        open={payOpen}
        onOpenChange={setPayOpen}
        onPaid={setLastReceipt}
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

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-flex h-5 min-w-[1.25rem] items-center justify-center rounded border border-border bg-muted px-1 font-sans text-xs font-medium text-foreground">
      {children}
    </kbd>
  );
}

// NumberInline — el NÚMERO DE SOCIO (ADR-010) como una pieza más de metadata,
// junto al folio / fecha de inscripción. Dos affordances inline para evitar
// competir con las acciones principales del header:
//   - Click en la "píldora" del número → copia al portapapeles.
//   - Click en "Cambiar"               → abre el modal de regeneración.
// Si el socio no tiene número (caso histórico pre-auto-assign), la píldora
// degenera en un link "Asignar número de socio" que abre el mismo modal.
function NumberInline({ number, onChange, readOnly }: { number?: number; onChange(): void; readOnly: boolean }) {
  async function copy() {
    if (number == null) return;
    try {
      await navigator.clipboard.writeText(String(number));
      toast.success(t.memberNumber.copied);
    } catch {
      // silencioso — el operador puede leer el número y escribirlo.
    }
  }
  if (number == null) {
    return (
      <button
        type="button"
        onClick={onChange}
        disabled={readOnly}
        title={readOnly ? "Solo lectura" : undefined}
        className="inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-ring underline-offset-2 hover:underline"
      >
        <KeyRound className="h-3 w-3" />
        <span>{t.memberNumber.profileAssign}</span>
      </button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1.5">
      <button
        type="button"
        onClick={copy}
        className="inline-flex items-center gap-1 rounded px-1 -mx-1 hover:bg-muted/60 focus:outline-none focus:ring-1 focus:ring-ring"
        aria-label={`${t.memberNumber.profileLabel} ${number} · ${t.memberNumber.profileCopy}`}
      >
        <KeyRound className="h-3 w-3" />
        <span>{t.memberNumber.profileLabel}</span>{" "}
        <span className="font-medium tabular-nums tracking-wider text-foreground">{number}</span>
        <Copy className="h-3 w-3 opacity-60" />
      </button>
      <button
        type="button"
        onClick={onChange}
        disabled={readOnly}
        title={readOnly ? "Solo lectura" : undefined}
        className="disabled:opacity-50 disabled:cursor-not-allowed underline-offset-2 hover:underline hover:text-foreground focus:outline-none focus:ring-1 focus:ring-ring rounded"
      >
        {t.memberNumber.triggerChange}
      </button>
    </span>
  );
}

function AttendanceHistory({ memberId }: { memberId: string }) {
  const q = useMemberCheckins(memberId);

  if (q.isLoading) {
    return (
      <div className="flex items-center justify-center py-6 text-sm text-muted-foreground gap-2">
        <Loader2 className="h-4 w-4 animate-spin" />
        <span>{t.detail.tabs.attendanceLoading}</span>
      </div>
    );
  }
  if (q.error) {
    return (
      <p className="py-6 text-center text-sm text-destructive">
        {t.detail.tabs.attendanceError}
      </p>
    );
  }
  const items = q.data?.items ?? [];
  if (items.length === 0) {
    return (
      <p className="py-6 text-center text-sm text-muted-foreground">
        {t.detail.tabs.attendanceEmpty}
      </p>
    );
  }
  return (
    <ul className="divide-y divide-border">
      {items.map((ev) => (
        <AttendanceRow key={ev.id} ev={ev} />
      ))}
    </ul>
  );
}

function AttendanceRow({ ev }: { ev: CheckinEvent }) {
  const allowed =
    ev.result === "allowed_active" ||
    ev.result === "allowed_expiring_soon" ||
    ev.manual_override;
  // Override mantiene la prioridad visual ("entró por decisión del
  // operador") aunque el evaluador original haya denegado.
  const Icon = ev.manual_override ? ShieldCheck : allowed ? CheckCircle2 : XCircle;
  const iconClass = ev.manual_override
    ? "text-warning"
    : allowed
    ? "text-success"
    : "text-destructive";
  const methodLabel =
    ev.method === "fingerprint"
      ? t.detail.tabs.attendanceMethod.fingerprint
      : ev.method === "number"
      ? t.detail.tabs.attendanceMethod.number
      : t.detail.tabs.attendanceMethod.manual;
  const MethodIcon =
    ev.method === "fingerprint" ? Fingerprint : ev.method === "number" ? KeyRound : SearchIcon;
  const when = parseISO(ev.created_at);
  return (
    <li className="flex items-center gap-3 py-3">
      <Icon className={cn("h-5 w-5 shrink-0", iconClass)} strokeWidth={2.25} />
      <div className="flex-1 min-w-0">
        <div className="text-sm font-medium text-foreground">
          {t.detail.tabs.attendanceResult[ev.result] ?? ev.result}
          {ev.manual_override && (
            <span className="ml-2 text-xs font-medium text-warning">
              {t.detail.tabs.attendanceOverride}
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground flex items-center gap-1.5 mt-0.5">
          <MethodIcon className="h-3 w-3" />
          <span>{methodLabel}</span>
          {ev.operator_name && (
            <>
              <span className="opacity-50">·</span>
              <span>{t.detail.tabs.attendanceOperator(ev.operator_name)}</span>
            </>
          )}
        </div>
        {ev.override_reason && (
          <div className="text-xs text-muted-foreground mt-0.5 italic">
            “{ev.override_reason}”
          </div>
        )}
      </div>
      <div className="text-right text-xs text-muted-foreground shrink-0 tabular-nums">
        <div>{format(when, "d MMM", { locale: es })}</div>
        <div className="font-medium text-foreground">{format(when, "HH:mm")}</div>
      </div>
    </li>
  );
}
