import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";

export type WhatsappStatus = "not_connected" | "pending_verification" | "connected" | "error";

export interface WhatsappState {
  status: WhatsappStatus;
  phone_number: string | null;
  connected_at: string | null;
  provider: string | null;
  stats: {
    sent_last_30d: number;
    delivered_last_30d: number;
    failed_last_30d: number;
  } | null;
  last_error: string | null;
}

export interface ConnectWhatsappStartInput {
  phone_number: string;
}

export interface ConnectWhatsappConfirmInput {
  phone_number: string;
  code: string;
}

export type TemplateKey =
  | "expiry_reminder_pre"
  | "expiry_reminder_day"
  | "expiry_reminder_post"
  | "payment_receipt"
  | "birthday_greeting"
  | "welcome_member"
  | "balance_reminder";

export interface NotificationTemplate {
  key: TemplateKey;
  name: string;
  body: string;
  enabled: boolean;
  is_default: boolean;
  variables: string[];
  description: string;
  updated_at: string | null;
}

export interface UpdateTemplateInput {
  body?: string;
  enabled?: boolean;
}

export type AlertKey =
  | "low_stock"
  | "expired_no_contact"
  | "vip_member_no_visit"
  | "cash_close_diff"
  | "no_payments_today";

export interface AlertConfig {
  key: AlertKey;
  enabled: boolean;
  description: string;
}

export interface AlertsConfigResponse {
  items: AlertConfig[];
}

export interface UpdateAlertInput {
  enabled: boolean;
}

export type BroadcastAudience =
  | "all_active"
  | "expiring_this_week"
  | "expired_recoverable"
  | "inactive_21d"
  | "vip";

export interface BroadcastPreviewResponse {
  audience: BroadcastAudience;
  recipients_count: number;
  sample_phones: string[];
}

export interface SendBroadcastInput {
  audience: BroadcastAudience;
  body: string;
}

export interface SendBroadcastResponse {
  broadcast_id: string;
  recipients_count: number;
  enqueued_at: string;
}

const KEYS = {
  whatsapp: () => ["notifications", "whatsapp"] as const,
  templates: () => ["notifications", "templates"] as const,
  alerts: () => ["notifications", "alerts"] as const,
  broadcastPreview: (audience: BroadcastAudience) =>
    ["notifications", "broadcast", "preview", audience] as const,
};

export function useWhatsappState() {
  return useQuery<WhatsappState>({
    queryKey: KEYS.whatsapp(),
    queryFn: () => api.get<WhatsappState>("/api/v1/gyms/me/whatsapp"),
    staleTime: 30_000,
  });
}

export function useStartWhatsappConnect() {
  return useMutation({
    mutationFn: (input: ConnectWhatsappStartInput) =>
      api.post<{ expires_at: string }>("/api/v1/gyms/me/whatsapp/start", input),
  });
}

export function useConfirmWhatsappConnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: ConnectWhatsappConfirmInput) =>
      api.post<WhatsappState>("/api/v1/gyms/me/whatsapp/connect", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "whatsapp"] }),
  });
}

export function useDisconnectWhatsapp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.delete<{ ok: true }>("/api/v1/gyms/me/whatsapp"),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "whatsapp"] }),
  });
}

export function useTemplates() {
  return useQuery<{ items: NotificationTemplate[] }>({
    queryKey: KEYS.templates(),
    queryFn: () =>
      api.get<{ items: NotificationTemplate[] }>("/api/v1/notification-templates"),
    staleTime: 60_000,
  });
}

export function useUpdateTemplate(key: TemplateKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateTemplateInput) =>
      api.patch<NotificationTemplate>(`/api/v1/notification-templates/${key}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "templates"] }),
  });
}

export function useResetTemplate(key: TemplateKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      api.post<NotificationTemplate>(`/api/v1/notification-templates/${key}/reset`, {}),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "templates"] }),
  });
}

export function useAlerts() {
  return useQuery<AlertsConfigResponse>({
    queryKey: KEYS.alerts(),
    queryFn: () => api.get<AlertsConfigResponse>("/api/v1/owner-alerts"),
    staleTime: 60_000,
  });
}

export function useUpdateAlert(key: AlertKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: UpdateAlertInput) =>
      api.patch<AlertConfig>(`/api/v1/owner-alerts/${key}`, input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["notifications", "alerts"] }),
  });
}

export function useBroadcastPreview(audience: BroadcastAudience | null) {
  return useQuery<BroadcastPreviewResponse>({
    queryKey: KEYS.broadcastPreview(audience as BroadcastAudience),
    queryFn: () =>
      api.get<BroadcastPreviewResponse>("/api/v1/broadcasts/preview", {
        query: { audience: audience as string },
      }),
    enabled: !!audience,
    staleTime: 15_000,
  });
}

export function useSendBroadcast() {
  return useMutation({
    mutationFn: (input: SendBroadcastInput) =>
      api.post<SendBroadcastResponse>("/api/v1/broadcasts", input),
  });
}

export const TEMPLATE_VARIABLES: Record<TemplateKey, string[]> = {
  expiry_reminder_pre: [
    "{gym_name}",
    "{member_first_name}",
    "{member_name}",
    "{expiry_date}",
    "{membership_type}",
    "{gym_address}",
    "{gym_whatsapp}",
  ],
  expiry_reminder_day: [
    "{gym_name}",
    "{member_first_name}",
    "{member_name}",
    "{membership_type}",
    "{gym_address}",
  ],
  expiry_reminder_post: [
    "{gym_name}",
    "{member_first_name}",
    "{member_name}",
    "{gym_address}",
  ],
  payment_receipt: [
    "{gym_name}",
    "{member_first_name}",
    "{amount}",
    "{concept}",
    "{new_expiry_date}",
  ],
  birthday_greeting: ["{gym_name}", "{member_first_name}"],
  welcome_member: ["{gym_name}", "{member_first_name}", "{membership_type}", "{expiry_date}"],
  balance_reminder: ["{gym_name}", "{member_first_name}", "{balance}"],
};
