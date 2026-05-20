import { type ReactNode } from "react";
import { LoginLogo } from "@/components/auth/LoginLogo";

// URL del landing. Se usa para mandar a `#como-funciona` desde los
// pantallazos de auth — explica offline-first, sidecar, sync, etc.
// Mismo patrón que VITE_DASHBOARD_URL en Welcome.tsx.
const LANDING_URL =
  (import.meta.env.VITE_LANDING_URL as string | undefined) ??
  "https://entinta.mx";

/**
 * Shell común de pantallas de auth — single-column centrado, brand
 * arriba (LoginLogo con esquinas crop marks + tagline), form en el
 * medio, footer editorial abajo.
 *
 * Surfaces vía semantic tokens (bg-background / text-muted-foreground)
 * — auto-flippean en dark mode sin tocar el componente. Si la página
 * tiene `<html class="dark">`, el tema entero responde solo.
 */
interface AuthShellProps {
  children: ReactNode;
  /** Ocultar el footer editorial. Default false. */
  hideFooter?: boolean;
  /** Ocultar el tagline del LoginLogo. Default false (tagline visible). */
  hideTagline?: boolean;
}

export function AuthShell({
  children,
  hideFooter = false,
  hideTagline = false,
}: AuthShellProps) {
  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center px-6 py-12">
      <div className="mb-10 sm:mb-12">
        <LoginLogo showTagline={!hideTagline} />
      </div>

      <main className="w-full max-w-sm">{children}</main>

      {/*
        Link al landing — explica por qué hay app de escritorio +
        dashboard web, offline-first y sync silencioso. target=_blank
        abre en el navegador del sistema (Tauri respeta la flag para
        URLs externas).
      */}
      <p className="mt-10 text-center text-xs">
        <a
          href={`${LANDING_URL}/#como-funciona`}
          target="_blank"
          rel="noreferrer"
          className="text-muted-foreground hover:text-foreground underline-offset-4 hover:underline transition-colors"
        >
          ¿Cómo funciona Tinta? Por qué hay dos apps →
        </a>
      </p>

      {!hideFooter && (
        <p className="mt-6 text-center text-xs text-muted-foreground max-w-xs leading-relaxed">
          Hecho para gyms de barrio que están operando como negocio.
        </p>
      )}
    </div>
  );
}
