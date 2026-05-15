import { useEffect, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Package, Search, Users } from "lucide-react";
import { useMemberSearch } from "@/hooks/useSales";
import { useActiveProducts, type Product } from "@/hooks/useProducts";
import { useDebounce } from "@/hooks/useDebounce";
import { fmtMoney } from "@/hooks/useBilling";
import { cn } from "@/lib/utils";

// Búsqueda global del header. Muestra dropdown live con dos grupos
// (socios + productos) cuando el operador empieza a teclear. Click o
// Enter sobre un ítem navega:
//   - socio → /members/:id  (página de detalle existente)
//   - producto → /products  (no hay detail page; el operador edita
//     desde el listado — click en la fila abre el form)
// Si la sugerencia no contiene lo que buscaba, Enter sin selección
// activa cae a /members?q=... como antes.

interface MemberHit {
  kind: "member";
  id: string;
  name: string;
  phone: string;
}
interface ProductHit {
  kind: "product";
  id: string;
  name: string;
  price: number;
  stock: number;
}
type Hit = MemberHit | ProductHit;

// normalize — quita acentos y baja a lowercase. Para que "mineral"
// pegue con "Agua mineral" y "ciel" con "Ciél". Mismo helper que en
// QuickSalePage; lo duplicamos local para no introducir un módulo
// nuevo solo por 4 líneas.
function normalize(s: string): string {
  return s
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "")
    .toLowerCase()
    .trim();
}

const MAX_PER_GROUP = 5;

export function GlobalSearch() {
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
        name: m.full_name,
        phone: m.phone,
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

  const showDropdown =
    open && debounced.trim().length >= 2;
  const isLoading = memberSearch.isFetching;
  const hasResults = allHits.length > 0;

  function selectHit(h: Hit) {
    if (h.kind === "member") {
      navigate(`/members/${h.id}`);
    } else {
      navigate(`/products`);
    }
    setQuery("");
    setOpen(false);
    inputRef.current?.blur();
  }

  function onKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      setOpen(false);
      inputRef.current?.blur();
      return;
    }
    if (!showDropdown) {
      if (e.key === "Enter") {
        const q = query.trim();
        if (q) {
          e.preventDefault();
          navigate(`/members?q=${encodeURIComponent(q)}`);
          setOpen(false);
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
        if (q) navigate(`/members?q=${encodeURIComponent(q)}`);
        setOpen(false);
      }
    }
  }

  return (
    <div
      ref={containerRef}
      className="relative hidden md:block w-72 lg:w-80"
    >
      <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
      <input
        ref={inputRef}
        id="global-search"
        type="search"
        placeholder="Buscar socio, producto…"
        value={query}
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onKeyDown={onKeyDown}
        autoComplete="off"
        role="combobox"
        aria-expanded={showDropdown}
        aria-controls="global-search-listbox"
        aria-autocomplete="list"
        className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-14 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition-shadow"
      />
      <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
        ⌘K
      </kbd>

      {showDropdown && (
        <div
          id="global-search-listbox"
          role="listbox"
          className="absolute top-full left-0 right-0 mt-1 rounded-md border border-border bg-popover shadow-md z-50 max-h-[420px] overflow-y-auto"
        >
          {!hasResults && isLoading && (
            <div className="px-3 py-6 text-sm text-center text-muted-foreground">
              Buscando…
            </div>
          )}
          {!hasResults && !isLoading && (
            <div className="px-3 py-6 text-sm text-center text-muted-foreground">
              Sin resultados para "{debounced}"
            </div>
          )}

          {memberMatches.length > 0 && (
            <div className="p-1">
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                Socios
              </div>
              {memberMatches.map((h, idx) => {
                const flatIdx = idx;
                return (
                  <ResultRow
                    key={h.id}
                    icon={<Users className="h-4 w-4 text-muted-foreground" />}
                    title={h.name}
                    subtitle={h.phone || "Sin teléfono"}
                    selected={flatIdx === highlight}
                    onMouseEnter={() => setHighlight(flatIdx)}
                    onClick={() => selectHit(h)}
                  />
                );
              })}
            </div>
          )}

          {productMatches.length > 0 && (
            <div className={cn("p-1", memberMatches.length > 0 && "border-t border-border")}>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide font-semibold text-muted-foreground">
                Productos
              </div>
              {productMatches.map((h, idx) => {
                const flatIdx = memberMatches.length + idx;
                const subtitle =
                  h.stock <= 0
                    ? `${fmtMoney(h.price)} · sin stock`
                    : `${fmtMoney(h.price)} · ${h.stock} en stock`;
                return (
                  <ResultRow
                    key={h.id}
                    icon={<Package className="h-4 w-4 text-muted-foreground" />}
                    title={h.name}
                    subtitle={subtitle}
                    selected={flatIdx === highlight}
                    onMouseEnter={() => setHighlight(flatIdx)}
                    onClick={() => selectHit(h)}
                  />
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
  icon,
  title,
  subtitle,
  selected,
  onMouseEnter,
  onClick,
}: {
  icon: React.ReactNode;
  title: string;
  subtitle: string;
  selected: boolean;
  onMouseEnter(): void;
  onClick(): void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onMouseEnter={onMouseEnter}
      // mousedown en vez de click — el click-outside listener usa
      // mousedown para cerrar el popover. Si selectHit corre en click,
      // el listener cierra primero y el click llega a un elemento ya
      // unmounted. mousedown garantiza orden correcto.
      onMouseDown={(e) => {
        e.preventDefault();
        onClick();
      }}
      className={cn(
        "w-full flex items-center gap-3 px-2 py-2 rounded-sm text-left text-sm",
        selected ? "bg-accent text-accent-foreground" : "hover:bg-muted/60"
      )}
    >
      <span className="shrink-0">{icon}</span>
      <div className="min-w-0 flex-1">
        <div className="font-medium text-foreground truncate">{title}</div>
        <div className="text-xs text-muted-foreground truncate tabular-nums">
          {subtitle}
        </div>
      </div>
    </button>
  );
}
