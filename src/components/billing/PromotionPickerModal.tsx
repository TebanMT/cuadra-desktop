import { normalizeSearchText } from "@/lib/search";
import { useEffect, useMemo, useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Badge } from "@/components/ui/badge";
import {
  fetchPromotionByCode,
  usePromotions,
  type Promotion,
} from "@/hooks/usePromotions";
import {
  promotions as t,
  promotionKindLabels,
  formatPromotionValue,
  type PromotionAppliesTo,
} from "@/strings/promotions";
import { ApiError } from "@/lib/api";

interface PromotionPickerModalProps {
  open: boolean;
  onOpenChange(o: boolean): void;
  // Filtra promos vigentes que aplican al target del cobro (membership o
  // sale). `any` ya matchea ambos en el backend, no hace falta listarlo
  // explícito.
  target: PromotionAppliesTo;
  onApply(p: Promotion): void;
}

// PromotionPickerModal — UI doble: dropdown de promos vigentes que
// matchean el target, + input de código para casos donde el operador
// sabe el código de boca. Validar contra el server al "Aplicar código"
// (no on-blur — sería muy chatty).
export function PromotionPickerModal({
  open,
  onOpenChange,
  target,
  onApply,
}: PromotionPickerModalProps) {
  const promosQuery = usePromotions({
    appliesTo: target,
    currentlyValid: true,
  });
  const [search, setSearch] = useState("");
  const [code, setCode] = useState("");
  const [codeLoading, setCodeLoading] = useState(false);
  const [codeError, setCodeError] = useState<string | null>(null);

  // Reset al abrir.
  useEffect(() => {
    if (open) {
      setSearch("");
      setCode("");
      setCodeError(null);
    }
  }, [open]);

  const filtered = useMemo(() => {
    const q = normalizeSearchText(search);
    const rows = promosQuery.data ?? [];
    if (!q) return rows;
    return rows.filter((p) =>
      normalizeSearchText(p.name).includes(q) ||
      normalizeSearchText(p.code ?? "").includes(q),
    );
  }, [promosQuery.data, search]);

  async function applyByCode() {
    const c = code.trim();
    if (!c) return;
    setCodeLoading(true);
    setCodeError(null);
    try {
      const p = await fetchPromotionByCode(c);
      onApply(p);
      onOpenChange(false);
      toast.success(t.picker.summary(p.name));
    } catch (e) {
      if (e instanceof ApiError) {
        setCodeError(e.message || t.picker.notFound);
      } else {
        setCodeError(t.picker.notFound);
      }
    } finally {
      setCodeLoading(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{t.picker.title}</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* Dropdown / lista de vigentes */}
          <section className="space-y-2" aria-labelledby="promo-list-label">
            <p id="promo-list-label" className="text-sm font-medium">
              {t.picker.chooseFromList}
            </p>
            <div className="relative">
              <Search aria-hidden="true" className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Buscar por nombre o código…"
                aria-label="Buscar promoción por nombre o código"
                className="pl-9"
              />
            </div>
            <div className="max-h-64 overflow-y-auto rounded-md border divide-y">
              {promosQuery.isLoading ? (
                <p role="status" className="flex items-center justify-center gap-2 p-4 text-sm text-muted-foreground">
                  <Loader2 aria-hidden="true" className="h-4 w-4 animate-spin" />
                  Cargando promociones…
                </p>
              ) : promosQuery.isError ? (
                // Un fallo no es «no hay promociones»: decirlo y ofrecer salida.
                <div role="alert" className="space-y-2 p-3 text-sm">
                  <p>No pudimos cargar las promociones. Puedes reintentar o usar un código.</p>
                  <Button type="button" variant="outline" onClick={() => void promosQuery.refetch()}>
                    Reintentar
                  </Button>
                </div>
              ) : filtered.length === 0 ? (
                <p className="text-sm text-muted-foreground p-3 text-center">
                  {t.picker.none}
                </p>
              ) : (
                filtered.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    onClick={() => {
                      onApply(p);
                      onOpenChange(false);
                      toast.success(t.picker.summary(p.name));
                    }}
                    className="flex min-h-12 w-full items-center justify-between gap-3 p-3 text-left hover:bg-muted/60"
                  >
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium truncate">{p.name}</div>
                      <div className="text-xs text-muted-foreground flex items-center gap-2 flex-wrap">
                        <span>{promotionKindLabels[p.kind]}</span>
                        {p.code && (
                          <Badge variant="outline" className="py-0 font-mono text-xs">
                            {p.code.toUpperCase()}
                          </Badge>
                        )}
                      </div>
                    </div>
                    <div className="text-sm font-semibold tabular">
                      {formatPromotionValue(p.kind, p.value, p.companion_count)}
                    </div>
                  </button>
                ))
              )}
            </div>
          </section>

          {/* Input de código. Su rótulo ya dice «O usa un código»: basta
              un divisor fino, sin una «o» suelta repetida. */}
          <section className="space-y-2 border-t pt-4">
            <Label htmlFor="promo-code-input">
              {t.picker.enterCode}
            </Label>
            <div className="flex gap-2">
              <Input
                id="promo-code-input"
                value={code}
                onChange={(e) => {
                  setCode(e.target.value);
                  setCodeError(null);
                }}
                placeholder={t.picker.codePlaceholder}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    e.preventDefault();
                    applyByCode();
                  }
                }}
              />
              <Button onClick={applyByCode} disabled={!code.trim() || codeLoading}>
                {codeLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {t.picker.apply}
              </Button>
            </div>
            {codeError && (
              <Alert variant="destructive">
                <AlertDescription>{codeError}</AlertDescription>
              </Alert>
            )}
          </section>
        </div>
      </DialogContent>
    </Dialog>
  );
}
