import { useMemo, useState } from "react";
import { Check, ChevronDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import cities from "@/data/mexican-cities.json";

interface City {
  name: string;
  state: string;
}
const ALL: City[] = cities as City[];

interface Props {
  value: string;
  onChange(value: string): void;
  placeholder?: string;
  id?: string;
}

export function CityAutocomplete({ value, onChange, placeholder, id }: Props) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = (query || value || "").trim().toLowerCase();
    if (!q) return ALL.slice(0, 50);
    return ALL.filter((c) =>
      `${c.name} ${c.state}`.toLowerCase().includes(q)
    ).slice(0, 50);
  }, [query, value]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          id={id}
          type="button"
          variant="outline"
          role="combobox"
          aria-expanded={open}
          className="w-full justify-between h-11 font-normal"
        >
          <span className={cn("truncate", !value && "text-muted-foreground")}>
            {value || placeholder || "Selecciona ciudad"}
          </span>
          <ChevronDown className="ml-2 h-4 w-4 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="p-0 w-[--radix-popover-trigger-width]" align="start">
        <Command shouldFilter={false}>
          <CommandInput placeholder="Buscar o escribir ciudad…" value={query} onValueChange={setQuery} />
          <CommandList>
            <CommandEmpty>
              <div className="space-y-2">
                <div>No encontramos esa ciudad.</div>
                {query && (
                  <Button
                    size="sm"
                    onClick={() => {
                      onChange(query);
                      setOpen(false);
                    }}
                  >
                    Usar "{query}"
                  </Button>
                )}
              </div>
            </CommandEmpty>
            <CommandGroup>
              {filtered.map((c) => {
                const label = `${c.name}, ${c.state}`;
                const selected = value === label;
                return (
                  <CommandItem
                    key={label}
                    value={label}
                    onSelect={() => {
                      onChange(label);
                      setOpen(false);
                    }}
                  >
                    <Check className={cn("mr-2 h-4 w-4", selected ? "opacity-100" : "opacity-0")} />
                    {label}
                  </CommandItem>
                );
              })}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}
