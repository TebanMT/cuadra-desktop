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

interface RequestOptions extends Omit<RequestInit, "body" | "headers"> {
  body?: unknown;
  headers?: Record<string, string>;
  query?: Record<string, string | number | boolean | undefined>;
  skipAuth?: boolean;
  retry?: number;
}

const DEFAULT_RETRIES = 2;

async function refreshAccessToken(): Promise<string | null> {
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
    await clearTokens();
    return null;
  }
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
        return ct.includes("application/json") ? await res.json() : ((await res.text()) as T);
      }
      if (res.status >= 500 && attempt < retry) {
        attempt++;
        await new Promise((r) => setTimeout(r, 200 * attempt * attempt));
        continue;
      }
      const payload = await safeJson(res);
      throw new ApiError(
        res.status,
        payload?.code || `http_${res.status}`,
        payload?.message || res.statusText,
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
};
