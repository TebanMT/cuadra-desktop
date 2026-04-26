import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { useAuthStore } from "@/stores/useAuthStore";

export interface GymProfile {
  id: string;
  name: string;
  city: string;
  whatsapp_number: string | null;
  timezone: string;
  rfc: string | null;
  legal_name: string | null;
  postal_code: string | null;
  tax_regime: string | null;
  logo_url: string | null;
  primary_color: string | null;
  secondary_color: string | null;
  open_time: string | null;
  close_time: string | null;
  kiosk_volume: number;
  kiosk_feedback_ttl_ms: number;
  setup_completed: boolean;
}

export interface UpdateGymProfileInput {
  name?: string;
  city?: string;
  whatsapp_number?: string | null;
  timezone?: string;
  rfc?: string | null;
  legal_name?: string | null;
  postal_code?: string | null;
  tax_regime?: string | null;
  logo_url?: string | null;
  primary_color?: string | null;
  secondary_color?: string | null;
  open_time?: string | null;
  close_time?: string | null;
  kiosk_volume?: number;
  kiosk_feedback_ttl_ms?: number;
}

export interface TransferOwnershipStartInput {
  target_user_id: string;
}

export interface TransferOwnershipStartResponse {
  expires_at: string;
}

export interface TransferOwnershipConfirmInput {
  target_user_id: string;
  otp: string;
}

const KEYS = {
  profile: () => ["gym", "profile"] as const,
};

export function useGymProfile() {
  return useQuery<GymProfile>({
    queryKey: KEYS.profile(),
    queryFn: () => api.get<GymProfile>("/api/v1/gyms/me"),
    staleTime: 60_000,
  });
}

export function useUpdateGymProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateGymProfileInput) =>
      api.patch<GymProfile>("/api/v1/gyms/me", input),
    onSuccess: (gym) => {
      qc.invalidateQueries({ queryKey: ["gym"] });
      const auth = useAuthStore.getState();
      if (auth.gym) {
        auth.setGym({ ...auth.gym, name: gym.name });
      }
    },
  });
}

export function useUploadGymLogo() {
  return useMutation({
    mutationFn: async (file: File) => {
      const fd = new FormData();
      fd.append("file", file);
      const res = await fetch("/api/v1/gyms/me/logo", { method: "POST", body: fd });
      if (!res.ok) throw new Error("upload_failed");
      return (await res.json()) as { logo_url: string };
    },
  });
}

export function useStartTransferOwnership() {
  return useMutation({
    mutationFn: (input: TransferOwnershipStartInput) =>
      api.post<TransferOwnershipStartResponse>(
        "/api/v1/gyms/me/transfer-ownership/start",
        input
      ),
  });
}

export function useConfirmTransferOwnership() {
  return useMutation({
    mutationFn: (input: TransferOwnershipConfirmInput) =>
      api.post<{ ok: true }>("/api/v1/gyms/me/transfer-ownership", input),
  });
}

export const TIMEZONES_MX = [
  "America/Mexico_City",
  "America/Cancun",
  "America/Chihuahua",
  "America/Hermosillo",
  "America/Mazatlan",
  "America/Monterrey",
  "America/Tijuana",
  "America/Merida",
  "America/Bahia_Banderas",
  "America/Matamoros",
  "America/Ojinaga",
];

export const TAX_REGIMES_MX: { code: string; label: string }[] = [
  { code: "601", label: "601 - General de Ley Personas Morales" },
  { code: "603", label: "603 - Personas Morales con Fines no Lucrativos" },
  { code: "605", label: "605 - Sueldos y Salarios e Ingresos Asimilados" },
  { code: "606", label: "606 - Arrendamiento" },
  { code: "612", label: "612 - Personas Físicas con Actividades Empresariales" },
  { code: "621", label: "621 - Incorporación Fiscal" },
  { code: "626", label: "626 - Régimen Simplificado de Confianza (RESICO)" },
];
