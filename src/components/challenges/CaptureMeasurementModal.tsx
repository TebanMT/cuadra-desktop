import { useMemo, useState } from "react";
import { toast } from "sonner";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { useCaptureMeasurement, useParticipantMeasurements } from "@/hooks/useChallenges";
import { ApiError } from "@/lib/api";
import { fmtDate } from "@/lib/dates";
import {
  exerciseLabel,
  type Challenge,
  type MeasurementMoment,
  type Participant,
} from "@/types/challenges";

interface Props {
  open: boolean;
  onOpenChange(open: boolean): void;
  challenge: Challenge;
  participant: Participant;
  memberName?: string;
  categoryName?: string;
  moment: MeasurementMoment;
}

interface FormState {
  body_weight_kg: string;
  body_fat_pct: string;
  legs_weight_kg: string;
  legs_reps: string;
  push_weight_kg: string;
  push_reps: string;
  pull_weight_kg: string;
  pull_reps: string;
  notes: string;
}

function emptyForm(): FormState {
  return {
    body_weight_kg: "",
    body_fat_pct: "",
    legs_weight_kg: "",
    legs_reps: "5",
    push_weight_kg: "",
    push_reps: "5",
    pull_weight_kg: "",
    pull_reps: "5",
    notes: "",
  };
}

// Epley: 1RM ≈ peso × (1 + reps/30). Sólo para mostrar — el BE lo recalcula.
function epley(weight: number, reps: number): number {
  if (!weight || !reps) return 0;
  return weight * (1 + reps / 30);
}

function fNum(s: string): number {
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

function fInt(s: string): number {
  const n = parseInt(s, 10);
  return Number.isFinite(n) ? n : 0;
}

function momentLabel(m: MeasurementMoment): string {
  switch (m) {
    case "t0":
      return "T₀ — inicial";
    case "t1":
      return "T₁ — final";
    case "intermediate":
      return "Intermedia";
  }
}

export function CaptureMeasurementModal({
  open,
  onOpenChange,
  challenge,
  participant,
  memberName,
  categoryName,
  moment,
}: Props) {
  const capture = useCaptureMeasurement(challenge.id, participant.id);
  const history = useParticipantMeasurements(challenge.id, participant.id);
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

  const prior = useMemo(() => {
    return (history.data?.items ?? []).find(
      (m) => m.moment === moment && !m.superseded_at
    );
  }, [history.data, moment]);

  // Derivados de composición corporal (sólo display — el BE recalcula).
  const bw = fNum(form.body_weight_kg);
  const bf = fNum(form.body_fat_pct);
  const fatMass = bw * (bf / 100);
  const leanMass = bw - fatMass;

  const legs1RM = epley(fNum(form.legs_weight_kg), fInt(form.legs_reps));
  const push1RM = epley(fNum(form.push_weight_kg), fInt(form.push_reps));
  const pull1RM = epley(fNum(form.pull_weight_kg), fInt(form.pull_reps));
  const fNorm = bw > 0 ? (legs1RM + push1RM + pull1RM) / bw : 0;

  // No conocemos el género del socio en el FE — avisamos contra el piso
  // más bajo de los dos (m vs f) para no falsear el warning.
  const bfFloorMin = Math.min(challenge.bf_floor_male_pct, challenge.bf_floor_female_pct);
  const bfBelowFloor = bf > 0 && bf < bfFloorMin;
  const bfOutOfRange = bf > 0 && (bf < 3 || bf > 60);
  const repsOutOfRange =
    fInt(form.legs_reps) < 1 ||
    fInt(form.legs_reps) > 15 ||
    fInt(form.push_reps) < 1 ||
    fInt(form.push_reps) > 15 ||
    fInt(form.pull_reps) < 1 ||
    fInt(form.pull_reps) > 15;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    if (bw <= 0) {
      setError("El peso corporal es obligatorio.");
      return;
    }
    if (bf <= 0) {
      setError("El % de grasa corporal es obligatorio.");
      return;
    }
    if (repsOutOfRange) {
      setError("Las reps deben estar entre 1 y 15.");
      return;
    }
    try {
      await capture.mutateAsync({
        moment,
        measured_at: new Date().toISOString(),
        body_weight_kg: bw,
        body_fat_pct: bf,
        legs_weight_kg: fNum(form.legs_weight_kg),
        legs_reps: fInt(form.legs_reps),
        push_weight_kg: fNum(form.push_weight_kg),
        push_reps: fInt(form.push_reps),
        pull_weight_kg: fNum(form.pull_weight_kg),
        pull_reps: fInt(form.pull_reps),
        notes: form.notes.trim() || undefined,
      });
      toast.success("Medición guardada");
      close(false);
    } catch (err) {
      if (err instanceof ApiError) {
        setError(err.message || "No pudimos guardar la medición. Vuelve a intentar.");
      } else {
        setError("No pudimos guardar la medición. Vuelve a intentar.");
      }
    }
  }

  return (
    <Dialog open={open} onOpenChange={close}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Capturar medición · {momentLabel(moment)}</DialogTitle>
          <div className="text-sm text-muted-foreground mt-1">
            {memberName ?? "Participante"}
            {categoryName ? <> · {categoryName}</> : null}
          </div>
        </DialogHeader>

        {prior && (
          <Alert variant="default" className="bg-warning-100 border-warning-700/30 text-warning-700">
            <AlertDescription>
              Ya existe una medición {momentLabel(moment).toLowerCase()} del{" "}
              <span className="font-medium">{fmtDate(prior.measured_at)}</span>. Si
              guardas, la anterior será reemplazada (queda en auditoría).
            </AlertDescription>
          </Alert>
        )}

        <form onSubmit={submit} className="space-y-5">
          {/* Composición corporal */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight">Composición corporal</h3>
            <div className="grid grid-cols-2 gap-3">
              <Field
                label="Peso (kg)"
                inputProps={{
                  type: "number",
                  step: "0.1",
                  min: 0,
                  value: form.body_weight_kg,
                  onChange: (e) => update("body_weight_kg", e.target.value),
                  placeholder: "82.4",
                  required: true,
                }}
              />
              <Field
                label="% grasa"
                inputProps={{
                  type: "number",
                  step: "0.1",
                  min: 0,
                  max: 60,
                  value: form.body_fat_pct,
                  onChange: (e) => update("body_fat_pct", e.target.value),
                  placeholder: "24.1",
                  required: true,
                }}
              />
              <Derived label="Masa magra" value={leanMass} unit="kg" />
              <Derived label="Masa grasa" value={fatMass} unit="kg" />
            </div>
            {bfOutOfRange && (
              <p className="text-xs text-destructive">
                El % de grasa debe quedar entre 3 y 60.
              </p>
            )}
            {!bfOutOfRange && bfBelowFloor && (
              <p className="text-xs text-warning-700">
                Este valor está por debajo del piso del reto ({bfFloorMin}%). Puedes
                guardar, pero confirma la medición.
              </p>
            )}
          </section>

          {/* Fuerza */}
          <section className="space-y-3">
            <h3 className="text-sm font-semibold tracking-tight">Fuerza</h3>
            <ExerciseRow
              family="legs"
              slug={participant.exercise_legs}
              weight={form.legs_weight_kg}
              reps={form.legs_reps}
              onWeight={(v) => update("legs_weight_kg", v)}
              onReps={(v) => update("legs_reps", v)}
              oneRM={legs1RM}
            />
            <ExerciseRow
              family="push"
              slug={participant.exercise_push}
              weight={form.push_weight_kg}
              reps={form.push_reps}
              onWeight={(v) => update("push_weight_kg", v)}
              onReps={(v) => update("push_reps", v)}
              oneRM={push1RM}
            />
            <ExerciseRow
              family="pull"
              slug={participant.exercise_pull}
              weight={form.pull_weight_kg}
              reps={form.pull_reps}
              onWeight={(v) => update("pull_weight_kg", v)}
              onReps={(v) => update("pull_reps", v)}
              oneRM={pull1RM}
            />
            <div className="flex items-center justify-between rounded-md bg-muted/30 px-3 py-2">
              <span className="text-sm text-muted-foreground">F normalizada (1RM/kg)</span>
              <span className="tabular text-sm font-medium">{fNorm.toFixed(3)}</span>
            </div>
          </section>

          {/* Notas */}
          <div className="space-y-1.5">
            <Label htmlFor="notes">Notas (opcional)</Label>
            <Textarea
              id="notes"
              rows={2}
              value={form.notes}
              onChange={(e) => update("notes", e.target.value)}
              placeholder="Plicómetro 7-puntos, equipos calibrados…"
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
            <Button type="submit" disabled={capture.isPending}>
              {capture.isPending ? "Guardando…" : "Guardar medición"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}

interface FieldProps {
  label: string;
  inputProps: React.InputHTMLAttributes<HTMLInputElement>;
}

function Field({ label, inputProps }: FieldProps) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <Input {...inputProps} />
    </div>
  );
}

function Derived({ label, value, unit }: { label: string; value: number; unit: string }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-muted-foreground">{label}</Label>
      <div className="h-9 px-3 rounded-md border border-border bg-muted/30 flex items-center text-sm tabular">
        {value > 0 ? `${value.toFixed(1)} ${unit}` : "—"}
      </div>
    </div>
  );
}

interface ExerciseRowProps {
  family: "legs" | "push" | "pull";
  slug: string;
  weight: string;
  reps: string;
  onWeight(v: string): void;
  onReps(v: string): void;
  oneRM: number;
}

function ExerciseRow({ family, slug, weight, reps, onWeight, onReps, oneRM }: ExerciseRowProps) {
  return (
    <div className="rounded-md border border-border p-3 space-y-2">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium">{exerciseLabel(slug, family)}</div>
        <div className="text-xs text-muted-foreground tabular">
          1RM est. {oneRM > 0 ? oneRM.toFixed(1) + " kg" : "—"}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Input
          type="number"
          step="0.5"
          min={0}
          value={weight}
          onChange={(e) => onWeight(e.target.value)}
          placeholder="Peso (kg)"
        />
        <Input
          type="number"
          min={1}
          max={15}
          value={reps}
          onChange={(e) => onReps(e.target.value)}
          placeholder="Reps"
        />
      </div>
    </div>
  );
}
