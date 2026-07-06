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
  /** Outbound URL invoked by the sidecar when a checkin is allowed. Empty
   * string clears the value; null means "not configured". */
  access_webhook_url: string | null;
  /** Whether an HMAC secret is set. The actual secret is never returned to
   * the client (it stays in the sidecar/cloud database). */
  access_webhook_secret_set: boolean;
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
  access_webhook_url?: string | null;
  /** Set to a non-empty string to rotate the secret, "" to clear, omit to
   * keep the existing one. */
  access_webhook_secret?: string | null;
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

// Knobs cosméticos del feedback de check-in (DA-031.5) que el dueño edita
// en Ajustes → Perfil del gym: cuánto dura el veredicto en pantalla
// ("Duración del feedback al check-in") y a qué volumen suena el tono
// ("Volumen del kiosko"). Los consumen TODAS las superficies de check-in
// (kiosko, flotante, /checkin y el scanner global) — un solo knob, mismo
// comportamiento en todas.
//
// El BE siempre responde valores concretos (defaults 4000ms / 80); los
// fallbacks de aquí sólo cubren el primer render (query cargando) y BEs
// viejos sin el campo.
export const CHECKIN_FEEDBACK_TTL_FALLBACK_MS = 4000;
export const CHECKIN_TONE_VOLUME_FALLBACK = 0.8;

export interface CheckinFeedbackSettings {
  ttlMs: number;
  // 0..1 — listo para playCheckinTone (el wire lo trae 0..100). 0 = mudo,
  // decisión legítima del dueño; por eso NO se le aplica fallback.
  volume: number;
}

export function useCheckinFeedbackSettings(): CheckinFeedbackSettings {
  const gym = useGymProfile();
  const ttlMs =
    gym.data?.kiosk_feedback_ttl_ms ?? CHECKIN_FEEDBACK_TTL_FALLBACK_MS;
  const volume =
    typeof gym.data?.kiosk_volume === "number"
      ? gym.data.kiosk_volume / 100
      : CHECKIN_TONE_VOLUME_FALLBACK;
  return { ttlMs, volume };
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
