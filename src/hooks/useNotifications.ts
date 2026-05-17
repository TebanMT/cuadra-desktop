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

// Keys del BE (cuadra-core/src/modules/notifications/domain/template/template.go
// — DefaultLibrary). El enum estaba completamente fuera de sync con el BE y
// causaba el crash en TemplatesPage al hacer `t.templates.keys[tpl.key]` con
// claves que no existían acá (root cause del bug del runtime, no defendible
// con `?.title`).
export type TemplateKey =
  | "expiry_reminder_3d"
  | "expiry_reminder_today"
  | "expiry_reminder_5d_post"
  | "receipt_membership"
  | "receipt_product"
  | "owner_alert_low_stock"
  | "owner_alert_expired_batch"
  | "owner_alert_cash_close_diff"
  | "owner_alert_vip_no_visit"
  | "owner_alert_no_payments_today"
  | "broadcast_freeform"
  | "operator_temp_password"
  | "member_welcome_pin"
  | "whatsapp_connect_otp";

export interface NotificationTemplate {
  key: TemplateKey;
  channel: "whatsapp" | "email";
  category: string;
  variables: string[];
  default_body: string;
  body: string;
  enabled: boolean;
  is_default: boolean;
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

// AlertConfig espeja el wire shape del BE
// (cuadra-core/.../notifications_controller.go alertConfigWire). Cada alerta
// trae el toggle + la plantilla espejo en una sola lectura — la página
// Alertas pinta ambas cosas sin un segundo fetch.
export interface AlertConfig {
  key: AlertKey;
  enabled: boolean;
  description: string;
  template_key: TemplateKey;
  variables: string[];
  default_body: string;
  body: string;
  is_default: boolean;
}

export interface AlertsConfigResponse {
  items: AlertConfig[];
}

// UpdateAlertInput admite mover toggle, body o ambos en la misma llamada.
// Al menos uno tiene que ir; el BE valida y responde con el shape rico.
export interface UpdateAlertInput {
  enabled?: boolean;
  body?: string;
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

// useResetTemplate vuelve la plantilla a su texto original. Internamente es
// un PATCH con `body: default_body` contra el endpoint normal de edición —
// no existe un POST /reset en el BE. Semántica: "reset" = "submitir el body
// por defecto como tu override". El override row queda persistido pero su
// contenido coincide con el default; el FE compara body vs default_body
// para decidir si mostrar el badge "Personalizada", así que el botón
// Restaurar limpia ese badge en el acto.
export function useResetTemplate(key: TemplateKey) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (defaultBody: string) =>
      api.patch<NotificationTemplate>(`/api/v1/notification-templates/${key}`, {
        body: defaultBody,
      }),
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

// TEMPLATE_VARIABLES queda como referencia rápida para autocompletar en el
// modal de edición. La fuente de verdad sigue siendo el BE — `tpl.variables`
// del response es authoritative; este map sólo se usa cuando el BE no manda
// variables (raro, pero defendido). Las llaves espejan
// cuadra-core/.../template.go DefaultLibrary().
export const TEMPLATE_VARIABLES: Record<TemplateKey, string[]> = {
  expiry_reminder_3d: ["{member_first_name}", "{gym_name}", "{expiry_date}"],
  expiry_reminder_today: ["{member_first_name}", "{gym_name}"],
  expiry_reminder_5d_post: ["{member_first_name}", "{gym_name}"],
  receipt_membership: [
    "{member_first_name}",
    "{amount}",
    "{membership_type}",
    "{expiry_date}",
    "{gym_name}",
  ],
  receipt_product: ["{member_first_name}", "{amount}", "{gym_name}"],
  owner_alert_low_stock: ["{gym_name}", "{product_name}", "{stock}"],
  owner_alert_expired_batch: ["{gym_name}", "{count}"],
  owner_alert_cash_close_diff: ["{gym_name}", "{diff_amount}"],
  owner_alert_vip_no_visit: ["{gym_name}", "{member_name}", "{days_inactive}"],
  owner_alert_no_payments_today: ["{gym_name}", "{date}"],
  broadcast_freeform: ["{member_first_name}", "{gym_name}", "{message}"],
  operator_temp_password: ["{full_name}", "{gym_name}", "{temp_password}"],
  member_welcome_pin: ["{member_first_name}", "{gym_name}", "{pin}"],
  whatsapp_connect_otp: ["{code}"],
};
