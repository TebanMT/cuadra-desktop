import { TintaWordmark } from "@/components/shared/Logo";

export function LoginLogo({ showTagline = true }: { showTagline?: boolean }) {
  return <div className="flex flex-col items-center gap-3">
    <TintaWordmark className="w-40" />
    {showTagline && <p className="text-sm text-muted-foreground">Recepción de tu gimnasio</p>}
  </div>;
}
