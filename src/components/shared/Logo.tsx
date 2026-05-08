import { Link } from "react-router-dom";

/**
 * Marca Tinta — sistema modular reusable.
 *
 *   <LogoIcon size={36} />          → solo el ícono cuadrado (header colapsado)
 *   <Logo iconSize={36} />          → ícono + wordmark (header normal)
 *   <Logo as="plain" />             → no envuelve en <Link>, útil para auth shells
 *
 * Identidad de marca: la "T" de Tinta + un punto brick #D6593C que reemplaza
 * el punto natural de la "i". Es la firma visual — siempre que se renderiza
 * el wordmark, el dot brick es lo que ancla el reconocimiento.
 *
 * El SVG se inlinea y usa `currentColor` para el text fill — eso permite
 * que el wordmark se adapte a `text-foreground` y auto-flippee en dark mode
 * sin tener que mantener dos archivos de logo.
 *
 * Para favicon / og-image / kiosko / receipts, usa los SVG estáticos de
 * /public (favicon.svg, logo-stacked.svg, etc.) — esos viven fuera del
 * React tree con colores fijos.
 */
export function LogoIcon({ size = 40 }: { size?: number }) {
  return (
    <span
      className="relative inline-flex items-center justify-center rounded-xl bg-ink-900 shrink-0"
      style={{ width: size, height: size }}
      aria-hidden="true"
    >
      <svg
        viewBox="0 0 64 64"
        className="absolute inset-0 w-full h-full"
      >
        {/* T blanca centrada — Fraunces semibold renderizada como <text>
            asume que la fuente está cargada en la página (lo está, vía
            font-family Fraunces en index.html / globals.css). */}
        <text
          x="22"
          y="48"
          fontFamily="Fraunces, Georgia, serif"
          fontWeight="600"
          fontSize="44"
          fill="#FDFBF6"
          letterSpacing="-1.2"
        >
          T
        </text>
        {/* Brick dot — la firma. Reemplaza el punto natural de la "i"
            que existiría si fuera "Tinta" completo, pero acá viaja sola
            como insignia de marca. */}
        <circle cx="44" cy="22" r="5" fill="#D6593C" />
      </svg>
    </span>
  );
}

interface LogoProps {
  /** Tamaño del ícono cuadrado en px. Default 40. */
  iconSize?: number;
  /** Clase Tailwind para el wordmark. Default text-2xl. */
  textSize?: string;
  /** Cuando true, omite el wordmark y solo muestra el icono. */
  iconOnly?: boolean;
  /** "link" envuelve en <Link to="/">; "plain" devuelve <span>. */
  as?: "link" | "plain";
  /** Clases adicionales sobre el contenedor. */
  className?: string;
}

/**
 * Wordmark "Tinta" inline — usa Fraunces real cargada en la página.
 * El brick dot va absoluto sobre el lugar donde naturalmente caería el
 * punto de la "i". Se calcula relativo al em-size para escalar limpio.
 */
function TintaWordmark({ textSize }: { textSize: string }) {
  return (
    <span
      className={`font-display ${textSize} font-semibold text-foreground tracking-tight inline-flex items-baseline relative leading-none`}
      style={{ letterSpacing: "-0.04em" }}
    >
      T
      <span className="relative inline-block">
        {/* Brick dot — posicionado sobre el punto natural de la "i".
            Las medidas en em escalan con el textSize del padre. */}
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
    </span>
  );
}

export function Logo({
  iconSize = 40,
  textSize = "text-2xl",
  iconOnly = false,
  as = "link",
  className = "",
}: LogoProps) {
  const content = (
    <>
      <LogoIcon size={iconSize} />
      {!iconOnly && <TintaWordmark textSize={textSize} />}
    </>
  );

  if (as === "plain") {
    return (
      <span className={`flex items-center gap-3 ${className}`.trim()}>
        {content}
      </span>
    );
  }
  return (
    <Link to="/" className={`flex items-center gap-3 group ${className}`.trim()}>
      {content}
    </Link>
  );
}
