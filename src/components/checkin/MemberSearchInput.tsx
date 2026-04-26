import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { Input } from "@/components/ui/input";
import { useDebounce } from "@/hooks/useDebounce";
import { useMemberSearch, type MemberSearchResult } from "@/hooks/useSales";
import { checkin as t } from "@/strings/checkin";
import { cn } from "@/lib/utils";

interface Props {
  onSelect(member: MemberSearchResult): void;
  size?: "md" | "lg";
  autoFocus?: boolean;
  className?: string;
}

export function MemberSearchInput({ onSelect, size = "md", autoFocus, className }: Props) {
  const [q, setQ] = useState("");
  const debounced = useDebounce(q, 300);
  const search = useMemberSearch(debounced);
  const items = search.data ?? [];
  const showDropdown = q.trim().length >= 2;

  function handleSelect(m: MemberSearchResult) {
    onSelect(m);
    setQ("");
  }

  const inputHeight = size === "lg" ? "h-14 text-lg" : "h-11";

  return (
    <div className={cn("relative", className)}>
      <Search className={cn(
        "absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground",
        size === "lg" ? "h-5 w-5" : "h-4 w-4"
      )} />
      <Input
        autoFocus={autoFocus}
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder={t.page.searchPlaceholder}
        className={cn(inputHeight, "pl-10")}
      />
      {showDropdown && (
        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-md border bg-popover shadow-lg max-h-72 overflow-y-auto">
          {search.isFetching && (
            <div className="px-3 py-3 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              <span>{t.page.searching}</span>
            </div>
          )}
          {!search.isFetching && items.length === 0 && (
            <p className="px-3 py-3 text-sm text-muted-foreground">{t.page.searchEmpty}</p>
          )}
          {items.map((m) => (
            <button
              key={m.member_id}
              type="button"
              onClick={() => handleSelect(m)}
              className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
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
