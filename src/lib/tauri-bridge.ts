import { isTauri } from "./utils";

type Invoke = (cmd: string, args?: Record<string, unknown>) => Promise<any>;

let _invoke: Invoke | null = null;
let _listen: typeof import("@tauri-apps/api/event").listen | null = null;

async function getInvoke(): Promise<Invoke> {
  if (_invoke) return _invoke;
  if (!isTauri()) {
    _invoke = async (cmd) => {
      throw new Error(`Tauri command "${cmd}" not available outside Tauri shell`);
    };
    return _invoke;
  }
  const mod = await import("@tauri-apps/api/core");
  _invoke = mod.invoke as Invoke;
  return _invoke;
}

export async function getSidecarUrl(): Promise<string> {
  if (!isTauri()) {
    return import.meta.env.VITE_SIDECAR_URL || "http://localhost:9090";
  }
  const invoke = await getInvoke();
  return invoke("get_sidecar_url");
}

export async function getLocalAuthToken(): Promise<string> {
  if (!isTauri()) {
    return "dev-no-token";
  }
  const invoke = await getInvoke();
  return invoke("get_local_auth_token");
}

export async function secureStorageSet(key: string, value: string): Promise<void> {
  if (!isTauri()) {
    localStorage.setItem(`tinta:${key}`, value);
    return;
  }
  const invoke = await getInvoke();
  await invoke("secure_storage_set", { key, value });
}

export async function secureStorageGet(key: string): Promise<string | null> {
  if (!isTauri()) {
    return localStorage.getItem(`tinta:${key}`);
  }
  const invoke = await getInvoke();
  const v = await invoke("secure_storage_get", { key });
  return (v as string | null) ?? null;
}

export async function secureStorageDelete(key: string): Promise<void> {
  if (!isTauri()) {
    localStorage.removeItem(`tinta:${key}`);
    return;
  }
  const invoke = await getInvoke();
  await invoke("secure_storage_delete", { key });
}

export async function printPdf(bytes: Uint8Array): Promise<void> {
  if (!isTauri()) {
    console.warn("printPdf called outside Tauri — no-op");
    return;
  }
  const invoke = await getInvoke();
  await invoke("print_pdf", { bytes: Array.from(bytes) });
}

export async function quitApp(): Promise<void> {
  if (!isTauri()) return;
  const invoke = await getInvoke();
  await invoke("quit_app");
}

export function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export async function listenEvent<T = unknown>(
  event: string,
  handler: (payload: T) => void
): Promise<() => void> {
  if (!isTauri()) return () => {};
  if (!_listen) {
    const mod = await import("@tauri-apps/api/event");
    _listen = mod.listen;
  }
  const unlisten = await _listen<T>(event, (e) => handler(e.payload));
  return unlisten;
}
