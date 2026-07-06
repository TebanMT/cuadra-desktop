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

// printPdf manda el PDF a la impresora default vía el verbo Print del
// sistema; si la asociación de PDF no lo soporta (Edge sin Acrobat — el
// caso normal), el comando abre el visor por defecto y devolvemos
// "opened" para que el caller ponga el copy honesto ("imprime desde el
// visor") en vez de un éxito falso.
export async function printPdf(bytes: Uint8Array): Promise<"printed" | "opened"> {
  if (!isTauri()) {
    console.warn("printPdf called outside Tauri — no-op");
    return "printed";
  }
  const invoke = await getInvoke();
  return (await invoke("print_pdf", { bytes: Array.from(bytes) })) as "printed" | "opened";
}

export async function quitApp(): Promise<void> {
  if (!isTauri()) return;
  const invoke = await getInvoke();
  await invoke("quit_app");
}

let _appVersion: string | null = null;

// getAppVersion returns the bundle version from tauri.conf.json. Outside
// the Tauri shell (plain vite dev / tests) there is no bundle, so it
// reports "dev".
export async function getAppVersion(): Promise<string> {
  if (_appVersion) return _appVersion;
  if (!isTauri()) {
    _appVersion = "dev";
    return _appVersion;
  }
  const mod = await import("@tauri-apps/api/app");
  _appVersion = await mod.getVersion();
  return _appVersion;
}

// saveBlob guarda un archivo con diálogo nativo y devuelve la ruta
// elegida, o null si el usuario canceló. Dentro de Tauri NO se puede usar
// `<a download>` con blob: — WebView2 lo ignora en silencio (Tauri no
// cablea el download handler de wry), así que "Descargar"/"Exportar"
// mostraban éxito sin escribir nada a disco. Fuera del shell (vite dev)
// cae al anchor clásico del navegador.
export async function saveBlob(blob: Blob, filename: string): Promise<string | null> {
  if (!isTauri()) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    return filename;
  }
  const invoke = await getInvoke();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const path = await invoke("save_file", {
    bytes: Array.from(bytes),
    suggestedName: filename,
  });
  return (path as string | null) ?? null;
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
