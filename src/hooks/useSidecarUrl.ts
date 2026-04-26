import { useEffect, useState } from "react";
import { getSidecarUrl, listenEvent } from "@/lib/tauri-bridge";
import { resetApiBoot } from "@/lib/api";

type State = "loading" | "ready" | "failed" | "restarting";

export function useSidecarUrl() {
  const [state, setState] = useState<State>("loading");
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    let cleanups: Array<() => void> = [];

    (async () => {
      try {
        const u = await getSidecarUrl();
        if (!cancelled) {
          setUrl(u);
          setState("ready");
        }
      } catch {
        if (!cancelled) setState("loading");
      }
    })();

    listenEvent<string>("sidecar_ready", (u) => {
      resetApiBoot();
      setUrl(u);
      setState("ready");
    }).then((un) => cleanups.push(un));

    listenEvent("sidecar_restarting", () => {
      resetApiBoot();
      setState("restarting");
    }).then((un) => cleanups.push(un));

    listenEvent("sidecar_failed", () => setState("failed")).then((un) => cleanups.push(un));

    return () => {
      cancelled = true;
      cleanups.forEach((c) => c());
    };
  }, []);

  return { state, url };
}
