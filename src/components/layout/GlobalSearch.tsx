import { normalizeSearchText as normalize } from "@/lib/search";
import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Search } from "lucide-react";
import { useMemberSearch, type MemberSearchResult } from "@/hooks/useSales";
import { useActiveProducts, type Product } from "@/hooks/useProducts";
import { useDebounce } from "@/hooks/useDebounce";
import { fmtMoney } from "@/hooks/useBilling";
import { MemberHitSummary } from "@/components/checkin/MemberSearchInput";
import { cn } from "@/lib/utils";

// Búsqueda global del header. Muestra dropdown live con dos grupos
// (socios + productos) cuando el operador empieza a teclear. Click o
// Enter sobre un ítem navega:
//   - socio → /members/:id  (página de detalle existente)
//   - producto → /products?q=<nombre>  (no hay detail page; el listado
//     llega ya filtrado al producto elegido)
// Si la sugerencia no contiene lo que buscaba, Enter sin selección
// activa cae a /members?q=... como antes.
//
// Cada socio responde «¿está vigente?» sin abrir la ficha: foto o
// iniciales, número de socio para distinguir homónimos y la misma
// insignia de vigencia que la lista, la ficha, el cobro y entradas.

interface MemberHit {
  kind: "member";
  id: string;
  member: MemberSearchResult;
}
interface ProductHit {
  kind: "product";
  id: string;
  name: string;
  price: number;
  stock: number;
}
type Hit = MemberHit | ProductHit;

const MAX_PER_GROUP = 5;

interface GlobalSearchProps {
  className?: string;
  prominent?: boolean;
  inFlow?: boolean;
  autoFocus?: boolean;
  id?: string;
  onSelect?(): void;
}

export function GlobalSearch({ className, prominent, inFlow, autoFocus, id = "global-search", onSelect }: GlobalSearchProps) {
  const navigate = useNavigate();
  const [query, setQuery] = useState("");
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const debounced = useDebounce(query, 200);
  const memberSearch = useMemberSearch(debounced);
  const products = useActiveProducts();

  const productMatches = useMemo<ProductHit[]>(() => {
    const term = normalize(debounced);
    if (term.length < 2) return [];
    return (products.data ?? [])
      .filter((p: Product) => normalize(p.name).includes(term))
      .slice(0, MAX_PER_GROUP)
      .map((p) => ({
        kind: "product" as const,
        id: p.id,
        name: p.name,
        price: p.price,
        stock: p.stock,
      }));
  }, [products.data, debounced]);

  const memberMatches = useMemo<MemberHit[]>(
    () =>
      (memberSearch.data ?? []).slice(0, MAX_PER_GROUP).map((m) => ({
        kind: "member" as const,
        id: m.member_id,
        member: m,
      })),
    [memberSearch.data]
  );

  // Lista plana ordenada — primero socios, después productos. La
  // ordenación importa porque highlight (índice) recorre la lista lineal.
  const allHits: Hit[] = useMemo(
    () => [...memberMatches, ...productMatches],
    [memberMatches, productMatches]
  );

  // Reset highlight cuando cambian los resultados (e.g. user teclea más).
  useEffect(() => {
    setHighlight(0);
  }, [debounced]);

  useEffect(() => {
    containerRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [highlight]);

  // Click-outside cierra el dropdown. Lo hago con mousedown para que
  // termine antes del blur del input (evita parpadeo y permite que el
  // click en un ítem ejecute su onClick antes de cerrar).
  useEffect(() => {
    function onPointer(e: MouseEvent) {
      if (
        containerRef.current &&
        !containerRef.current.contains(e.target as Node)
      ) {
        setOpen(false);
      }
    }
    if (open) {
      window.addEventListener("mousedown", onPointer);
      return () => window.removeEventListener("mousedown", onPointer);
    }
  }, [open]);

  const canSuggest = debounced.trim().length >= 2;
  const showDropdown = open && canSuggest;
  const isLoading = memberSearch.isFetching || query !== debounced;
  const hasResults = allHits.length > 0;

  function selectHit(h: Hit) {
    if (h.kind === "member") {
      navigate(`/members/${h.id}`);
    } else {
      // Productos no tiene ficha: el catálogo llega filtrado al elegido
      // para no perder la selección entre cientos de filas.
      navigate(`/products?q=${encodeURIComponent(h.name)}`);
    }
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
    onSelect?.();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      // Primer Escape: cierra sugerencias y deja el foco en el campo para
      // que la flecha abajo las vuelva a abrir. Dentro del diálogo, el
      // siguiente Escape lo cierra (ver DialogContent).
      if (showDropdown) {
        setOpen(false);
        return;
      }
      inputRef.current?.blur();
      return;
    }
    if (!showDropdown) {
      if ((e.key === "ArrowDown" || e.key === "ArrowUp") && canSuggest) {
        e.preventDefault();
        setOpen(true);
        return;
      }
      if (e.key === "Enter") {
        const q = query.trim();
        if (q) {
          e.preventDefault();
          navigate(`/members?q=${encodeURIComponent(q)}`);
          setOpen(false);
          onSelect?.();
        }
      }
      return;
    }
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setHighlight((i) => (allHits.length === 0 ? 0 : (i + 1) % allHits.length));
      return;
    }
    if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((i) =>
        allHits.length === 0 ? 0 : (i - 1 + allHits.length) % allHits.length
      );
      return;
    }
    if (e.key === "Enter") {
      e.preventDefault();
      const sel = allHits[highlight];
      if (sel) {
        selectHit(sel);
      } else {
        // Sin sugerencia activa pero el operador puso texto — caer al
        // listado de socios con filtro. Comportamiento "viejo" pero
        // ahora rara vez se llega aquí gracias al dropdown.
        const q = query.trim();
        if (q) { navigate(`/members?q=${encodeURIComponent(q)}`); onSelect?.(); }
        setOpen(false);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      onBlur={event => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false); }}
      className={cn("relative", className ?? "hidden md:block w-52 xl:w-72")}
    >
      <div className="relative">
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        id={id}
        autoFocus={autoFocus}
        type="search"
        placeholder={prominent ? "Buscar socio o producto…" : "Buscar…"}
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        aria-label="Buscar socio o producto"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls={showDropdown ? `${id}-listbox` : undefined}
        aria-activedescendant={showDropdown && allHits[highlight] ? `${id}-option-${highlight}` : undefined}
        aria-autocomplete="list"
        className={cn("w-full rounded-md border border-input bg-background pl-9 pr-16 placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition-shadow", prominent ? "h-14 text-base" : "h-11 text-sm")}
      />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-6 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 text-xs font-medium text-muted-foreground">
        {navigator.platform.toLowerCase().includes("mac") ? "⌘K" : "Ctrl K"}
      </kbd>
      </div>

      {showDropdown && (
        <div
          id={`${id}-listbox`}
          role="listbox"
          aria-label="Resultados de la búsqueda"
          className={cn("mt-2 rounded-md border border-border bg-popover z-50 max-h-80 overflow-y-auto", !inFlow && "absolute top-full left-0 right-0")}
        >
          {!hasResults && isLoading && (
            <div className="px-3 py-6 text-sm text-center text-muted-foreground">
              Buscando…
            </div>
          )}
          {!hasResults && !isLoading && !memberSearch.isError && (
            <div className="px-3 py-6 text-sm text-center text-muted-foreground">
              Sin resultados para «{debounced}»
            </div>
          )}

          {memberSearch.isError && <div role="alert" className="p-3 text-sm">
            <p>No pudimos buscar socios.</p>
            <button type="button" className="min-h-11 text-primary underline" onMouseDown={event => event.preventDefault()} onClick={() => void memberSearch.refetch()}>Reintentar búsqueda</button>
          </div>}
          {memberMatches.length > 0 && (
            <div role="group" aria-labelledby={`${id}-group-members`} className="p-1">
              <div id={`${id}-group-members`} className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
                Socios
              </div>
              {memberMatches.map((h, idx) => {
                const flatIdx = idx;
                return (
                  <ResultRow
                    key={h.id}
                    id={`${id}-option-${flatIdx}`}
                    selected={flatIdx === highlight}
                    onMouseEnter={() => setHighlight(flatIdx)}
                    onClick={() => selectHit(h)}
                  >
                    <MemberHitSummary member={h.member} />
                  </ResultRow>
                );
              })}
            </div>
          )}

          {productMatches.length > 0 && (
            <div role="group" aria-labelledby={`${id}-group-products`} className={cn("p-1", memberMatches.length > 0 && "border-t border-border")}>
              <div id={`${id}-group-products`} className="px-2 pb-1 pt-1.5 text-xs font-medium text-muted-foreground">
                Productos
              </div>
              {productMatches.map((h, idx) => {
                const flatIdx = memberMatches.length + idx;
                return (
                  <ResultRow
                    key={h.id}
                    id={`${id}-option-${flatIdx}`}
                    selected={flatIdx === highlight}
                    onMouseEnter={() => setHighlight(flatIdx)}
                    onClick={() => selectHit(h)}
                  >
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border text-muted-foreground" aria-hidden="true">
                      <Package className="h-4 w-4" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{h.name}</span>
                      <span className="block truncate text-xs text-muted-foreground tabular">
                        {h.stock <= 0 ? "Sin existencias" : `${h.stock} ${h.stock === 1 ? "disponible" : "disponibles"}`}
                      </span>
                    </span>
                    <span className="shrink-0 text-sm font-medium tabular text-foreground">{fmtMoney(h.price)}</span>
                  </ResultRow>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ResultRow({
  id,
  selected,
  onMouseEnter,
  onClick,
  children,
}: {
  id: string;
  selected: boolean;
  onMouseEnter(): void;
  onClick(): void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      id={id}
      role="option"
      aria-selected={selected}
      onMouseEnter={onMouseEnter}
      onMouseDown={(event) => event.preventDefault()}
      onClick={onClick}
      className={cn(
        "min-h-12 w-full flex items-center gap-3 px-2 py-2 rounded-sm text-left text-sm",
        // Resaltado de teclado: superficie y anillo (≥3:1 contra el
        // popover) para no depender solo de un tinte casi invisible.
        selected ? "bg-accent text-accent-foreground ring-1 ring-inset ring-ring" : "hover:bg-muted/60"
      )}
    >
      {children}
    </button>
  );
}
