import { isDev } from "@/lib/runtime";

// Banner ámbar fijo al tope del DOM que sólo aparece cuando
// VITE_TINTA_MODE=dev. Sirve para que nunca olvides que los gates Plus
// están desactivados localmente. Ámbar (no rojo) para no confundir con
// los banners de billing en estado destructivo (past_due / cancelled).
export function DevModeBanner() {
  if (!isDev) return null;
  return (
    <div className="bg-amber-500/10 text-amber-900 py-1.5 px-4 text-xs font-medium border-b border-amber-500/30 text-center">
      MODO DEV — gates Plus deshabilitados, todo es visible.
    </div>
  );
}
