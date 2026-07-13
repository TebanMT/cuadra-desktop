import { useState } from "react";
import { Loader2, Search, UserCheck, UserPlus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useMemberSearch, type MemberSearchResult } from "@/hooks/useSales";
import { useDebounce } from "@/hooks/useDebounce";
import { sales as t } from "@/strings/sales";

// Asociador de socio de la venta. Extraído de QuickSalePage porque el
// modal de cobro también lo necesita (fiado sin socio se asocia ahí
// mismo, en lugar de un toggle deshabilitado con tooltip).
export function MemberAssociator({
  member,
  onChange,
}: {
  member: MemberSearchResult | null;
  onChange(m: MemberSearchResult | null): void;
}) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const search = useMemberSearch(debounced);

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

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <UserPlus className="h-4 w-4" />
          {t.page.associate}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 p-0">
        <div className="p-2 border-b">
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              autoFocus
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder={t.page.associateSearchPlaceholder}
              className="pl-8 h-9"
            />
          </div>
        </div>
        <div className="max-h-72 overflow-y-auto">
          {search.isFetching && (
            <div className="px-3 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>Buscando…</span>
            </div>
          )}
          {!search.isFetching && debounced.length >= 2 && (search.data ?? []).length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">{t.page.associateNoResults}</p>
          )}
          {(search.data ?? []).map((m) => (
            <button
              key={m.member_id}
              type="button"
              onClick={() => {
                onChange(m);
                setOpen(false);
                setQuery("");
              }}
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm"
            >
              <div className="font-medium">{m.full_name}</div>
              <div className="text-xs text-muted-foreground">{m.phone}</div>
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
