import { useEffect, useState } from "react";
import { getSidecarUrl } from "@/lib/tauri-bridge";

// useProductPhotoSrc resuelve la URL del cache local del sidecar para
// la foto de un producto. Apunta a la ruta
// `/api/v1/uploads/local/products/:id` del sidecar local — el FE
// NUNCA abre socket directo a R2. Si el archivo no existe en cache,
// el sidecar responde 404 y el caller debe manejar onError del <img>.
//
// La base URL del sidecar la resolvemos async vía Tauri command (mismo
// pattern que `useMemberPhotoSrc` y `src/lib/api.ts`). Mientras carga
// devolvemos undefined, que el caller interpreta como "no muestres
// imagen aún".
export function useProductPhotoSrc(productId: string | undefined): string | undefined {
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
  if (!productId || !base) return undefined;
  return `${base}/api/v1/uploads/local/products/${productId}`;
}

// ProductPhoto — branch entre tres casos visibles para el operador:
//
//   1. imageUrl es una data URL (FE acaba de elegir/capturar foto;
//      sync agent aún no la subió). Render inline desde los bytes en
//      memoria — el operador ve la foto SIN esperar al sync. Esta es
//      la ventana entre "elegí foto" y "agent corrió tick".
//
//   2. imageUrl es un object_key R2 (sync ya subió y reemplazó la
//      columna) o una URL legacy. Pega a la ruta local-serve del
//      sidecar que sirve el archivo desde UploadsDir/products/<id>.<ext>.
//      Si el archivo aún no está en disco (race: cloud row pulleado
//      antes que el download task del agent baje los bytes), el 404
//      cae al placeholder hermano.
//
//   3. Sin imageUrl: null → placeholder hermano renderea.
//
// Reset del failed state al cambiar imageUrl: sin esto, el componente
// quedaba "permanently failed" tras el primer 404, así que si el
// archivo aparecía en disco después (sync agent), nunca lo intentaba
// recargar. Cambiar la key/value del imageUrl re-arma el componente.
export function ProductPhoto({
  productId,
  imageUrl,
  className,
  alt = "",
}: {
  productId: string | undefined;
  imageUrl?: string | null;
  className?: string;
  alt?: string;
}) {
  const localSrc = useProductPhotoSrc(productId);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    setFailed(false);
  }, [productId, imageUrl, localSrc]);

  if (!imageUrl) return null;
  // Caso 1: data URL → render inline desde memoria.
  if (imageUrl.startsWith("data:")) {
    return <img src={imageUrl} alt={alt} className={className} />;
  }
  // Caso 2: object_key / URL legacy → sidecar local-serve.
  if (!localSrc || failed) return null;
  return (
    <img src={localSrc} alt={alt} className={className} onError={() => setFailed(true)} />
  );
}
