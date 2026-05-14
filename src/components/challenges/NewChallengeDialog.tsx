import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCreateChallenge } from "@/hooks/useChallenges";
import { ApiError } from "@/lib/api";
import type { CreateChallengeInput } from "@/types/challenges";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
}

interface FormState {
  name: string;
  description: string;
  starts_at: string;
  measurement_t0_deadline: string;
  measurement_t1_start: string;
  ends_at: string;
  inscription_fee_pesos: string;
}

function emptyForm(): FormState {
  return {
    name: "",
    description: "",
    starts_at: "",
    measurement_t0_deadline: "",
    measurement_t1_start: "",
    ends_at: "",
    inscription_fee_pesos: "",
  };
}

function dateToIso(value: string): string {
  // input type=date returns yyyy-MM-dd; el BE espera time.Time RFC3339.
  if (!value) return "";
  return `${value}T00:00:00Z`;
}

export function NewChallengeDialog({ open, onOpenChange }: Props) {
  const navigate = useNavigate();
  const create = useCreateChallenge();
  const [form, setForm] = useState<FormState>(emptyForm());
  const [error, setError] = useState<string | null>(null);

  function update<K extends keyof FormState>(k: K, v: FormState[K]) {
    setForm((f) => ({ ...f, [k]: v }));
  }

  function close(next: boolean) {
    if (!next) {
      setForm(emptyForm());
      setError(null);
    }
    onOpenChange(next);
  }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (!form.name.trim()) {
      setError("Dale un nombre al reto.");
      return;
    }
    if (!form.starts_at || !form.measurement_t0_deadline || !form.measurement_t1_start || !form.ends_at) {
      setError("Las cuatro fechas son obligatorias.");
      return;
    }
    const input: CreateChallengeInput = {
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      starts_at: dateToIso(form.starts_at),
      measurement_t0_deadline: dateToIso(form.measurement_t0_deadline),
      measurement_t1_start: dateToIso(form.measurement_t1_start),
      ends_at: dateToIso(form.ends_at),
    };
    const fee = parseInt(form.inscription_fee_pesos, 10);
    if (!Number.isNaN(fee) && fee > 0) input.inscription_fee_cents = fee * 100;

    try {
      const challenge = await create.mutateAsync(input);
      toast.success("Reto creado");
      close(false);
      navigate(`/retos/${challenge.id}`);
    } catch (e) {
      if (e instanceof ApiError) {
        setError(e.message || "No pudimos crear el reto. Revisa las fechas.");
      } else {
        setError("No pudimos crear el reto. Vuelve a intentar.");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Nuevo reto</DialogTitle>
        </DialogHeader>

        <form onSubmit={submit} className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="ch-name">Nombre</Label>
            <Input
              id="ch-name"
              value={form.name}
              onChange={(e) => update("name", e.target.value)}
              placeholder="Reto 12 — Verano 2026"
              required
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ch-desc">Descripción (opcional)</Label>
            <Textarea
              id="ch-desc"
              value={form.description}
              onChange={(e) => update("description", e.target.value)}
              placeholder="Recomposición corporal a 12 semanas."
              rows={2}
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="ch-starts">Inicia</Label>
              <Input
                id="ch-starts"
                type="date"
                value={form.starts_at}
                onChange={(e) => update("starts_at", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-t0">Cierre T₀</Label>
              <Input
                id="ch-t0"
                type="date"
                value={form.measurement_t0_deadline}
                onChange={(e) => update("measurement_t0_deadline", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-t1">Inicia T₁</Label>
              <Input
                id="ch-t1"
                type="date"
                value={form.measurement_t1_start}
                onChange={(e) => update("measurement_t1_start", e.target.value)}
                required
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="ch-end">Termina</Label>
              <Input
                id="ch-end"
                type="date"
                value={form.ends_at}
                onChange={(e) => update("ends_at", e.target.value)}
                required
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="ch-fee">Cuota de inscripción (MXN, opcional)</Label>
            <Input
              id="ch-fee"
              type="number"
              min={0}
              value={form.inscription_fee_pesos}
              onChange={(e) => update("inscription_fee_pesos", e.target.value)}
              placeholder="500"
            />
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
            <Button type="submit" disabled={create.isPending}>
              {create.isPending ? "Creando…" : "Crear reto"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
