import { useEffect, useRef, useState } from "react";
import { Loader2, Search, UserCheck, UserPlus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useMemberSearch, type MemberSearchResult } from "@/hooks/useSales";
import { useDebounce } from "@/hooks/useDebounce";
import { sales as t } from "@/strings/sales";

// Asociador de socio del modal de cobro. Antes era un Popover flotante:
// colgaba fuera del marco del modal (desalineado) y su portal disparaba
// el dismiss del Dialog. Ahora es un combobox INLINE — al expandir, el
// input y la lista de resultados viven dentro del flujo del modal, al
// ancho completo, con el mismo lenguaje que la búsqueda de productos
// (input arriba, resultados abajo, Enter agrega el primero).
export function MemberAssociator({
  member,
  onChange,
}: {
  member: MemberSearchResult | null;
  onChange(m: MemberSearchResult | null): void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const search = useMemberSearch(debounced);
  const inputRef = useRef<HTMLInputElement | null>(null);

  // Al expandir: foco directo al input (el operador ya decidió buscar).
  useEffect(() => {
    if (expanded) inputRef.current?.focus();
  }, [expanded]);

  function select(m: MemberSearchResult) {
    onChange(m);
    setExpanded(false);
    setQuery("");
  }

  function collapse() {
    setExpanded(false);
    setQuery("");
  }

  if (member) {
    return (
      <div className="inline-flex items-center gap-2 rounded-md border bg-muted px-3 py-1.5 text-sm">
        <UserCheck className="h-4 w-4 text-success" />
        <span className="font-medium">{member.full_name}</span>
        <button
          type="button"
          onClick={() => onChange(null)}
          className="text-xs text-muted-foreground hover:text-foreground ml-1"
        >
          {t.page.removeAssociation}
        </button>
      </div>
    );
  }

  if (!expanded) {
    return (
      <Button variant="outline" size="sm" onClick={() => setExpanded(true)}>
        <UserPlus className="h-4 w-4" />
        {t.page.associate}
      </Button>
    );
  }

  const results = search.data ?? [];

  return (
    // basis-full: dentro del summary (flex-wrap) el combobox expandido
    // rompe a su propia línea al ancho completo del modal — nada cuelga
    // fuera del marco.
    <div className="basis-full w-full space-y-1.5">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
        <Input
          ref={inputRef}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t.page.associateSearchPlaceholder}
          className="pl-9 pr-9 h-10"
          onKeyDown={(e) => {
            // Esc colapsa la búsqueda SIN cerrar el modal de cobro.
            if (e.key === "Escape") {
              e.preventDefault();
              e.stopPropagation();
              collapse();
            }
            // Enter asocia el primer resultado — espejo del grid de
            // productos ("tecleo + Enter" sin mouse).
            if (e.key === "Enter" && results.length > 0) {
              e.preventDefault();
              select(results[0]);
            }
          }}
        />
        <button
          type="button"
          onClick={collapse}
          className="absolute right-2 top-1/2 -translate-y-1/2 inline-flex items-center justify-center h-6 w-6 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          aria-label={t.page.associateCancel}
          title={t.page.associateCancel}
        >
          <X className="h-4 w-4" />
        </button>
      </div>

      {(search.isFetching || debounced.length >= 2) && (
        <div className="rounded-md border border-border bg-background max-h-44 overflow-y-auto">
          {search.isFetching && (
            <div className="px-3 py-2.5 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t.page.associateSearching}</span>
            </div>
          )}
          {!search.isFetching && results.length === 0 && (
            <p className="px-3 py-2.5 text-sm text-muted-foreground">
              {t.page.associateNoResults}
            </p>
          )}
          {results.map((m, i) => (
            <button
              key={m.member_id}
              type="button"
              onClick={() => select(m)}
              className={
                "w-full text-left px-3 py-2 hover:bg-muted text-sm" +
                // El primero es el que Enter asocia — se resalta igual
                // que el primer match del grid de productos.
                (i === 0 ? " bg-muted/60" : "")
              }
            >
              <div className="font-medium">{m.full_name}</div>
              <div className="text-xs text-muted-foreground">{m.phone}</div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
