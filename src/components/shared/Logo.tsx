import { Link } from "react-router-dom";

/** Recursos oficiales: nunca reconstruir el logo con tipografía. */
export function LogoIcon({ size = 40 }: { size?: number }) {
  return <img src="/brand/tinta-app-icon.svg" alt="" width={size} height={size} className="shrink-0" />;
}

/** Símbolo (la T) sin campo. "white" para superficies de tinta. */
export function LogoSymbol({ size = 32, tone = "auto" }: { size?: number; tone?: "auto" | "white" }) {
  if (tone === "white") return <img src="/brand/tinta-symbol-white.svg" alt="" width={size} height={size} className="shrink-0" />;
  return <span className="inline-block shrink-0" style={{ width: size, height: size }}>
    <img src="/brand/tinta-symbol-ink.svg" alt="" width={size} height={size} className="dark:hidden" />
    <img src="/brand/tinta-symbol-white.svg" alt="" width={size} height={size} className="hidden dark:block" />
  </span>;
}

export function TintaWordmark({ className = "w-28", tone = "auto" }: { className?: string; tone?: "auto" | "white" }) {
  if (tone === "white") return <span className={`inline-block shrink-0 ${className}`}>
    <img src="/brand/tinta-wordmark-white.svg" alt="Tinta" width="410" height="128" className="h-auto w-full" />
  </span>;
  return <span className={`inline-block shrink-0 ${className}`}>
    <img src="/brand/tinta-wordmark-ink.svg" alt="Tinta" width="410" height="128" className="h-auto w-full dark:hidden" />
    <img src="/brand/tinta-wordmark-white.svg" alt="Tinta" width="410" height="128" className="hidden h-auto w-full dark:block" />
  </span>;
}

interface LogoProps {
  iconSize?: number;
  textSize?: string;
  iconOnly?: boolean;
  as?: "link" | "plain";
  className?: string;
}
export function Logo({ iconSize = 40, iconOnly = false, as = "link", className = "" }: LogoProps) {
  const content = iconOnly ? <LogoIcon size={iconSize} /> : <TintaWordmark />;
  return as === "plain"
    ? <span className={`inline-flex items-center ${className}`}>{content}</span>
    : <Link to="/" aria-label="Tinta, inicio" className={`inline-flex items-center ${className}`}>{content}</Link>;
}
