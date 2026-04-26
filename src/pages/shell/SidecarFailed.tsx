import { AlertCircle, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { quitApp } from "@/lib/tauri-bridge";
import { common } from "@/strings/common";

interface Props {
  state: "loading" | "restarting" | "failed";
}

export function SidecarFailed({ state }: Props) {
  const failed = state === "failed";

  return (
    <div className="min-h-screen flex items-center justify-center p-6 bg-background">
      <div className="max-w-md w-full text-center space-y-6">
        {failed ? (
          <AlertCircle className="mx-auto h-14 w-14 text-destructive" />
        ) : (
          <Loader2 className="mx-auto h-14 w-14 text-primary animate-spin" />
        )}

        <div className="space-y-2">
          <h1 className="text-2xl font-semibold">
            {failed ? common.errorTitle : common.sidecarFailed.title}
          </h1>
          <p className="text-muted-foreground">
            {failed ? common.sidecarFailed.body : "Conectando con el motor local…"}
          </p>
        </div>

        {failed && (
          <div className="flex flex-col gap-2">
            <Button onClick={() => window.location.reload()}>{common.retry}</Button>
            <Button variant="outline" onClick={() => quitApp()}>
              {common.sidecarFailed.quit}
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
