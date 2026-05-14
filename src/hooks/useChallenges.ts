import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { api } from "@/lib/api";
import type {
  AddCategoryInput,
  AddParticipantInput,
  AttendanceReportResponse,
  CaptureMeasurementInput,
  CaptureMeasurementResponse,
  Category,
  CategoryListResponse,
  Challenge,
  ChallengeDetailResponse,
  ChallengeListResponse,
  ChallengeStatus,
  ChallengeTransition,
  CheckDisqualificationsResponse,
  CreateChallengeInput,
  Measurement,
  MeasurementListResponse,
  Participant,
  ParticipantListResponse,
  RankingResponse,
  UpdateCategoryInput,
  UpdateChallengeInput,
  UpdateParticipantInput,
} from "@/types/challenges";

export const challengeKeys = {
  list: (status?: ChallengeStatus, page?: number) =>
    ["challenges", "list", { status: status ?? null, page: page ?? 1 }] as const,
  detail: (id: string) => ["challenges", id, "detail"] as const,
  categories: (id: string) => ["challenges", id, "categories"] as const,
  participants: (id: string, status?: string, categoryId?: string) =>
    [
      "challenges",
      id,
      "participants",
      { status: status ?? "", category: categoryId ?? "" },
    ] as const,
  measurements: (id: string, pid: string) =>
    ["challenges", id, "participants", pid, "measurements"] as const,
  ranking: (id: string, categoryId?: string) =>
    ["challenges", id, "ranking", { category: categoryId ?? "" }] as const,
  attendance: (id: string) => ["challenges", id, "attendance"] as const,
};

const BASE = "/api/v1/challenges";

// ─── Reads ─────────────────────────────────────────────────────────────────

export function useChallenges(params: { status?: ChallengeStatus; page?: number; pageSize?: number } = {}) {
  return useQuery<ChallengeListResponse>({
    queryKey: challengeKeys.list(params.status, params.page),
    queryFn: () =>
      api.get<ChallengeListResponse>(BASE, {
        query: {
          status: params.status,
          page: params.page,
          page_size: params.pageSize,
        },
      }),
    placeholderData: keepPreviousData,
  });
}

export function useChallenge(id: string | null | undefined) {
  return useQuery<ChallengeDetailResponse>({
    queryKey: challengeKeys.detail(id || ""),
    queryFn: () => api.get<ChallengeDetailResponse>(`${BASE}/${id}`),
    enabled: !!id,
  });
}

export function useChallengeCategories(id: string | null | undefined) {
  return useQuery<CategoryListResponse>({
    queryKey: challengeKeys.categories(id || ""),
    queryFn: () => api.get<CategoryListResponse>(`${BASE}/${id}/categories`),
    enabled: !!id,
  });
}

export function useChallengeParticipants(
  id: string | null | undefined,
  filters: { status?: string; categoryId?: string } = {}
) {
  return useQuery<ParticipantListResponse>({
    queryKey: challengeKeys.participants(id || "", filters.status, filters.categoryId),
    queryFn: () =>
      api.get<ParticipantListResponse>(`${BASE}/${id}/participants`, {
        query: {
          status: filters.status,
          category_id: filters.categoryId,
        },
      }),
    enabled: !!id,
  });
}

export function useParticipantMeasurements(
  challengeId: string | null | undefined,
  participantId: string | null | undefined
) {
  return useQuery<MeasurementListResponse>({
    queryKey: challengeKeys.measurements(challengeId || "", participantId || ""),
    queryFn: () =>
      api.get<MeasurementListResponse>(
        `${BASE}/${challengeId}/participants/${participantId}/measurements`
      ),
    enabled: !!challengeId && !!participantId,
  });
}

export function useChallengeRanking(
  id: string | null | undefined,
  categoryId?: string
) {
  return useQuery<RankingResponse>({
    queryKey: challengeKeys.ranking(id || "", categoryId),
    queryFn: () =>
      api.get<RankingResponse>(`${BASE}/${id}/ranking`, {
        query: { category_id: categoryId },
      }),
    enabled: !!id,
    refetchOnWindowFocus: true,
    staleTime: 30_000,
  });
}

export function useChallengeAttendance(id: string | null | undefined) {
  return useQuery<AttendanceReportResponse>({
    queryKey: challengeKeys.attendance(id || ""),
    queryFn: () =>
      api.get<AttendanceReportResponse>(`${BASE}/${id}/attendance-status`),
    enabled: !!id,
  });
}

// ─── Mutations: Challenge core ─────────────────────────────────────────────

export function useCreateChallenge() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateChallengeInput) =>
      api.post<Challenge>(BASE, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", "list"] });
    },
  });
}

export function useUpdateChallenge(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateChallengeInput) =>
      api.patch<Challenge>(`${BASE}/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
    },
  });
}

export function useTransitionChallenge(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (transition: ChallengeTransition) =>
      api.post<Challenge>(`${BASE}/${id}/status`, { transition }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges"] });
    },
  });
}

// ─── Mutations: Categories ─────────────────────────────────────────────────

export function useAddCategory(challengeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddCategoryInput) =>
      api.post<Category>(`${BASE}/${challengeId}/categories`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", challengeId] });
    },
  });
}

export function useUpdateCategory(challengeId: string, categoryId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateCategoryInput) =>
      api.patch<Category>(
        `${BASE}/${challengeId}/categories/${categoryId}`,
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", challengeId] });
    },
  });
}

export function useDeleteCategory(challengeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (categoryId: string) =>
      api.delete<void>(`${BASE}/${challengeId}/categories/${categoryId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", challengeId] });
    },
  });
}

// ─── Mutations: Participants ───────────────────────────────────────────────

export function useAddParticipant(challengeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: AddParticipantInput) =>
      api.post<Participant>(`${BASE}/${challengeId}/participants`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", challengeId] });
    },
  });
}

export function useUpdateParticipant(challengeId: string, participantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateParticipantInput) =>
      api.patch<Participant>(
        `${BASE}/${challengeId}/participants/${participantId}`,
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", challengeId] });
    },
  });
}

export function useRemoveParticipant(challengeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (participantId: string) =>
      api.delete<void>(`${BASE}/${challengeId}/participants/${participantId}`),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", challengeId] });
    },
  });
}

// ─── Mutations: Measurements ───────────────────────────────────────────────

// useCaptureMeasurement — guarda una medición. Si ya había una activa para el
// mismo (participant, moment) el BE responde con `superseded_prior_id` y la
// modal del FE muestra el aviso de reemplazo antes de hacer submit.
export function useCaptureMeasurement(challengeId: string, participantId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CaptureMeasurementInput) =>
      api.post<CaptureMeasurementResponse>(
        `${BASE}/${challengeId}/participants/${participantId}/measurements`,
        input
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", challengeId] });
    },
  });
}

// ─── Mutations: Disqualifications ──────────────────────────────────────────

export function useCheckDisqualifications(challengeId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<CheckDisqualificationsResponse>(
        `${BASE}/${challengeId}/check-disqualifications`,
        {}
      ),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["challenges", challengeId] });
    },
  });
}
