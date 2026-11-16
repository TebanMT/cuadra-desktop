import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quitApp } from "@/lib/tauri-bridge";
import { common } from "@/strings/common";

interface Props {
  state: "loading" | "restarting" | "failed";
}

const COPY = {
  loading: {
    title: common.startup.loadingTitle,
    body: common.startup.loadingBody,
  },
  restarting: {
    title: common.startup.restartingTitle,
    body: common.startup.restartingBody,
  },
  failed: {
    title: common.startup.failedTitle,
    body: common.startup.failedBody,
  },
} as const;

export function SidecarFailed({ state }: Props) {
  const failed = state === "failed";
  const copy = COPY[state];

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div
        className="max-w-md w-full text-center space-y-6"
        role={failed ? "alert" : "status"}
        aria-live={failed ? "assertive" : "polite"}
      >
        {failed ? (
          <AlertCircle aria-hidden className="mx-auto h-14 w-14 text-destructive" />
        ) : (
          <Loader2
            aria-hidden
            className="mx-auto h-14 w-14 text-primary animate-spin motion-reduce:animate-none"
          />
        )}

        <div className="space-y-2">
          <h1 className="font-display text-2xl text-foreground">{copy.title}</h1>
          <p className="text-muted-foreground">{copy.body}</p>
        </div>

        {failed && (
          <div className="flex flex-col gap-2">
            <Button size="lg" onClick={() => window.location.reload()}>
              {common.retry}
            </Button>
            <Button size="lg" variant="outline" onClick={() => quitApp()}>
              {common.startup.quit}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
