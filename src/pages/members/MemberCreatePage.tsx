import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { ArrowLeft, Fingerprint, Check, Loader2, AlertCircle, AlertTriangle, CircleCheck, KeyRound, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { PageHeader, SectionCard } from "@/components/shared/PagePrimitives";
import { MemberForm, type MemberFormSubmitPayload } from "@/components/members/MemberForm";
import { useCreateMember, type CreateMemberInput, type Dispatch } from "@/hooks/useMembers";
import { useBiometricStatus, useRegisterFingerprint } from "@/hooks/useBiometric";
import { ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import { cn } from "@/lib/utils";
import { members as t } from "@/strings/members";
import { checkin as ct } from "@/strings/checkin";

interface DuplicateInfo {
  existing_member_id?: string;
  existing_member_name?: string;
  existing_expiry?: string;
}

type Stage = "form" | "fingerprint";

// MemberCreatePage — state machine de dos etapas:
//
//   form         → MemberForm clásico (datos + cobro inicial opcional).
//                  On success, si hay reader de huella conectado, pasa
//                  a `fingerprint`. Si no, navega directo al detail
//                  page del recién creado.
//
//   fingerprint  → Captura inline de huella usando el mismo hook que
//                  el detail page. Siempre escapable vía "Saltar". On
//                  success O skip, navega al detail page.
//
// El stage de huella es post-submit porque los endpoints de fingerprint
// requieren member_id, que sólo existe después de que el backend procesa
// la inscripción (incluyendo charge_first_payment si aplica).
export default function MemberCreatePage() {
  const navigate = useNavigate();
  const create = useCreateMember();
  const [serverError, setServerError] = useState<string | null>(null);
  const [duplicate, setDuplicate] = useState<{ payload: CreateMemberInput; info: DuplicateInfo } | null>(null);
  const [stage, setStage] = useState<Stage>("form");
  const [newMember, setNewMember] = useState<{
    id: string;
    name: string;
    number?: number;
    dispatch?: Dispatch;
  } | null>(null);

  function buildPayload(p: MemberFormSubmitPayload, allowDup: boolean): CreateMemberInput {
    const v = p.values;
    return {
      full_name: v.full_name.trim(),
      // v.phone ya viene en E.164 desde MemberForm. El slice(-10) viejo
      // descartaba el código de país de socios internacionales que el
      // selector ya admite (PhoneInput soporta LATAM + US + España).
      phone: v.phone,
      email: v.email.trim() || undefined,
      birthdate: v.birthdate || undefined,
      photo_url: v.photo_url || undefined,
      notes: v.notes.trim() || undefined,
      // Sólo lo mandamos si el operador eligió algo. "" significa
      // "no se capturó" y se traduce a NULL en BD (no enviarlo).
      gender: v.gender || undefined,
      membership_type_id: v.membership_type_id,
      start_date: v.start_date || undefined,
      allow_duplicate_phone: allowDup,
      charge_first_payment: v.charge_first_payment,
      charge_enrollment: v.charge_first_payment ? v.charge_enrollment : undefined,
      charge_maintenance: v.charge_first_payment ? v.charge_maintenance : undefined,
      // Montos resueltos en el form (plan fee con fallback al default
      // del gym). Pasarlos garantiza que BE cobre exactamente lo que
      // vio el operador en pantalla.
      enrollment_amount: v.charge_first_payment && v.charge_enrollment ? p.enrollmentAmount : undefined,
      maintenance_amount: v.charge_first_payment && v.charge_maintenance ? p.maintenanceAmount : undefined,
      payment_method: v.charge_first_payment && v.payment_method ? v.payment_method : undefined,
      // Promo del primer pago — sólo se manda si efectivamente hay cobro.
      // El BE rechaza promotion sin charge_first_payment con un noop
      // silencioso, pero igual filtramos en el FE para no ensuciar el wire.
      promotion:
        v.charge_first_payment && p.promotionID
          ? {
              promotion_id: p.promotionID,
              ...(p.companionMemberIDs && p.companionMemberIDs.length > 0
                ? { companion_member_ids: p.companionMemberIDs }
                : {}),
            }
          : undefined,
    };
  }

  async function submit(payload: CreateMemberInput, name: string) {
    try {
      setServerError(null);
      const res = await create.mutateAsync(payload);
      // Toast resumido: si la notificación de WhatsApp se encoló,
      // anunciamos que el número de socio ya va en camino. Si no, sólo el
      // mensaje genérico — el strip del stage de huella explica qué pasó.
      const baseMsg = t.form.success.created(name, fmtDate(res.expiry_date));
      const numberSent = res.dispatch?.dispatched && res.member_number && res.dispatch.recipient_phone;
      toast.success(numberSent ? `${baseMsg} ${t.memberNumber.sentToWhatsApp(res.dispatch!.recipient_phone!)}` : baseMsg);
      setNewMember({ id: res.member_id, name, number: res.member_number, dispatch: res.dispatch });
      setStage("fingerprint");
    } catch (e) {
      if (e instanceof ApiError && e.status === 422) {
        const data = e.details as Record<string, unknown> | null;
        const exception = (data?.exception as string | undefined) || "";
        if (
          exception.toLowerCase().includes("phone") ||
          exception.toLowerCase().includes("teléfono") ||
          exception.toLowerCase().includes("duplicate")
        ) {
          setDuplicate({
            payload,
            info: {
              existing_member_id: data?.existing_member_id as string | undefined,
              existing_member_name: data?.existing_member_name as string | undefined,
              existing_expiry: data?.existing_expiry as string | undefined,
            },
          });
          return;
        }
        setServerError(exception || t.form.errors.generic);
        return;
      }
      setServerError(t.form.errors.generic);
    }
  }

  function handleSubmit(p: MemberFormSubmitPayload) {
    const payload = buildPayload(p, false);
    submit(payload, p.values.full_name);
  }

  function createAnyway() {
    if (!duplicate) return;
    const payload = { ...duplicate.payload, allow_duplicate_phone: true };
    setDuplicate(null);
    submit(payload, payload.full_name);
  }

  return (
    <div className="p-6 space-y-6 max-w-3xl mx-auto">
      <PageHeader
        title={stage === "fingerprint" && newMember ? ct.fingerprint.title(newMember.name) : t.form.titleNew}
        subtitle={stage === "fingerprint" ? "Paso 2 de 2 · Huella (opcional)" : "Paso 1 de 2 · Datos del socio"}
        actions={
          stage === "form" ? (
            <Button variant="outline" onClick={() => navigate("/members")}>
              <ArrowLeft className="h-4 w-4 mr-2" />
              Volver
            </Button>
          ) : undefined
        }
      />

      <SectionCard>
        <div className="p-6">
          {stage === "fingerprint" && newMember ? (
            <FingerprintStage
              memberId={newMember.id}
              memberName={newMember.name}
              number={newMember.number}
              dispatch={newMember.dispatch}
              onDone={() => navigate(`/members/${newMember.id}`)}
            />
          ) : duplicate ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <h3 className="font-semibold text-base">{t.form.duplicate.title}</h3>
                <p className="text-sm text-muted-foreground">
                  {t.form.duplicate.bodyPrefix}
                  <strong className="text-foreground">
                    {duplicate.info.existing_member_name ?? "otro socio"}
                  </strong>
                  {duplicate.info.existing_expiry && (
                    <> (vence {fmtDate(duplicate.info.existing_expiry)})</>
                  )}
                  .
                </p>
              </div>
              <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                <Button variant="outline" onClick={() => setDuplicate(null)}>
                  {t.form.cancel}
                </Button>
                {duplicate.info.existing_member_id && (
                  <Button
                    variant="outline"
                    onClick={() => navigate(`/members/${duplicate.info.existing_member_id}`)}
                  >
                    {t.form.duplicate.seeExisting}
                  </Button>
                )}
                <Button onClick={createAnyway}>{t.form.duplicate.createAnyway}</Button>
              </div>
            </div>
          ) : (
            <MemberForm
              mode="create"
              submitting={create.isPending}
              onSubmit={handleSubmit}
              onCancel={() => navigate("/members")}
              serverError={serverError}
            />
          )}
        </div>
      </SectionCard>
    </div>
  );
}

// FingerprintStage — captura inline de huella tras inscribir un socio.
// Reusa useRegisterFingerprint del detail flow (mismo polling, mismo
// AbortController). Sin paso de consent — decisión explícita: el flujo
// post-inscripción debe ser rápido y sin fricción adicional. El operador
// siempre puede saltar.
//
// Caso "lector desconectado": no escondemos el stage; mostramos un hint
// para que el operador conecte el cable. El status de biometric se
// re-polla cada 5s, así que en cuanto el operador lo plugea, auto-
// arrancamos la captura sin que tenga que hacer nada más.
interface FingerprintStageProps {
  memberId: string;
  memberName: string;
  /** Número de socio auto-asignado al inscribir. Se muestra en un strip
   * compacto arriba del stage de huella. */
  number?: number;
  /** Estado del envío automático del número por WhatsApp. */
  dispatch?: Dispatch;
  onDone(): void;
}

function FingerprintStage({ memberId, memberName, number, dispatch, onDone }: FingerprintStageProps) {
  const navigate = useNavigate();
  const bio = useBiometricStatus();
  const fp = useRegisterFingerprint(memberId, {
    onSuccess: () => {
      toast.success(ct.fingerprint.success);
      onDone();
    },
  });
  const startedRef = useRef(false);

  const readerConnected = !!bio.data?.connected;
  const { progress } = fp;
  const failed = progress.status === "failed";
  const success = progress.status === "success";
  const collision = failed && progress.error === "collision" && progress.collisionMember;
  const noReader = !readerConnected && progress.status === "idle";

  useEffect(() => {
    if (readerConnected && !startedRef.current && progress.status === "idle") {
      startedRef.current = true;
      fp.start();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [readerConnected, progress.status]);

  function retry() {
    fp.reset();
    startedRef.current = true;
    fp.start();
  }

  // Collision branch: the captured finger belongs to another socio. Replace
  // the capture UI entirely — the operator has two clear next steps (open
  // the existing profile to investigate, or skip and finish enrollment).
  // Intentionally no "ignore" override: at threshold 0.85 false positives
  // are rare; the operator should retry with another finger of the same
  // person if it really is a different socio.
  if (collision && progress.collisionMember) {
    const existing = progress.collisionMember;
    return (
      <div className="space-y-5">
        <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm">
          <CircleCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
          <p className="text-foreground">{ct.fingerprint.enrolledBanner(memberName)}</p>
        </div>
        {number != null && <NumberStrip number={number} dispatch={dispatch} />}
        <div className="mx-auto flex h-44 w-44 items-center justify-center rounded-full ring-8 bg-warning/10 text-warning ring-warning/30">
          <AlertTriangle className="h-20 w-20" strokeWidth={1.4} />
        </div>
        <p className="text-center font-medium">{ct.fingerprint.errorCollision(existing.name)}</p>
        <div className="flex flex-col-reverse gap-2 pt-2 sm:flex-row sm:justify-end">
          <Button variant="outline" onClick={onDone} type="button">
            {ct.fingerprint.collisionCancel}
          </Button>
          <Button onClick={() => navigate(`/members/${existing.id}`)} type="button">
            {ct.fingerprint.seeExisting(existing.name)}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Banner verde de inscripción confirmada. Cubre el caso clave de
          "se guardó? estoy en otra pantalla?" del operador no-técnico
          una vez que el toast desaparece. */}
      <div className="flex items-start gap-3 rounded-md border border-success/30 bg-success/10 px-4 py-3 text-sm">
        <CircleCheck className="h-5 w-5 text-success shrink-0 mt-0.5" />
        <p className="text-foreground">{ct.fingerprint.enrolledBanner(memberName)}</p>
      </div>

      {number != null && <NumberStrip number={number} dispatch={dispatch} />}

      {failed && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            {progress.error === "reader"
              ? ct.fingerprint.errorReader
              : progress.error === "capture"
              ? ct.fingerprint.errorCapture
              : ct.fingerprint.errorGeneric}
          </AlertDescription>
        </Alert>
      )}

      <div
        className={cn(
          "mx-auto flex h-44 w-44 items-center justify-center rounded-full ring-8 transition-colors",
          failed
            ? "bg-destructive/10 text-destructive ring-destructive/30"
            : noReader
            ? "bg-muted text-muted-foreground ring-muted"
            : success
            ? "bg-success/10 text-success ring-success/30"
            : "bg-primary/10 text-primary ring-primary/20"
        )}
      >
        {success ? (
          <Check className="h-20 w-20" strokeWidth={3} />
        ) : progress.status === "capturing" ? (
          <Loader2 className="h-20 w-20 animate-spin" />
        ) : (
          <Fingerprint className="h-20 w-20" strokeWidth={1.4} />
        )}
      </div>

      <div className="text-center space-y-3">
        <p className="font-medium">
          {noReader
            ? ct.fingerprint.errorReader
            : progress.status === "capturing"
            ? ct.fingerprint.capturing(progress.captures_done + 1)
            : progress.status === "waiting"
            ? ct.fingerprint.waitingPlace
            : success
            ? ct.fingerprint.success
            : failed
            ? ""
            : ct.fingerprint.instruction}
        </p>

        {/* Progreso visual: 3 dots que se llenan a medida que avanzan
            las capturas. Reemplaza el "Capturas: 0 de 3" en texto grande,
            que competía visualmente con el dedo central. */}
        <div
          className="flex justify-center gap-2"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={progress.captures_total}
          aria-valuenow={progress.captures_done}
          aria-label={ct.fingerprint.capturesLabel(progress.captures_done, progress.captures_total)}
        >
          {Array.from({ length: progress.captures_total }).map((_, i) => (
            <span
              key={i}
              className={cn(
                "h-2.5 w-2.5 rounded-full transition-colors",
                i < progress.captures_done
                  ? success
                    ? "bg-success"
                    : "bg-primary"
                  : "bg-muted"
              )}
            />
          ))}
        </div>

        {noReader && (
          <p className="text-xs text-muted-foreground">{ct.fingerprint.autoStartHint}</p>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2">
        {failed ? (
          <>
            <Button variant="outline" onClick={onDone} type="button">
              {ct.fingerprint.skip}
            </Button>
            <Button onClick={retry} type="button">
              {ct.fingerprint.start}
            </Button>
          </>
        ) : (
          // noReader y todos los estados normales: una sola acción
          // "Saltar". En noReader el polling auto-arranca; en estados
          // intermedios el operador no necesita pulsar nada — sólo
          // poner el dedo.
          <Button variant="outline" onClick={onDone} type="button">
            {ct.fingerprint.skip}
          </Button>
        )}
      </div>
    </div>
  );
}

// NumberStrip — versión compacta del banner anterior. Una sola línea con
// el número de socio + estado del envío por WhatsApp. Intencionalmente
// discreto: el número ya va camino al socio por WhatsApp en el happy-path, así
// que el operador raramente necesita escribirlo a mano. Cuando WhatsApp no
// está conectado o el socio no tiene teléfono, el strip cambia su copy
// para empujar al operador a copiarlo o escribirlo en la credencial.
function NumberStrip({ number, dispatch }: { number: number; dispatch?: Dispatch }) {
  async function copy() {
    try {
      await navigator.clipboard.writeText(String(number));
      toast.success(t.memberNumber.copied);
    } catch {
      // silencioso — el operador siempre puede leer y teclear el número.
    }
  }

  let hint: string = t.memberNumber.notSent;
  if (dispatch?.dispatched && dispatch.recipient_phone) {
    hint = t.memberNumber.sentToWhatsApp(dispatch.recipient_phone);
  } else if (dispatch?.skipped_reason === "whatsapp_not_connected") {
    hint = t.memberNumber.notSentNoWhatsApp;
  } else if (dispatch?.skipped_reason === "no_member_phone") {
    hint = t.memberNumber.notSentNoPhone;
  }

  return (
    <div className="flex items-center justify-between gap-3 flex-wrap rounded-md border bg-muted/30 px-3 py-2 text-sm">
      <div className="flex items-center gap-2 min-w-0">
        <KeyRound className="h-4 w-4 text-muted-foreground shrink-0" />
        <span className="text-muted-foreground">{t.memberNumber.profileLabel}</span>
        <span className="font-semibold tabular-nums tracking-wider text-foreground">{number}</span>
        <span className="text-xs text-muted-foreground truncate">· {hint}</span>
      </div>
      <Button variant="ghost" size="sm" onClick={copy} type="button" className="h-7 px-2">
        <Copy className="h-3.5 w-3.5 mr-1" />
        {t.memberNumber.profileCopy}
      </Button>
    </div>
  );
}
