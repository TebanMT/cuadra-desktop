import { useState } from "react";
import { Loader2, Search } from "lucide-react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useDebounce } from "@/hooks/useDebounce";
import { useMemberSearch, type MemberSearchResult } from "@/hooks/useSales";
import { useAddParticipant } from "@/hooks/useChallenges";
import { ApiError, api } from "@/lib/api";
import {
  Category,
  DEFAULT_EXERCISES,
  EXERCISE_LEGS,
  EXERCISE_PUSH,
  EXERCISE_PULL,
} from "@/types/challenges";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  challengeId: string;
  categories: Category[];
}

export function AddParticipantModal({ open, onOpenChange, challengeId, categories }: Props) {
  const add = useAddParticipant(challengeId);
  const [member, setMember] = useState<MemberSearchResult | null>(null);
  const [categoryId, setCategoryId] = useState<string>("");
  const [legs, setLegs] = useState<string>(DEFAULT_EXERCISES.legs);
  const [push, setPush] = useState<string>(DEFAULT_EXERCISES.push);
  const [pull, setPull] = useState<string>(DEFAULT_EXERCISES.pull);
  const [feePaid, setFeePaid] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const debounced = useDebounce(query, 300);
  const search = useMemberSearch(debounced);

  function reset() {
    setMember(null);
    setCategoryId("");
    setLegs(DEFAULT_EXERCISES.legs);
    setPush(DEFAULT_EXERCISES.push);
    setPull(DEFAULT_EXERCISES.pull);
    setFeePaid(false);
    setError(null);
    setQuery("");
  }

  function close(next: boolean) {
    if (!next) reset();
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!member) {
      setError("Busca y elige un socio.");
      return;
    }
    if (!categoryId) {
      setError("Selecciona una categoría.");
      return;
    }
    try {
      const p = await add.mutateAsync({
        member_id: member.member_id,
        category_id: categoryId,
        exercise_legs: legs,
        exercise_push: push,
        exercise_pull: pull,
      });
      if (feePaid) {
        // AddParticipant no expone mark_fee_paid (es un patch separado en
        // el BE). Lo encadenamos aquí; si falla, el socio queda inscrito
        // sin pago marcado y el usuario lo corrige desde la tabla.
        try {
          await api.patch(`/api/v1/challenges/${challengeId}/participants/${p.id}`, {
            mark_fee_paid: true,
          });
        } catch {
          toast.warning("Inscrito, pero no pudimos marcar la cuota. Ajústalo desde la tabla.");
        }
      }
      toast.success(`${member.full_name} inscrito`);
      close(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "No pudimos inscribir al socio.");
      } else {
        setError("No pudimos inscribir al socio. Vuelve a intentar.");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Agregar participante</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label>Socio</Label>
            {member ? (
              <div className="flex items-center justify-between rounded-md border border-border bg-muted/30 px-3 py-2">
                <div>
                  <div className="font-medium text-foreground">{member.full_name}</div>
                  <div className="text-xs text-muted-foreground tabular">{member.phone}</div>
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setMember(null)}
                >
                  Cambiar
                </Button>
              </div>
            ) : (
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                <Input
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  placeholder="Buscar por nombre o teléfono…"
                  className="pl-9"
                  autoFocus
                />
                {query.trim().length >= 2 && (
                  <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 rounded-md border bg-popover shadow-lg max-h-60 overflow-y-auto">
                    {search.isFetching && (
                      <div className="px-3 py-3 text-sm text-muted-foreground flex items-center gap-2">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        <span>Buscando…</span>
                      </div>
                    )}
                    {!search.isFetching && (search.data ?? []).length === 0 && (
                      <p className="px-3 py-3 text-sm text-muted-foreground">
                        Sin resultados.
                      </p>
                    )}
                    {(search.data ?? []).map((m) => (
                      <button
                        key={m.member_id}
                        type="button"
                        onClick={() => {
                          setMember(m);
                          setQuery("");
                        }}
                        className="w-full text-left px-3 py-2 hover:bg-muted text-sm border-b last:border-b-0"
                      >
                        <div className="font-medium">{m.full_name}</div>
                        <div className="text-xs text-muted-foreground tabular">{m.phone}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="space-y-1.5">
            <Label>Categoría</Label>
            <Select value={categoryId} onValueChange={setCategoryId}>
              <SelectTrigger>
                <SelectValue placeholder="Elige una categoría" />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id}>
                    {c.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {categories.length === 0 && (
              <p className="text-xs text-warning-700">
                Este reto todavía no tiene categorías. Créalas antes de inscribir socios.
              </p>
            )}
          </div>

          <div className="grid grid-cols-1 gap-3">
            <ExerciseSelect
              label="Pierna"
              value={legs}
              onChange={setLegs}
              options={EXERCISE_LEGS}
            />
            <ExerciseSelect
              label="Empuje"
              value={push}
              onChange={setPush}
              options={EXERCISE_PUSH}
            />
            <ExerciseSelect
              label="Tirón"
              value={pull}
              onChange={setPull}
              options={EXERCISE_PULL}
            />
          </div>

          <div className="flex items-center justify-between rounded-md border border-border px-3 py-2.5">
            <div>
              <div className="text-sm font-medium">Inscripción pagada</div>
              <div className="text-xs text-muted-foreground">
                Marca si ya cobraste la cuota.
              </div>
            </div>
            <Switch checked={feePaid} onCheckedChange={setFeePaid} />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" onClick={() => close(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={add.isPending || categories.length === 0}>
              {add.isPending ? "Inscribiendo…" : "Inscribir"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface ExerciseSelectProps {
  label: string;
  value: string;
  onChange(v: string): void;
  options: readonly { slug: string; label: string }[];
}

function ExerciseSelect({ label, value, onChange, options }: ExerciseSelectProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {options.map((o) => (
            <SelectItem key={o.slug} value={o.slug}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
