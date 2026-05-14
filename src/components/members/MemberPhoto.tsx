import { useEffect, useState } from "react";
import { AvatarImage } from "@/components/ui/avatar";
import { getSidecarUrl } from "@/lib/tauri-bridge";

// useMemberPhotoSrc resuelve la URL del cache local del sidecar para
// la foto de un socio. Apunta a la ruta `/api/v1/uploads/local/members/:id`
// del sidecar local — el FE NUNCA abre socket directo a R2. Si el
// archivo no existe en cache, el sidecar responde 404 y el navegador
// invoca el onError del <img>, dejando que el AvatarFallback hermano
// (cuando se usa con Avatar) renderee las iniciales.
//
// La base URL del sidecar la resolvemos async vía Tauri command (mismo
// pattern que `src/lib/api.ts`). Mientras carga devolvemos undefined,
// que el caller interpreta como "no muestres imagen aún".
export function useMemberPhotoSrc(memberId: string | undefined): string | undefined {
  const [base, setBase] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    getSidecarUrl().then((u) => {
      if (!cancelled) setBase(u.replace(/\/$/, ""));
    });
    return () => {
      cancelled = true;
    };
  }, []);
  if (!memberId || !base) return undefined;
  return `${base}/api/v1/uploads/local/members/${memberId}`;
}

// MemberPhoto — drop-in replacement de <AvatarImage src={photo_url}>.
// Pega el src a la ruta local-serve del sidecar. El AvatarFallback
// hermano (palette + iniciales) cubre el caso de no-foto y el de
// foto-aún-no-cacheada (download task del agent la traerá en el
// próximo tick de sync).
//
// Convención: si memberId es undefined, no renderea nada (caller
// suele tener guard previo, pero defensivo).
export function MemberPhoto({ memberId }: { memberId: string | undefined }) {
  const src = useMemberPhotoSrc(memberId);
  if (!src) return null;
  return <AvatarImage src={src} alt="" />;
}
