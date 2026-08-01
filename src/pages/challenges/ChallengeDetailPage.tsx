import { useMemo, useState } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { ArrowLeft, ChevronRight, Loader2, Plus, ShieldAlert, Trophy } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DataTable,
  DataTableBody,
  DataTableCell,
  DataTableHead,
  DataTableRow,
  DataTableTh,
  EmptyState,
  PageHeader,
  SectionCard,
} from "@/components/shared/PagePrimitives";
import { StatCard } from "@/components/shared/StatCard";
import {
  ChallengeStatusBadge,
  ParticipantStatusBadge,
} from "@/components/challenges/StatusBadge";
import { AddParticipantModal } from "@/components/challenges/AddParticipantModal";
import { CaptureMeasurementModal } from "@/components/challenges/CaptureMeasurementModal";
import { MemberLabel } from "@/components/challenges/MemberLabel";
import {
  useAddCategory,
  useChallenge,
  useChallengeCategories,
  useChallengeParticipants,
  useChallengeRanking,
  useCheckDisqualifications,
  useDeleteCategory,
  useTransitionChallenge,
  useUpdateChallenge,
} from "@/hooks/useChallenges";
import { useAuthStore } from "@/stores/useAuthStore";
import { daysFromToday, fmtDayGrain } from "@/lib/dates";
import {
  challengeIsEditable,
  challengeStatusLabel,
  exerciseLabel,
  nextTransitions,
  transitionLabel,
  type Category,
  type ChallengeTransition,
  type MeasurementMoment,
  type Participant,
  type ParticipantStatus,
} from "@/types/challenges";

type TabValue = "resumen" | "participantes" | "mediciones" | "ranking" | "config";

export default function ChallengeDetailPage() {
  const { id = "" } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const role = useAuthStore((s) => s.user?.role);
  const isOwner = role === "owner";

  const detail = useChallenge(id);
  const categories = useChallengeCategories(id);
  const participants = useChallengeParticipants(id);
  const transition = useTransitionChallenge(id);

  const [tab, setTab] = useState<TabValue>("resumen");
  const [addOpen, setAddOpen] = useState(false);
  const [capture, setCapture] = useState<{
    participant: Participant;
    moment: MeasurementMoment;
  } | null>(null);

  if (detail.isLoading) {
    return (
      <div className="flex items-center justify-center py-20">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!detail.data) {
    return (
      <div className="p-6">
        <Alert variant="destructive">
          <AlertDescription>No pudimos cargar este reto.</AlertDescription>
        </Alert>
      </div>
    );
  }

  const ch = detail.data.challenge;
  const cats = categories.data?.items ?? detail.data.categories;
  const allParticipants = participants.data?.items ?? [];
  const participantsActive = allParticipants.filter((p) => p.status === "active").length;
  const t0Pending = Math.max(0, allParticipants.length - detail.data.t0_captured);
  // Diferencia en días CALENDARIO sobre la parte de fecha (el wire codifica
  // el date-grain como medianoche UTC): el floor de milisegundos daba
  // off-by-one según la hora del día.
  const daysToT1 = Math.max(0, daysFromToday(ch.measurement_t1_start.slice(0, 10)) ?? 0);

  const phase: MeasurementMoment = ch.status === "measuring_t1" ? "t1" : "t0";

  function runTransition(t: ChallengeTransition) {
    transition.mutate(t, {
      onSuccess: () => toast.success(`Reto: ${transitionLabel(t).toLowerCase()}`),
      onError: () => toast.error("No pudimos cambiar el estado. Vuelve a intentar."),
    });
  }

  const transitions = nextTransitions(ch.status);
  const primaryTransition = transitions.find((t) => t !== "cancel");

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      <button
        type="button"
        onClick={() => navigate("/retos")}
        className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
      >
        <ArrowLeft className="h-4 w-4" />
        Volver a retos
      </button>

      <PageHeader
        title={ch.name}
        subtitle={
          <div className="flex items-center gap-3 flex-wrap tabular">
            <ChallengeStatusBadge status={ch.status} />
            <span>
              T₀ hasta {fmtDayGrain(ch.measurement_t0_deadline)} · T₁ desde{" "}
              {fmtDayGrain(ch.measurement_t1_start)}
            </span>
            <span>Cierra {fmtDayGrain(ch.ends_at)}</span>
          </div>
        }
        actions={
          isOwner && primaryTransition ? (
            <Button onClick={() => runTransition(primaryTransition)} disabled={transition.isPending}>
              {transitionLabel(primaryTransition)}
            </Button>
          ) : null
        }
      />

      {ch.status === "running" && (
        <Alert>
          <AlertDescription>
            Ranking provisional — los números cambiarán hasta que cierres el reto.
          </AlertDescription>
        </Alert>
      )}

      <Tabs value={tab} onValueChange={(v) => setTab(v as TabValue)}>
        <TabsList>
          <TabsTrigger value="resumen">Resumen</TabsTrigger>
          <TabsTrigger value="participantes">Participantes</TabsTrigger>
          <TabsTrigger value="mediciones">Mediciones</TabsTrigger>
          <TabsTrigger value="ranking">Ranking</TabsTrigger>
          {isOwner && <TabsTrigger value="config">Configuración</TabsTrigger>}
        </TabsList>

        <TabsContent value="resumen">
          <ResumenTab
            participantsActive={participantsActive}
            t0Pending={t0Pending}
            daysToT1={daysToT1}
            totalParticipants={detail.data.participant_count}
            t0Captured={detail.data.t0_captured}
            t1Captured={detail.data.t1_captured}
          />
        </TabsContent>

        <TabsContent value="participantes">
          <ParticipantesTab
            categories={cats}
            participants={allParticipants}
            isOwner={isOwner}
            onCapture={(p) => setCapture({ participant: p, moment: phase })}
            onAdd={() => setAddOpen(true)}
          />
        </TabsContent>

        <TabsContent value="mediciones">
          <MedicionesTab
            participants={allParticipants}
            categories={cats}
            phase={phase}
            onCapture={(p) => setCapture({ participant: p, moment: phase })}
          />
        </TabsContent>

        <TabsContent value="ranking">
          <RankingTab
            challengeId={id}
            categories={cats}
            status={ch.status === "closed" ? "final" : "provisional"}
          />
        </TabsContent>

        {isOwner && (
          <TabsContent value="config">
            <ConfigTab
              challengeId={id}
              categories={cats}
              challenge={ch}
              editable={challengeIsEditable(ch.status)}
            />
          </TabsContent>
        )}
      </Tabs>

      {isOwner && transitions.includes("cancel") && (
        <details className="text-xs text-muted-foreground">
          <summary className="cursor-pointer w-fit">Acciones avanzadas</summary>
          <Button
            variant="ghost"
            size="sm"
            className="mt-2 text-destructive"
            onClick={() => runTransition("cancel")}
            disabled={transition.isPending}
          >
            Cancelar reto
          </Button>
        </details>
      )}

      {addOpen && (
        <AddParticipantModal
          open={addOpen}
          onOpenChange={setAddOpen}
          challengeId={id}
          categories={cats}
        />
      )}

      {capture && (
        <CaptureMeasurementModal
          open={!!capture}
          onOpenChange={(o) => !o && setCapture(null)}
          challenge={ch}
          participant={capture.participant}
          memberName={undefined}
          categoryName={cats.find((c) => c.id === capture.participant.category_id)?.name}
          moment={capture.moment}
        />
      )}
    </div>
  );
}

// ─── Tab: Resumen ──────────────────────────────────────────────────────────

interface ResumenTabProps {
  participantsActive: number;
  t0Pending: number;
  daysToT1: number;
  totalParticipants: number;
  t0Captured: number;
  t1Captured: number;
}

function ResumenTab({
  participantsActive,
  t0Pending,
  daysToT1,
  totalParticipants,
  t0Captured,
  t1Captured,
}: ResumenTabProps) {
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          title="Participantes activos"
          value={participantsActive}
          icon={Trophy}
          tone="neutral"
          hint={`de ${totalParticipants} totales`}
        />
        <StatCard
          title="T₀ pendientes"
          value={t0Pending}
          icon={ShieldAlert}
          tone={t0Pending > 0 ? "warning" : "success"}
          hint={`${t0Captured} capturadas`}
        />
        <StatCard
          title="Días para T₁"
          value={daysToT1}
          icon={ChevronRight}
          tone="neutral"
          hint="hasta el cierre"
        />
        <StatCard
          title="T₁ capturadas"
          value={t1Captured}
          icon={Trophy}
          tone="neutral"
        />
      </div>
    </div>
  );
}

// ─── Tab: Participantes ────────────────────────────────────────────────────

interface ParticipantesTabProps {
  categories: Category[];
  participants: Participant[];
  isOwner: boolean;
  onCapture(p: Participant): void;
  onAdd(): void;
}

function ParticipantesTab({
  categories,
  participants,
  isOwner,
  onCapture,
  onAdd,
}: ParticipantesTabProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<ParticipantStatus | "">("");

  const filtered = useMemo(() => {
    return participants.filter((p) => {
      if (categoryFilter && p.category_id !== categoryFilter) return false;
      if (statusFilter && p.status !== statusFilter) return false;
      return true;
    });
  }, [participants, categoryFilter, statusFilter]);

  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center">
        <Select
          value={categoryFilter || "_all"}
          onValueChange={(v) => setCategoryFilter(v === "_all" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-[180px]">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={statusFilter || "_all"}
          onValueChange={(v) =>
            setStatusFilter(v === "_all" ? "" : (v as ParticipantStatus))
          }
        >
          <SelectTrigger className="h-9 w-[160px]">
            <SelectValue placeholder="Cualquier estado" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Cualquier estado</SelectItem>
            <SelectItem value="registered">Inscrito</SelectItem>
            <SelectItem value="active">Activo</SelectItem>
            <SelectItem value="disqualified">Descalificado</SelectItem>
            <SelectItem value="completed">Terminó</SelectItem>
            <SelectItem value="withdrew">Se retiró</SelectItem>
          </SelectContent>
        </Select>
        {isOwner && (
          <Button className="ml-auto" onClick={onAdd}>
            <Plus className="h-4 w-4 mr-2" />
            Agregar participante
          </Button>
        )}
      </div>

      <SectionCard flush>
        {filtered.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-5 w-5" />}
            title="Sin participantes"
            hint={
              participants.length === 0
                ? "Inscribe socios para empezar a capturar mediciones."
                : "Ajusta los filtros para verlos."
            }
            action={
              isOwner && participants.length === 0 ? (
                <Button onClick={onAdd}>
                  <Plus className="h-4 w-4 mr-2" />
                  Agregar participante
                </Button>
              ) : undefined
            }
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh>Socio</DataTableTh>
              <DataTableTh>Categoría</DataTableTh>
              <DataTableTh>Ejercicios</DataTableTh>
              <DataTableTh>Estado</DataTableTh>
              <DataTableTh>Cuota</DataTableTh>
              <DataTableTh className="text-right pr-5" />
            </DataTableHead>
            <DataTableBody>
              {filtered.map((p) => (
                <DataTableRow key={p.id}>
                  <DataTableCell>
                    <MemberLabel memberId={p.member_id} size="sm" />
                  </DataTableCell>
                  <DataTableCell>
                    <span className="text-sm">{categoryMap.get(p.category_id) ?? "—"}</span>
                  </DataTableCell>
                  <DataTableCell>
                    <div className="text-xs text-muted-foreground space-y-0.5">
                      <div>{exerciseLabel(p.exercise_legs, "legs")}</div>
                      <div>{exerciseLabel(p.exercise_push, "push")}</div>
                      <div>{exerciseLabel(p.exercise_pull, "pull")}</div>
                    </div>
                  </DataTableCell>
                  <DataTableCell>
                    <ParticipantStatusBadge status={p.status} />
                  </DataTableCell>
                  <DataTableCell>
                    {p.inscription_fee_paid ? (
                      <Badge variant="success">Pagada</Badge>
                    ) : (
                      <Badge variant="outline">Pendiente</Badge>
                    )}
                  </DataTableCell>
                  <DataTableCell className="text-right pr-5">
                    <Button size="sm" variant="outline" onClick={() => onCapture(p)}>
                      Capturar medición
                    </Button>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Tab: Mediciones ───────────────────────────────────────────────────────

interface MedicionesTabProps {
  participants: Participant[];
  categories: Category[];
  phase: MeasurementMoment;
  onCapture(p: Participant): void;
}

function MedicionesTab({
  participants,
  categories,
  phase,
  onCapture,
}: MedicionesTabProps) {
  const categoryMap = useMemo(() => {
    const m = new Map<string, string>();
    categories.forEach((c) => m.set(c.id, c.name));
    return m;
  }, [categories]);

  // El BE no expone "pending por fase" en bulk — listamos participantes
  // activos/inscritos y la modal de captura ya sabe si la previa existe.
  const pending = participants.filter(
    (p) => p.status === "registered" || p.status === "active"
  );

  const label = phase === "t0" ? "T₀" : phase === "t1" ? "T₁" : "Intermedia";

  return (
    <div className="space-y-4">
      <SectionCard
        title={`Captura ${label}`}
        description="Lista de participantes pendientes. Toca Capturar y la modal te avisa si reemplazas una previa."
        flush
      >
        {pending.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-5 w-5" />}
            title={participants.length === 0 ? "Sin participantes inscritos" : "Nada pendiente"}
            hint={
              participants.length === 0
                ? "Inscribe socios antes de capturar mediciones."
                : "Cuando inscribas a alguien aparecerá aquí."
            }
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh>Socio</DataTableTh>
              <DataTableTh>Categoría</DataTableTh>
              <DataTableTh>Estado</DataTableTh>
              <DataTableTh className="text-right pr-5" />
            </DataTableHead>
            <DataTableBody>
              {pending.map((p) => (
                <DataTableRow key={p.id}>
                  <DataTableCell>
                    <MemberLabel memberId={p.member_id} size="sm" />
                  </DataTableCell>
                  <DataTableCell>
                    <span className="text-sm">{categoryMap.get(p.category_id) ?? "—"}</span>
                  </DataTableCell>
                  <DataTableCell>
                    <ParticipantStatusBadge status={p.status} />
                  </DataTableCell>
                  <DataTableCell className="text-right pr-5">
                    <Button size="sm" onClick={() => onCapture(p)}>
                      Capturar
                    </Button>
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Tab: Ranking ──────────────────────────────────────────────────────────

interface RankingTabProps {
  challengeId: string;
  categories: Category[];
  status: "final" | "provisional";
}

function RankingTab({ challengeId, categories, status }: RankingTabProps) {
  const [categoryFilter, setCategoryFilter] = useState<string>("");
  const ranking = useChallengeRanking(challengeId, categoryFilter || undefined);
  const items = ranking.data?.items ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Select
          value={categoryFilter || "_all"}
          onValueChange={(v) => setCategoryFilter(v === "_all" ? "" : v)}
        >
          <SelectTrigger className="h-9 w-[200px]">
            <SelectValue placeholder="Todas las categorías" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="_all">Todas las categorías</SelectItem>
            {categories.map((c) => (
              <SelectItem key={c.id} value={c.id}>
                {c.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {status === "provisional" && (
          <Badge variant="warning">Ranking provisional</Badge>
        )}
      </div>

      <SectionCard flush>
        {ranking.isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
          </div>
        ) : items.length === 0 ? (
          <EmptyState
            icon={<Trophy className="h-5 w-5" />}
            title="Sin ranking todavía"
            hint="El ranking aparece cuando hay participantes con T₀ y T₁ capturadas."
          />
        ) : (
          <DataTable>
            <DataTableHead>
              <DataTableTh className="w-16">#</DataTableTh>
              <DataTableTh>Socio</DataTableTh>
              <DataTableTh className="text-right">ΔG %</DataTableTh>
              <DataTableTh className="text-right">ΔM %</DataTableTh>
              <DataTableTh className="text-right">ΔF %</DataTableTh>
              <DataTableTh className="text-right">IR</DataTableTh>
              <DataTableTh>Estado</DataTableTh>
            </DataTableHead>
            <DataTableBody>
              {items.map((row) => (
                <DataTableRow key={row.participant_id}>
                  <DataTableCell className="font-semibold tabular">
                    {row.position}
                  </DataTableCell>
                  <DataTableCell>
                    <MemberLabel memberId={row.member_id} size="sm" />
                  </DataTableCell>
                  <DataTableCell className="text-right tabular">
                    {row.delta_fat_pct.toFixed(2)}
                  </DataTableCell>
                  <DataTableCell className="text-right tabular">
                    {row.delta_muscle_pct.toFixed(2)}
                  </DataTableCell>
                  <DataTableCell className="text-right tabular">
                    {row.delta_strength_pct.toFixed(2)}
                  </DataTableCell>
                  <DataTableCell className="text-right tabular font-semibold">
                    {row.ir.toFixed(2)}
                  </DataTableCell>
                  <DataTableCell className="space-x-1">
                    {row.tied && (
                      <Badge variant="warning" title="Empate técnico con la posición previa">
                        Empate técnico
                      </Badge>
                    )}
                    {row.attendance_insufficient && (
                      <Badge
                        variant="destructive"
                        title="Asistencia por debajo del mínimo del reto"
                      >
                        Asistencia
                      </Badge>
                    )}
                    {!row.tied && !row.attendance_insufficient && (
                      <Badge variant="success">Válido</Badge>
                    )}
                  </DataTableCell>
                </DataTableRow>
              ))}
            </DataTableBody>
          </DataTable>
        )}
      </SectionCard>
    </div>
  );
}

// ─── Tab: Configuración ────────────────────────────────────────────────────

interface ConfigTabProps {
  challengeId: string;
  categories: Category[];
  challenge: import("@/types/challenges").Challenge;
  editable: boolean;
}

function ConfigTab({ challengeId, categories, challenge, editable }: ConfigTabProps) {
  const update = useUpdateChallenge(challengeId);
  const addCat = useAddCategory(challengeId);
  const delCat = useDeleteCategory(challengeId);
  const dq = useCheckDisqualifications(challengeId);

  const [newCategoryName, setNewCategoryName] = useState("");

  function isoToDateInput(iso: string): string {
    if (!iso) return "";
    return iso.slice(0, 10);
  }

  const [form, setForm] = useState({
    name: challenge.name,
    starts_at: isoToDateInput(challenge.starts_at),
    measurement_t0_deadline: isoToDateInput(challenge.measurement_t0_deadline),
    measurement_t1_start: isoToDateInput(challenge.measurement_t1_start),
    ends_at: isoToDateInput(challenge.ends_at),
    inscription_fee_pesos: String(Math.round(challenge.inscription_fee_cents / 100)),
    min_weekly_attendance: String(challenge.min_weekly_attendance),
    attendance_grace_weeks: String(challenge.attendance_grace_weeks),
    tie_margin_ir: String(challenge.tie_margin_ir),
  });

  async function save() {
    try {
      await update.mutateAsync({
        name: form.name,
        starts_at: `${form.starts_at}T00:00:00Z`,
        measurement_t0_deadline: `${form.measurement_t0_deadline}T00:00:00Z`,
        measurement_t1_start: `${form.measurement_t1_start}T00:00:00Z`,
        ends_at: `${form.ends_at}T00:00:00Z`,
        inscription_fee_cents: parseInt(form.inscription_fee_pesos, 10) * 100,
        min_weekly_attendance: parseInt(form.min_weekly_attendance, 10),
        attendance_grace_weeks: parseInt(form.attendance_grace_weeks, 10),
        tie_margin_ir: parseFloat(form.tie_margin_ir),
      });
      toast.success("Configuración guardada");
    } catch {
      toast.error("No pudimos guardar. Revisa los datos.");
    }
  }

  async function addCategory() {
    if (!newCategoryName.trim()) return;
    try {
      await addCat.mutateAsync({
        name: newCategoryName.trim(),
        sort_order: categories.length + 1,
      });
      setNewCategoryName("");
      toast.success("Categoría agregada");
    } catch {
      toast.error("No pudimos agregar la categoría.");
    }
  }

  async function removeCategory(c: Category) {
    try {
      await delCat.mutateAsync(c.id);
      toast.success(`Categoría "${c.name}" eliminada`);
    } catch {
      toast.error("No pudimos eliminar la categoría.");
    }
  }

  async function runDQCheck() {
    try {
      const res = await dq.mutateAsync();
      toast.success(
        res.count === 0
          ? "Sin descalificaciones nuevas"
          : `${res.count} participante${res.count > 1 ? "s" : ""} descalificado${
              res.count > 1 ? "s" : ""
            }`
      );
    } catch {
      toast.error("No pudimos correr la revisión.");
    }
  }

  return (
    <div className="space-y-6">
      {!editable && (
        <Alert>
          <AlertDescription>
            Las fechas y reglas se bloquean cuando el reto entra en {challengeStatusLabel(challenge.status).toLowerCase()}.
            Para editarlas tendrías que cancelar y empezar uno nuevo.
          </AlertDescription>
        </Alert>
      )}

      <SectionCard title="Detalles del reto">
        <div className="grid grid-cols-2 gap-3">
          <Field
            label="Nombre"
            value={form.name}
            disabled={!editable}
            onChange={(v) => setForm({ ...form, name: v })}
          />
          <Field
            label="Cuota (MXN)"
            type="number"
            value={form.inscription_fee_pesos}
            disabled={!editable}
            onChange={(v) => setForm({ ...form, inscription_fee_pesos: v })}
          />
          <Field
            label="Inicia"
            type="date"
            value={form.starts_at}
            disabled={!editable}
            onChange={(v) => setForm({ ...form, starts_at: v })}
          />
          <Field
            label="Cierre T₀"
            type="date"
            value={form.measurement_t0_deadline}
            disabled={!editable}
            onChange={(v) => setForm({ ...form, measurement_t0_deadline: v })}
          />
          <Field
            label="Inicia T₁"
            type="date"
            value={form.measurement_t1_start}
            disabled={!editable}
            onChange={(v) => setForm({ ...form, measurement_t1_start: v })}
          />
          <Field
            label="Termina"
            type="date"
            value={form.ends_at}
            disabled={!editable}
            onChange={(v) => setForm({ ...form, ends_at: v })}
          />
        </div>

        <div className="mt-5 grid grid-cols-3 gap-3">
          <Field
            label="Asistencia mín. semanal"
            type="number"
            value={form.min_weekly_attendance}
            disabled={!editable}
            onChange={(v) => setForm({ ...form, min_weekly_attendance: v })}
          />
          <Field
            label="Semanas de gracia"
            type="number"
            value={form.attendance_grace_weeks}
            disabled={!editable}
            onChange={(v) => setForm({ ...form, attendance_grace_weeks: v })}
          />
          <Field
            label="Margen empate (IR)"
            type="number"
            value={form.tie_margin_ir}
            disabled={!editable}
            onChange={(v) => setForm({ ...form, tie_margin_ir: v })}
          />
        </div>

        {editable && (
          <div className="mt-5 flex justify-end">
            <Button onClick={save} disabled={update.isPending}>
              {update.isPending ? "Guardando…" : "Guardar cambios"}
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard title="Categorías">
        <div className="space-y-2">
          {categories.length === 0 ? (
            <p className="text-sm text-muted-foreground">
              Crea al menos una categoría antes de abrir inscripciones.
            </p>
          ) : (
            categories.map((c) => (
              <div
                key={c.id}
                className="flex items-center justify-between rounded-md border border-border px-3 py-2"
              >
                <span className="text-sm font-medium">{c.name}</span>
                {editable && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => removeCategory(c)}
                    disabled={delCat.isPending}
                  >
                    Eliminar
                  </Button>
                )}
              </div>
            ))
          )}
        </div>
        {editable && (
          <div className="mt-4 flex gap-2">
            <Input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Hombres, Mujeres, +40…"
            />
            <Button onClick={addCategory} disabled={addCat.isPending || !newCategoryName.trim()}>
              Agregar
            </Button>
          </div>
        )}
      </SectionCard>

      <SectionCard
        title="Asistencia"
        description="Aplica descalificaciones de quienes ya rebasaron las semanas de gracia."
      >
        <Button variant="outline" onClick={runDQCheck} disabled={dq.isPending}>
          {dq.isPending ? "Revisando…" : "Revisar descalificaciones"}
        </Button>
      </SectionCard>
    </div>
  );
}

interface FieldProps {
  label: string;
  value: string;
  onChange(v: string): void;
  type?: string;
  disabled?: boolean;
}

function Field({ label, value, onChange, type, disabled }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label className={disabled ? "text-muted-foreground" : undefined}>{label}</Label>
      <Input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
      />
    </div>
  );
}

