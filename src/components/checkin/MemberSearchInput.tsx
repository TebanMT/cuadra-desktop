import { useEffect, useId, useRef, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { MemberPhoto } from "@/components/members/MemberPhoto";
import { VigenciaBadge } from "@/components/members/VigenciaBadge";
import { useDebounce } from "@/hooks/useDebounce";
import { useMemberSearch, type MemberSearchResult } from "@/hooks/useSales";
import { getInitials } from "@/lib/avatar";
import { checkin as t } from "@/strings/checkin";
import { cn } from "@/lib/utils";

interface Props {
  onSelect(member: MemberSearchResult): void;
  size?: "md" | "lg";
  autoFocus?: boolean;
  className?: string;
  disabled?: boolean;
}

/**
 * Contenido de un resultado de socio: foto (o iniciales sobre fondo neutro),
 * nombre, número de socio y teléfono para distinguir homónimos, y la insignia
 * de vigencia alineada a la derecha. Lo comparten la búsqueda global, el
 * selector de cobro y la búsqueda de Entradas para que «¿está vigente?» se
 * conteste igual en todas.
 */
export function MemberHitSummary({ member, className }: { member: MemberSearchResult; className?: string }) {
  const meta = [
    // El folio existe siempre (la lista lo muestra como #01124); el número de
    // socio sólo si el gym lo asignó. Cualquiera de los dos separa homónimos.
    member.member_number != null ? `Nº ${member.member_number}` : member.folio ? `#${member.folio}` : null,
    member.phone || "Sin teléfono",
  ].filter(Boolean).join(" · ");
  return (
    <span className={cn("flex min-w-0 flex-1 items-center gap-3", className)}>
      <Avatar className="h-9 w-9" aria-hidden="true">
        {member.photo_url ? <MemberPhoto memberId={member.member_id} /> : null}
        <AvatarFallback className="bg-muted text-xs font-semibold text-muted-foreground">
          {getInitials(member.full_name)}
        </AvatarFallback>
      </Avatar>
      <span className="min-w-0 flex-1">
        <span className="block truncate font-medium text-foreground">{member.full_name}</span>
        <span className="block truncate text-xs text-muted-foreground tabular">{meta}</span>
      </span>
      {member.access_status && (
        <VigenciaBadge
          size="sm"
          accessStatus={member.access_status}
          expiryDate={member.current_membership?.expiry_date ?? null}
        />
      )}
    </span>
  );
}

export function MemberSearchInput({ onSelect, size = "md", autoFocus, className, disabled = false }: Props) {
  const id = useId();
  const resultsRef = useRef<HTMLDivElement>(null);
  const [q, setQ] = useState("");
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const debounced = useDebounce(q, 300);
  const search = useMemberSearch(debounced);
  const busy = q !== debounced || search.isFetching;
  const items = busy || search.isError ? [] : search.data ?? [];
  const showResults = !disabled && open && q.trim().length >= 2;

  useEffect(() => {
    resultsRef.current?.querySelector('[aria-selected="true"]')?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  function select(member: MemberSearchResult) {
    if (disabled) return;
    setOpen(false);
    setQ("");
    setActive(-1);
    onSelect(member);
  }

  return (
    <div className={className} onBlur={(event) => {
      if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setOpen(false);
    }}>
      <div className="relative">
        <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-5 w-5 text-muted-foreground" />
        <Input
          disabled={disabled}
          autoFocus={autoFocus}
          value={q}
          role="combobox"
          aria-label="Buscar socio por nombre o teléfono"
          aria-expanded={showResults}
          aria-controls={showResults ? `${id}-results` : undefined}
          aria-autocomplete="list"
          aria-activedescendant={showResults && items[active] ? `${id}-${active}` : undefined}
          onFocus={() => setOpen(true)}
          onChange={(event) => { setQ(event.target.value); setOpen(true); setActive(-1); }}
          onKeyDown={(event) => {
            if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); setOpen(false); setActive(-1); }
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault(); setOpen(true);
              setActive(current => !items.length ? -1 : current < 0 ? (event.key === "ArrowDown" ? 0 : items.length - 1) : (current + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length);
            }
            if (event.key === "Enter" && showResults) {
              event.preventDefault();
              if (items[active]) select(items[active]);
            }
          }}
          placeholder={t.page.searchPlaceholder}
          className={cn("pl-10", size === "lg" ? "h-14 text-lg" : "h-11")}
        />
      </div>
      {/* In-flow results: remain visible inside scrollable dialogs. */}
      {showResults && <div className="mt-2 rounded-md border bg-popover">
        <div role="status" aria-live="polite">
          {busy ? <p className="flex items-center gap-2 p-3 text-sm text-muted-foreground"><Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />{t.page.searching}</p>
            : search.isError ? <div className="p-3 text-sm"><p>No pudimos buscar socios. Intenta de nuevo.</p><Button type="button" variant="outline" className="mt-2" onMouseDown={(event) => event.preventDefault()} onClick={() => void search.refetch()}>Reintentar búsqueda</Button></div>
            : !items.length ? <p className="p-3 text-sm text-muted-foreground">{t.page.searchEmpty}</p> : <span className="sr-only">{items.length} resultados disponibles.</span>}
        </div>
        <div ref={resultsRef} id={`${id}-results`} role="listbox" aria-label="Socios encontrados" className="max-h-72 overflow-y-auto">
          {items.map((member, index) => <button
            id={`${id}-${index}`} key={member.member_id} type="button" role="option" aria-selected={active === index}
            onMouseDown={(event) => event.preventDefault()}
            onClick={() => select(member)}
            onFocus={() => setActive(index)}
            className={cn(
              "flex min-h-12 w-full items-center border-b px-3 py-2 text-left text-sm last:border-b-0",
              // Resaltado de teclado: superficie y anillo (≥3:1 contra el popover).
              active === index ? "bg-accent text-accent-foreground ring-1 ring-inset ring-ring" : "hover:bg-muted",
            )}
          ><MemberHitSummary member={member} /></button>)}
        </div>
      </div>}
    </div>
  );
}
