/**
 * LoginLogo — variante editorial del wordmark Tinta con esquinas tipo
 * crop marks. Usada en pantallas de auth (login, forgot password, reset)
 * donde la marca es protagonista, no acento de UI.
 *
 * Identidad: "Tinta" en Fraunces semibold + un punto brick (#D6593C) que
 * reemplaza el punto natural de la "i". El dot brick es la firma visual.
 *
 * Las esquinas crop-mark son SVG inline y usan brick-500 (light) /
 * brick-300 (dark) — la familia brick es color de marca absoluto, no
 * relativo al tema. El wordmark + tagline usan tokens semantic
 * (text-foreground / text-muted-foreground) que auto-flippean en dark.
 */

interface LoginLogoProps {
  /** Mostrar el tagline debajo del wordmark. Default true. */
  showTagline?: boolean;
}

export function LoginLogo({ showTagline = true }: LoginLogoProps) {
  return (
    <div
      className="flex flex-col items-center"
      aria-label="Tinta — sistema operativo de tu gimnasio"
    >
      <div className="relative px-12 py-6">
        {/* Esquinas tipo crop marks — terracota saturado en light,
            brick-300 en dark (mejor contraste sobre fondo navy oscuro
            sin perder identidad de marca). */}
        <svg
          className="absolute inset-0 w-full h-full pointer-events-none"
          viewBox="0 0 380 140"
          preserveAspectRatio="none"
          aria-hidden="true"
        >
          <g
            className="stroke-brick-500 dark:stroke-brick-300"
            strokeWidth="2"
            strokeLinecap="round"
            fill="none"
            vectorEffect="non-scaling-stroke"
          >
            <path d="M 12 12 L 24 12 M 12 12 L 12 24" />
            <path d="M 368 12 L 356 12 M 368 12 L 368 24" />
            <path d="M 12 128 L 24 128 M 12 128 L 12 116" />
            <path d="M 368 128 L 356 128 M 368 128 L 368 116" />
          </g>
        </svg>

        {/* Wordmark Tinta — semantic tokens auto-flip en dark. El brick
            dot es absoluto y usa em-relative positioning para escalar
            con el font-size sin recalcular. flex justify-center para
            centrar la unidad T+dot+inta horizontalmente dentro del box. */}
        <div className="relative">
          <div
            className="font-display font-semibold leading-none tracking-tight text-foreground flex items-baseline justify-center"
            style={{ fontSize: "48px", letterSpacing: "-0.04em" }}
          >
            T
            <span className="relative inline-block">
              <span
                aria-hidden="true"
                className="absolute bg-brick-500 rounded-full pointer-events-none"
                style={{
                  width: "0.18em",
                  height: "0.18em",
                  top: "-0.05em",
                  left: "0.10em",
                }}
              />
              inta
            </span>
          </div>
          {showTagline && (
            <div
              className="text-center mt-3 text-[11px] font-medium uppercase text-muted-foreground"
              style={{ letterSpacing: "0.25em" }}
            >
              Sistema operativo de tu gimnasio
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
