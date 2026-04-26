import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type MaintenanceFrequency = "monthly" | "annual";

export interface MembershipType {
  id: string;
  name: string;
  price: number;
  duration_days: number;
  enrollment_fee: number;
  maintenance_fee: number;
  maintenance_frequency?: MaintenanceFrequency;
  active: boolean;
}

export interface UpsertMembershipTypeInput {
  name: string;
  price: number;
  duration_days: number;
  enrollment_fee: number;
  maintenance_fee: number;
  maintenance_frequency?: MaintenanceFrequency;
}

const KEYS = {
  list: (includeInactive: boolean) => ["membership-types", includeInactive] as const,
};

export function useMembershipTypes(includeInactive = false) {
  return useQuery<MembershipType[]>({
    queryKey: KEYS.list(includeInactive),
    queryFn: () =>
      api.get<MembershipType[]>("/api/v1/membership-types", {
        query: includeInactive ? { include_inactive: "true" } : undefined,
      }),
    staleTime: 60_000,
  });
}

export function useCreateMembershipType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertMembershipTypeInput) =>
      api.post<MembershipType>("/api/v1/membership-types", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["membership-types"] }),
  });
}

export function useUpdateMembershipType(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpsertMembershipTypeInput) =>
      api.patch<MembershipType>(`/api/v1/membership-types/${id}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["membership-types"] }),
  });
}

export function useDeactivateMembershipType() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<MembershipType>(`/api/v1/membership-types/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["membership-types"] }),
  });
}
