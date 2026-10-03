import { isDev } from "@/lib/runtime";

// Banner ámbar fijo al tope del DOM que sólo aparece cuando
// VITE_TINTA_MODE=dev. Sirve para que nunca olvides que los gates Plus
// están desactivados localmente. Ámbar (no rojo) para no confundir con
// los banners de billing en estado destructivo (past_due / cancelled).
export function DevModeBanner() {
  if (!isDev) return null;
  return (
    <div className="border-b border-warning/40 bg-warning-soft px-4 py-1.5 text-center text-xs font-medium text-warning-foreground">
      MODO DEV — gates Plus deshabilitados, todo es visible.
    </div>
  );
}
