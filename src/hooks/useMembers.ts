import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type MemberStatusFilter = "" | "active" | "expiring_soon" | "expired" | "inactive";
export type MemberSort = "name" | "expiry" | "created_at";
export type SortDir = "asc" | "desc";

export type MemberStatus = "active" | "inactive" | "lost";
export type MembershipStatus = "active" | "expired" | "replaced" | "cancelled";
export type AccessStatus =
  | "allowed_active"
  | "allowed_expiring_soon"
  | "denied_expired"
  | "denied_inactive"
  | "denied_no_membership";

export interface Member {
  id: string;
  gym_id: string;
  folio: string;
  full_name: string;
  phone: string;
  email?: string;
  birthdate?: string;
  photo_url?: string;
  notes?: string;
  status: MemberStatus;
  enrollment_paid: boolean;
  last_maintenance_paid?: string;
  has_pin: boolean;
  last_contact_attempt_at?: string;
  created_at: string;
}

export interface MembershipSummary {
  id: string;
  membership_type_id: string;
  type_name: string;
  price: number;
  start_date: string;
  expiry_date: string;
  status: MembershipStatus;
  duration_days_snapshot: number;
}

export interface MemberListItem {
  member: Member;
  current_membership?: MembershipSummary;
  access_status: AccessStatus;
}

export interface MemberListResponse {
  items: MemberListItem[];
  total: number;
  page: number;
  page_size: number;
}

export interface MemberDetail {
  member: Member;
  current_membership?: MembershipSummary;
  access_status: AccessStatus;
}

export interface ListMembersInput {
  q?: string;
  status?: MemberStatusFilter;
  plan_id?: string;
  sort?: MemberSort;
  dir?: SortDir;
  page?: number;
  page_size?: number;
}

export interface CreateMemberInput {
  full_name: string;
  phone: string;
  email?: string;
  birthdate?: string;
  photo_url?: string;
  notes?: string;
  membership_type_id: string;
  start_date?: string;
  allow_duplicate_phone?: boolean;
  charge_first_payment?: boolean;
  payment_method?: "cash" | "transfer" | "card";
}

export interface CreateMemberResponse {
  member_id: string;
  membership_id: string;
  folio: string;
  expiry_date: string;
  pending_first_payment: boolean;
}

export interface UpdateMemberInput {
  full_name?: string;
  phone?: string;
  email?: string;
  birthdate?: string;
  photo_url?: string;
  notes?: string;
}

export interface ToggleStatusInput {
  status: MemberStatus;
  reason?: string;
}

export interface LockExpiryInput {
  mode: "extend" | "set" | "reset";
  days?: number;
  new_expiry?: string;
  reason: string;
}

export interface LockExpiryResponse {
  membership_id: string;
  previous_expiry: string;
  new_expiry: string;
  days_added: number;
}

export interface AssignPinResponse {
  member_id: string;
  pin: string;
}

const KEYS = {
  list: (filters: ListMembersInput) => ["members", "list", filters] as const,
  detail: (id: string) => ["members", "detail", id] as const,
  counts: () => ["members", "counts"] as const,
};

function buildQuery(filters: ListMembersInput): Record<string, string | number | boolean | undefined> {
  return {
    q: filters.q || undefined,
    status: filters.status || undefined,
    plan_id: filters.plan_id || undefined,
    sort: filters.sort || undefined,
    dir: filters.dir || undefined,
    page: filters.page,
    page_size: filters.page_size,
  };
}

export function useMembersList(filters: ListMembersInput) {
  return useQuery<MemberListResponse>({
    queryKey: KEYS.list(filters),
    queryFn: () => api.get<MemberListResponse>("/api/v1/members", { query: buildQuery(filters) }),
    placeholderData: keepPreviousData,
  });
}

const COUNT_FILTERS: MemberStatusFilter[] = ["active", "expiring_soon", "expired", "inactive"];

export interface MemberStatusCounts {
  total: number;
  active: number;
  expiring_soon: number;
  expired: number;
  inactive: number;
}

export function useMemberStatusCounts() {
  return useQuery<MemberStatusCounts>({
    queryKey: KEYS.counts(),
    queryFn: async () => {
      const queries = await Promise.all([
        api.get<MemberListResponse>("/api/v1/members", { query: { page: 1, page_size: 1 } }),
        ...COUNT_FILTERS.map((s) =>
          api.get<MemberListResponse>("/api/v1/members", {
            query: { status: s, page: 1, page_size: 1 },
          })
        ),
      ]);
      const [all, active, expiring, expired, inactive] = queries;
      return {
        total: all.total,
        active: active.total,
        expiring_soon: expiring.total,
        expired: expired.total,
        inactive: inactive.total,
      };
    },
    staleTime: 30_000,
  });
}

export function useMember(id: string | null | undefined) {
  return useQuery<MemberDetail>({
    queryKey: KEYS.detail(id || ""),
    queryFn: () => api.get<MemberDetail>(`/api/v1/members/${id}`),
    enabled: !!id,
  });
}

export function useCreateMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: CreateMemberInput) =>
      api.post<CreateMemberResponse>("/api/v1/members", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useUpdateMember(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateMemberInput) => api.patch<Member>(`/api/v1/members/${id}`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useToggleMemberStatus(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ToggleStatusInput) =>
      api.patch<Member>(`/api/v1/members/${id}/status`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useLockExpiry(membershipID: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: LockExpiryInput) =>
      api.post<LockExpiryResponse>(`/api/v1/memberships/${membershipID}/lock-expiry`, input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["members"] });
    },
  });
}

export function useAssignPin(memberID: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<AssignPinResponse>(`/api/v1/members/${memberID}/pin`, {}),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.detail(memberID) });
    },
  });
}
