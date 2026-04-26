import { useQuery } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface SetupStatus {
  current_step: 1 | 2 | 3 | 4 | 5;
  setup_completed: boolean;
  gym_name: string | null;
  city: string | null;
  whatsapp: string | null;
  membership_types_count: number;
  payment_methods: { cash: boolean; transfer: boolean; card: boolean };
}

export function useSetupStatus() {
  const isAuthed = useAuthStore((s) => !!s.user);
  return useQuery<SetupStatus>({
    queryKey: ["gym", "setup-status"],
    queryFn: () => api.get<SetupStatus>("/api/v1/gyms/me/setup-status"),
    enabled: isAuthed,
    staleTime: 0,
  });
}
