import { useEffect, useRef } from "react";

type HandlerMap = Record<string, (e: KeyboardEvent) => void>;

const isEditable = (el: EventTarget | null): boolean => {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || el.isContentEditable;
};

// useHotkeys registra UN solo listener al montar y lo mantiene mientras
// el componente vive. El `map` se lee desde un ref que se actualiza en
// cada render — así un consumer que arma handlers con useMemo dentro de
// un componente que re-renderea seguido (p.ej. por useMutation) no
// pierde keydowns en el gap entre cleanup y re-attach del effect.
//
// El listener se ignora si:
//   - `enabled` es false (modal abierto).
//   - el evento trae modificadores (Ctrl/Cmd/Alt/Meta) — esos chords
//     pertenecen a otros listeners (sidebar Ctrl+K, kiosko Ctrl+Alt+K,
//     navegador Cmd+P/R/W). El consumer de useHotkeys solo se enfoca
//     en single-key shortcuts del tipo "P → cobrar".
//   - el foco está en input/textarea/select/contentEditable y la tecla
//     no es Escape (Esc sí debe poder cerrar aunque el input tenga foco).
export function useHotkeys(map: HandlerMap, enabled = true) {
  const mapRef = useRef(map);
  const enabledRef = useRef(enabled);

  useEffect(() => {
    mapRef.current = map;
  }, [map]);
  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (!enabledRef.current) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const key = e.key.length === 1 ? e.key.toLowerCase() : e.key;
      const handler = mapRef.current[key];
      if (!handler) return;
      if (key !== "Escape" && isEditable(e.target)) return;
      // preventDefault ANTES de ejecutar: los atajos navegan/abren
      // superficies con un input autofocuseado (venta rápida, nuevo
      // socio, modal de cobro) y sin esto el default del keydown
      // insertaba la letra del atajo en ese input recién enfocado
      // ("v" aparecía escrito en la búsqueda de productos).
      e.preventDefault();
      handler(e);
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);
}
