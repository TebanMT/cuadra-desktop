import { useState } from "react";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { getAvatarPalette, getInitials } from "@/lib/avatar";
import { MemberPhoto, useMemberPhotoSrc } from "./MemberPhoto";

interface Props {
  memberId: string;
  fullName: string;
  // Tamaño del avatar clickeable. La copia de tailwind ya viene aplicada
  // — pasamos h-X w-X. El font-size del fallback se infiere por className.
  avatarClassName?: string;
  fallbackClassName?: string;
  // En tablas con row-click, evita que el clic abra el detalle del socio
  // al mismo tiempo. Default false para callers donde no hay row-click.
  stopPropagation?: boolean;
  // false cuando el socio no tiene `photo_url`: no pedimos la foto al
  // sidecar (sería un 404 seguro) y el avatar queda como iniciales sin
  // botón, porque no hay nada que ver. undefined conserva el
  // comportamiento anterior para callers que no conocen el dato.
  hasPhoto?: boolean;
}

// MemberPhotoLightbox — avatar clickeable que abre la foto del socio en
// tamaño grande dentro de un Dialog.
//
// Motivación: en operación de gimnasio, el recepcionista a veces necesita
// "ir a buscar al socio en piso" (membresía vencida, llamada perdida,
// etc.) y los 64×64 del avatar no le dan suficiente cara. La lightbox
// resuelve esto sin meter una página separada — clic, ver, cerrar con
// Esc o click fuera.
//
// Sin foto registrada (`hasPhoto={false}`): sólo iniciales, sin botón ni
// «Ver foto de…». Con foto registrada que todavía no llega al caché local,
// el diálogo lo explica en vez de decir que no hay foto.
export function MemberPhotoLightbox({
  memberId,
  fullName,
  avatarClassName,
  fallbackClassName,
  stopPropagation,
  hasPhoto,
}: Props) {
  const [open, setOpen] = useState(false);
  const [photoFailed, setPhotoFailed] = useState(false);
  const src = useMemberPhotoSrc(hasPhoto === false ? undefined : memberId);
  const palette = getAvatarPalette(fullName);
  const initials = getInitials(fullName);

  if (hasPhoto === false) {
    // El nombre siempre acompaña al avatar: las iniciales son decorativas.
    return (
      <Avatar className={avatarClassName} aria-hidden>
        <AvatarFallback
          className={cn("font-semibold", fallbackClassName)}
          style={{ backgroundColor: palette.bg, color: palette.text }}
        >
          {initials}
        </AvatarFallback>
      </Avatar>
    );
  }

  function handleClick(e: React.MouseEvent) {
    if (stopPropagation) e.stopPropagation();
    setOpen(true);
  }

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        className="rounded-full transition-transform hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        aria-label={`Ver foto de ${fullName}`}
      >
        <Avatar className={avatarClassName}>
          <MemberPhoto memberId={memberId} />
          <AvatarFallback
            className={cn("font-semibold", fallbackClassName)}
            style={{ backgroundColor: palette.bg, color: palette.text }}
          >
            {initials}
          </AvatarFallback>
        </Avatar>
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <DialogTitle>{fullName}</DialogTitle>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3">
            {src && !photoFailed ? (
              <img
                src={src}
                alt={fullName}
                onError={() => setPhotoFailed(true)}
                className="max-h-[70vh] w-auto rounded-lg object-contain"
              />
            ) : (
              <>
                <div
                  className="flex h-56 w-56 items-center justify-center rounded-full text-7xl font-bold"
                  style={{ backgroundColor: palette.bg, color: palette.text }}
                >
                  {initials}
                </div>
                <p className="text-sm text-muted-foreground">
                  {hasPhoto ? "La foto todavía no se descarga en esta computadora. Aparecerá al sincronizar." : "Este socio no tiene foto."}
                </p>
              </>
            )}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
