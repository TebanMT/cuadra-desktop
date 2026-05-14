// Wire shapes para el módulo de retos. Coinciden 1-a-1 con
// `cuadra-core/src/modules/challenges/interfaces/controllers/challenge_controller.go`.
// Si el BE cambia algún campo, ESTE archivo se actualiza primero — no
// dejes que la UI se haga ramas privadas con `as any`.

export type ChallengeStatus =
  | "draft"
  | "open_registration"
  | "running"
  | "measuring_t1"
  | "closed"
  | "cancelled";

export type ChallengeTransition =
  | "open_registration"
  | "start_running"
  | "start_measuring_t1"
  | "close"
  | "cancel";

export type ParticipantStatus =
  | "registered"
  | "active"
  | "disqualified"
  | "completed"
  | "withdrew";

export type MeasurementMoment = "t0" | "t1" | "intermediate";

// Slugs canónicos definidos en `participant.go` del BE.
export const EXERCISE_LEGS = [
  { slug: "sentadilla", label: "Sentadilla" },
  { slug: "prensa", label: "Prensa" },
  { slug: "peso_muerto_rumano", label: "Peso muerto rumano" },
] as const;

export const EXERCISE_PUSH = [
  { slug: "press_banca", label: "Press de banca" },
  { slug: "press_pecho_maquina", label: "Press pecho (máquina)" },
  { slug: "press_militar", label: "Press militar" },
] as const;

export const EXERCISE_PULL = [
  { slug: "peso_muerto", label: "Peso muerto" },
  { slug: "jalon_polea", label: "Jalón polea" },
  { slug: "remo", label: "Remo" },
] as const;

export const DEFAULT_EXERCISES = {
  legs: "sentadilla",
  push: "press_banca",
  pull: "peso_muerto",
} as const;

export function exerciseLabel(
  slug: string,
  family: "legs" | "push" | "pull"
): string {
  const list =
    family === "legs"
      ? EXERCISE_LEGS
      : family === "push"
        ? EXERCISE_PUSH
        : EXERCISE_PULL;
  return list.find((e) => e.slug === slug)?.label ?? slug;
}

export interface Challenge {
  id: string;
  gym_id: string;
  version: number;
  name: string;
  description: string;
  starts_at: string;
  measurement_t0_deadline: string;
  measurement_t1_start: string;
  ends_at: string;
  status: ChallengeStatus;
  inscription_fee_cents: number;
  inscription_refundable: boolean;
  min_weekly_attendance: number;
  attendance_grace_weeks: number;
  strength_cap_pct: number;
  tie_margin_ir: number;
  bf_floor_male_pct: number;
  bf_floor_female_pct: number;
  created_at: string;
  updated_at: string;
}

export interface Category {
  id: string;
  challenge_id: string;
  name: string;
  sort_order: number;
  created_at: string;
  updated_at: string;
}

export interface Participant {
  id: string;
  challenge_id: string;
  member_id: string;
  category_id: string;
  exercise_legs: string;
  exercise_push: string;
  exercise_pull: string;
  status: ParticipantStatus;
  inscription_fee_paid: boolean;
  inscription_paid_at: string | null;
  inscription_refunded_at: string | null;
  disqualification_reason: string;
  disqualified_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface Measurement {
  id: string;
  participant_id: string;
  moment: MeasurementMoment;
  measured_at: string;
  body_weight_kg: number;
  body_fat_pct: number;
  legs_weight_kg: number;
  legs_reps: number;
  push_weight_kg: number;
  push_reps: number;
  pull_weight_kg: number;
  pull_reps: number;
  notes: string;
  created_by_user_id: string;
  superseded_at: string | null;
  superseded_by_id: string | null;
  created_at: string;
}

export interface RankingEntry {
  participant_id: string;
  category_id: string;
  member_id: string;
  ir: number;
  delta_fat_pct: number;
  delta_muscle_pct: number;
  delta_strength_pct: number;
  position: number;
  tied: boolean;
  attendance_insufficient: boolean;
}

export interface ChallengeListResponse {
  items: Challenge[];
  total: number;
  page: number;
  page_size: number;
}

export interface ChallengeDetailResponse {
  challenge: Challenge;
  categories: Category[];
  participant_count: number;
  t0_captured: number;
  t1_captured: number;
}

export interface CategoryListResponse {
  items: Category[];
}

export interface ParticipantListResponse {
  items: Participant[];
}

export interface MeasurementListResponse {
  items: Measurement[];
}

export interface RankingResponse {
  items: RankingEntry[];
}

export interface CaptureMeasurementResponse {
  measurement: Measurement;
  superseded_prior_id: string | null;
  participant_status: ParticipantStatus;
}

export interface CheckDisqualificationsResponse {
  disqualified_ids: string[];
  count: number;
}

export interface AttendanceWeekStat {
  week_start: string;
  count: number;
  met: boolean;
}

export interface AttendanceReportEntry {
  participant_id: string;
  member_id: string;
  weeks: AttendanceWeekStat[];
  weeks_met: number;
  weeks_missed: number;
  within_grace: boolean;
}

export interface AttendanceReportResponse {
  items: AttendanceReportEntry[];
}

// Inputs para mutations — coinciden con los DTOs de request del BE.

export interface CreateChallengeInput {
  name: string;
  description?: string;
  starts_at: string;
  measurement_t0_deadline: string;
  measurement_t1_start: string;
  ends_at: string;
  inscription_fee_cents?: number;
  inscription_refundable?: boolean;
  min_weekly_attendance?: number;
  attendance_grace_weeks?: number;
  strength_cap_pct?: number;
  tie_margin_ir?: number;
  bf_floor_male_pct?: number;
  bf_floor_female_pct?: number;
}

export type UpdateChallengeInput = Partial<CreateChallengeInput>;

export interface AddCategoryInput {
  name: string;
  sort_order?: number;
}

export interface UpdateCategoryInput {
  name?: string;
  sort_order?: number;
}

export interface AddParticipantInput {
  member_id: string;
  category_id: string;
  exercise_legs?: string;
  exercise_push?: string;
  exercise_pull?: string;
}

export interface UpdateParticipantInput {
  exercise_legs?: string;
  exercise_push?: string;
  exercise_pull?: string;
  mark_fee_paid?: boolean;
  withdraw?: boolean;
}

export interface CaptureMeasurementInput {
  moment: MeasurementMoment;
  measured_at: string;
  body_weight_kg: number;
  body_fat_pct: number;
  legs_weight_kg: number;
  legs_reps: number;
  push_weight_kg: number;
  push_reps: number;
  pull_weight_kg: number;
  pull_reps: number;
  notes?: string;
}

// Helpers derivados

export function challengeStatusLabel(status: ChallengeStatus): string {
  switch (status) {
    case "draft":
      return "Borrador";
    case "open_registration":
      return "Inscripciones abiertas";
    case "running":
      return "En curso";
    case "measuring_t1":
      return "Midiendo T₁";
    case "closed":
      return "Cerrado";
    case "cancelled":
      return "Cancelado";
  }
}

export function participantStatusLabel(status: ParticipantStatus): string {
  switch (status) {
    case "registered":
      return "Inscrito";
    case "active":
      return "Activo";
    case "disqualified":
      return "Descalificado";
    case "completed":
      return "Terminó";
    case "withdrew":
      return "Se retiró";
  }
}

export function challengeIsEditable(status: ChallengeStatus): boolean {
  return status === "draft";
}

export function nextTransitions(status: ChallengeStatus): ChallengeTransition[] {
  switch (status) {
    case "draft":
      return ["open_registration", "cancel"];
    case "open_registration":
      return ["start_running", "cancel"];
    case "running":
      return ["start_measuring_t1", "cancel"];
    case "measuring_t1":
      return ["close", "cancel"];
    case "closed":
    case "cancelled":
      return [];
  }
}

export function transitionLabel(t: ChallengeTransition): string {
  switch (t) {
    case "open_registration":
      return "Abrir inscripciones";
    case "start_running":
      return "Iniciar reto";
    case "start_measuring_t1":
      return "Iniciar mediciones T₁";
    case "close":
      return "Cerrar reto";
    case "cancel":
      return "Cancelar reto";
  }
}
