import {
  getLocalAuthToken,
  getSidecarUrl,
  secureStorageDelete,
  secureStorageGet,
  secureStorageSet,
} from "./tauri-bridge";

const ACCESS_TOKEN_KEY = "user_access_token";
const REFRESH_TOKEN_KEY = "user_refresh_token";

export class ApiError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
    public details?: unknown
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface BootInfo {
  baseUrl: string;
  localToken: string;
}

let bootPromise: Promise<BootInfo> | null = null;

async function boot(): Promise<BootInfo> {
  if (bootPromise) return bootPromise;
  bootPromise = (async () => {
    const [baseUrl, localToken] = await Promise.all([getSidecarUrl(), getLocalAuthToken()]);
    return { baseUrl: baseUrl.replace(/\/$/, ""), localToken };
  })();
  return bootPromise;
}

export function resetApiBoot() {
  bootPromise = null;
}

export async function getAccessToken(): Promise<string | null> {
  return secureStorageGet(ACCESS_TOKEN_KEY);
}

export async function setTokens(access: string, refresh: string) {
  await Promise.all([
    secureStorageSet(ACCESS_TOKEN_KEY, access),
    secureStorageSet(REFRESH_TOKEN_KEY, refresh),
  ]);
}

export async function clearTokens() {
  await Promise.all([
    secureStorageDelete(ACCESS_TOKEN_KEY),
    secureStorageDelete(REFRESH_TOKEN_KEY),
  ]);
}

// Note: the old pushSyncAuth / ensureSyncAuth helpers are gone. The sync
// agent now reads its sk_live_* sidecar credential from sync_state (set
// by SidecarAuthProxy on login), so the desktop has no role in keeping
// the agent authenticated.

interface RequestOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  skipAuth?: boolean;
  retry?: number;
}

const DEFAULT_RETRIES = 2;

// onAuthExpired is kept as a hook for code that wants to react to a session
// loss (e.g. closing modals), but it is *no longer fired* by token refresh
// failures. The desktop is a permanent reception screen — only the explicit
// "Cerrar sesión" action drops the session. Refresh failures keep the (now
// possibly stale) tokens around and let the next request retry naturally.
let onAuthExpired: (() => void) | null = null;
export function setOnAuthExpired(handler: (() => void) | null) {
  onAuthExpired = handler;
}

// SubscriptionInactivePayload espeja el JSON que el sidecar devuelve con
// HTTP 402 cuando el gym tiene suscripción cancelada + grace vencida (ver
// middleware/subscription_gate.go). El handler de abajo lo recibe para que
// el FE pueda forzar la pantalla de bloqueo aun si el operador estaba a
// mitad de un flujo cuando el sync trajo el flip a cancelled.
export interface SubscriptionInactivePayload {
  error: "subscription_inactive";
  message: string;
  subscription_status: string;
  subscription_ends_at: string | null;
}

let onSubscriptionInactive:
  | ((payload: SubscriptionInactivePayload) => void)
  | null = null;
export function setOnSubscriptionInactive(
  handler: ((payload: SubscriptionInactivePayload) => void) | null
) {
  onSubscriptionInactive = handler;
}

// PlanRequiredPayload espeja el JSON que el BE devuelve con HTTP 402
// `plan_required` (shared/middleware/plus_gate.go). Diferente al
// `subscription_inactive`: aquí el gym SÍ tiene acceso válido (active /
// trial / past_due) pero su SKU es Standard y la acción exigía Plus.
// El FE desktop ya gatea las páginas con PlusFeatureLock, así que este
// callback es defensa en profundidad para deep-links o llamadas que se
// hayan colado.
export interface PlanRequiredPayload {
  error: "plan_required";
  required_plan: string;
  current_plan: string;
  message: string;
}

let onPlanRequired: ((payload: PlanRequiredPayload) => void) | null = null;
export function setOnPlanRequired(
  handler: ((payload: PlanRequiredPayload) => void) | null,
) {
  onPlanRequired = handler;
}

// getAuthedRequestContext expone base URL + headers de auth para consumidores
// que hablan con el sidecar FUERA de rawRequest — hoy, el cliente SSE de
// biometricEvents.ts (fetch+ReadableStream, porque EventSource no puede
// mandar Authorization). Mismo Bearer + X-Local-Token que el resto de la API.
export async function getAuthedRequestContext(): Promise<{
  baseUrl: string;
  headers: Record<string, string>;
}> {
  const { baseUrl, localToken } = await boot();
  const headers: Record<string, string> = { "X-Local-Token": localToken };
  const token = await getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;
  return { baseUrl, headers };
}

// refreshInFlight coalesces concurrent refresh attempts so a burst of 401s
// only triggers one POST /auth/refresh.
let refreshInFlight: Promise<string | null> | null = null;

export async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;
  refreshInFlight = (async () => {
    const refresh = await secureStorageGet(REFRESH_TOKEN_KEY);
    if (!refresh) return null;
    try {
      const data = await rawRequest<{ access_token: string; refresh_token: string }>(
        "POST",
        "/api/v1/auth/refresh",
        { body: { refresh_token: refresh }, skipAuth: true, retry: 0 }
      );
      await setTokens(data.access_token, data.refresh_token);
      return data.access_token;
    } catch {
      // Intentionally do NOT clear tokens or fire onAuthExpired. Sidecar
      // may be momentarily down, the cloud may have rotated secrets, or
      // any number of transient issues we don't want to interpret as a
      // logout. The original 401 bubbles back to the caller and the user
      // can retry.
      return null;
    }
  })().finally(() => {
    refreshInFlight = null;
  });
  return refreshInFlight;
}

async function rawRequest<T>(
  method: string,
  path: string,
  opts: RequestOptions = {}
): Promise<T> {
  const { baseUrl, localToken } = await boot();
  const url = new URL(path.startsWith("http") ? path : `${baseUrl}${path}`);
  if (opts.query) {
    Object.entries(opts.query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }

  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Local-Token": localToken,
    ...(opts.headers || {}),
  };

  if (!opts.skipAuth) {
    const token = await getAccessToken();
    if (token) headers["Authorization"] = `Bearer ${token}`;
  }

  const init: RequestInit = {
    method,
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  };

  const retry = opts.retry ?? DEFAULT_RETRIES;
  let attempt = 0;
  let lastErr: unknown;

  while (attempt <= retry) {
    try {
      const res = await fetch(url.toString(), init);
      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const ct = res.headers.get("content-type") || "";
        if (!ct.includes("application/json")) return (await res.text()) as T;
        const body = await res.json();
        return unwrapEnvelope<T>(body);
      }
      if (res.status >= 500 && attempt < retry) {
        attempt++;
        await new Promise((r) => setTimeout(r, 200 * attempt * attempt));
        continue;
      }
      const payload = await safeJson(res);
      // 402 con shape conocido = suscripción vencida según el sidecar. Fire
      // del callback ANTES del throw para que el router pueda actualizar el
      // auth store (subscription_status='cancelled') y redirigir. El throw
      // se mantiene para que el caller que disparó el request vea el error
      // y deje de procesar.
      if (
        res.status === 402 &&
        payload?.error === "subscription_inactive" &&
        onSubscriptionInactive
      ) {
        onSubscriptionInactive(payload as SubscriptionInactivePayload);
      }
      // 402 plan_required → handler app-level muestra toast con CTA
      // a /settings/subscription. NO bloqueamos la sesión; el dueño
      // sigue operando en Standard.
      if (
        res.status === 402 &&
        payload?.error === "plan_required" &&
        onPlanRequired
      ) {
        onPlanRequired(payload as PlanRequiredPayload);
      }
      throw new ApiError(
        res.status,
        payload?.code || payload?.error || `http_${res.status}`,
        payload?.exception || payload?.message || res.statusText,
        payload
      );
    } catch (e) {
      if (e instanceof ApiError) throw e;
      lastErr = e;
      if (attempt < retry) {
        attempt++;
        await new Promise((r) => setTimeout(r, 200 * attempt));
        continue;
      }
      break;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("network error");
}

async function safeJson(res: Response): Promise<any> {
  try {
    return await res.json();
  } catch {
    return null;
  }
}

// The cuadra-core API wraps every successful response in
// { status_code, message, data, exception? }. Unwrap defensively so endpoints
// that don't use the envelope (health checks, raw blobs) still pass through.
function unwrapEnvelope<T>(body: any): T {
  if (
    body !== null &&
    typeof body === "object" &&
    !Array.isArray(body) &&
    typeof body.status_code === "number" &&
    "data" in body
  ) {
    return body.data as T;
  }
  return body as T;
}

async function request<T>(method: string, path: string, opts: RequestOptions = {}): Promise<T> {
  try {
    return await rawRequest<T>(method, path, opts);
  } catch (e) {
    if (e instanceof ApiError && e.status === 401 && !opts.skipAuth) {
      const newToken = await refreshAccessToken();
      if (newToken) {
        return rawRequest<T>(method, path, opts);
      }
    }
    throw e;
  }
}

export interface BlobResponse {
  blob: Blob;
  filename?: string;
}

export async function getBlob(path: string, query?: RequestOptions["query"]): Promise<BlobResponse> {
  const { baseUrl, localToken } = await boot();
  const url = new URL(path.startsWith("http") ? path : `${baseUrl}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const headers: Record<string, string> = { "X-Local-Token": localToken };
  const token = await getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), { method: "GET", headers });
  if (!res.ok) {
    const payload = await safeJson(res);
    throw new ApiError(
      res.status,
      payload?.code || `http_${res.status}`,
      payload?.message || res.statusText,
      payload
    );
  }
  const disp = res.headers.get("content-disposition") || "";
  const match = /filename="?([^"]+)"?/i.exec(disp);
  return { blob: await res.blob(), filename: match?.[1] };
}

// postFormData sube un multipart/form-data preservando auth + envelope-unwrap.
// El rawRequest se salta porque serializa siempre a JSON; acá necesitamos que
// el browser maneje el boundary del multipart por nosotros.
async function postFormData<T>(
  path: string,
  data: FormData,
  query?: RequestOptions["query"]
): Promise<T> {
  const { baseUrl, localToken } = await boot();
  const url = new URL(path.startsWith("http") ? path : `${baseUrl}${path}`);
  if (query) {
    Object.entries(query).forEach(([k, v]) => {
      if (v !== undefined && v !== null) url.searchParams.set(k, String(v));
    });
  }
  const headers: Record<string, string> = { "X-Local-Token": localToken };
  const token = await getAccessToken();
  if (token) headers["Authorization"] = `Bearer ${token}`;

  const res = await fetch(url.toString(), { method: "POST", headers, body: data });
  if (!res.ok) {
    const payload = await safeJson(res);
    throw new ApiError(
      res.status,
      payload?.code || payload?.error || `http_${res.status}`,
      payload?.exception || payload?.message || res.statusText,
      payload
    );
  }
  if (res.status === 204) return undefined as T;
  const ct = res.headers.get("content-type") || "";
  if (!ct.includes("application/json")) return (await res.text()) as T;
  return unwrapEnvelope<T>(await res.json());
}

export const api = {
  get: <T>(path: string, opts?: RequestOptions) => request<T>("GET", path, opts),
  post: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("POST", path, { ...opts, body }),
  patch: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PATCH", path, { ...opts, body }),
  put: <T>(path: string, body?: unknown, opts?: RequestOptions) =>
    request<T>("PUT", path, { ...opts, body }),
  delete: <T>(path: string, opts?: RequestOptions) => request<T>("DELETE", path, opts),
  blob: getBlob,
  postFormData,
};
