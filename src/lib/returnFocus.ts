import { useRef } from "react";

// Radix devuelve el foco al Trigger del diálogo; los diálogos que se abren
// por estado (atajos, botones sin Trigger, menús) lo dejaban en <body> y los
// atajos de página seguían activos. Guardamos el elemento enfocado al abrir y
// lo restauramos al cerrar si todavía existe y puede recibir foco.

type FocusEventHandler = (event: Event) => void;

export function useReturnFocus(onOpenAutoFocus?: FocusEventHandler, onCloseAutoFocus?: FocusEventHandler) {
  const origin = useRef<HTMLElement | null>(null);
  return {
    onOpenAutoFocus(event: Event) {
      const active = document.activeElement;
      origin.current = active instanceof HTMLElement && active !== document.body ? active : null;
      onOpenAutoFocus?.(event);
    },
    onCloseAutoFocus(event: Event) {
      onCloseAutoFocus?.(event);
      if (event.defaultPrevented) return;
      const el = origin.current;
      origin.current = null;
      if (!el || !el.isConnected || (el as HTMLButtonElement).disabled) return;
      event.preventDefault();
      el.focus({ preventScroll: true });
    },
  };
}
