import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { Promotion, UpsertPromotionInput } from "@/hooks/usePromotions";
import {
  appliesToLabels,
  promotionKindHints,
  promotionKindLabels,
  promotions as t,
  type PromotionAppliesTo,
  type PromotionKind,
} from "@/strings/promotions";

interface PromotionFormProps {
  initial?: Promotion | null;
  submitting: boolean;
  serverError: string | null;
  onSubmit(input: UpsertPromotionInput): void;
  onCancel(): void;
}

// PromotionForm — single source of truth para el form de crear/editar
// promociones. UI condicional por `kind`: cada mecánica muestra su
// input específico (slider % vs $ vs días vs cantidad de socios) y
// oculta los irrelevantes para no confundir al dueño.
export function PromotionForm({
  initial,
  submitting,
  serverError,
  onSubmit,
  onCancel,
}: PromotionFormProps) {
  const [name, setName] = useState(initial?.name ?? "");
  const [description, setDescription] = useState(initial?.description ?? "");
  const [kind, setKind] = useState<PromotionKind>(initial?.kind ?? "percent");
  const [appliesTo, setAppliesTo] = useState<PromotionAppliesTo>(
    initial?.applies_to ?? "membership",
  );
  const [valueStr, setValueStr] = useState(
    initial?.value != null ? String(initial.value) : "",
  );
  const [companionCountStr, setCompanionCountStr] = useState(
    initial?.companion_count != null ? String(initial.companion_count) : "1",
  );
  const [code, setCode] = useState(initial?.code ?? "");
  const [validFrom, setValidFrom] = useState(initial?.valid_from ?? "");
  const [validUntil, setValidUntil] = useState(initial?.valid_until ?? "");
  const [maxTotal, setMaxTotal] = useState(
    initial?.max_uses_total != null ? String(initial.max_uses_total) : "",
  );
  const [maxPerMember, setMaxPerMember] = useState(
    initial?.max_uses_per_member != null
      ? String(initial.max_uses_per_member)
      : "",
  );

  // Cuando el operador cambia de kind reseteamos value/companion para
  // evitar arrastrar un "25%" cuando se pasa a fixed_amount.
  useEffect(() => {
    if (!initial) {
      setValueStr("");
      if (kind === "companion_memberships" && !companionCountStr) {
        setCompanionCountStr("1");
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = parseFloat(valueStr);
    const c = parseInt(companionCountStr, 10);
    const mt = parseInt(maxTotal, 10);
    const mp = parseInt(maxPerMember, 10);
    const input: UpsertPromotionInput = {
      name: name.trim(),
      description: description?.trim() ? description.trim() : null,
      kind,
      applies_to: appliesTo,
      value:
        kind === "percent" || kind === "fixed_amount" || kind === "extra_days"
          ? Number.isFinite(v)
            ? v
            : null
          : null,
      companion_count:
        kind === "companion_memberships"
          ? Number.isFinite(c) && c >= 1
            ? c
            : null
          : null,
      code: code.trim() ? code.trim() : null,
      valid_from: validFrom || null,
      valid_until: validUntil || null,
      max_uses_total: Number.isFinite(mt) && mt > 0 ? mt : null,
      max_uses_per_member: Number.isFinite(mp) && mp > 0 ? mp : null,
    };
    onSubmit(input);
  }

  return (
    <form onSubmit={submit} className="space-y-4">
      {serverError && (
        <Alert variant="destructive">
          <AlertDescription>{serverError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="promo-name">{t.form.name}</Label>
        <Input
          id="promo-name"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder={t.form.namePlaceholder}
          maxLength={100}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="promo-desc">{t.form.description}</Label>
        <Textarea
          id="promo-desc"
          value={description ?? ""}
          onChange={(e) => setDescription(e.target.value)}
          placeholder={t.form.descriptionPlaceholder}
          rows={2}
        />
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>{t.form.kind}</Label>
          <Select value={kind} onValueChange={(v) => setKind(v as PromotionKind)}>
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(promotionKindLabels) as PromotionKind[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {promotionKindLabels[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">
            {promotionKindHints[kind]}
          </p>
        </div>

        <div className="space-y-2">
          <Label>{t.form.appliesTo}</Label>
          <Select
            value={appliesTo}
            onValueChange={(v) => setAppliesTo(v as PromotionAppliesTo)}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(appliesToLabels) as PromotionAppliesTo[]).map((k) => (
                <SelectItem key={k} value={k}>
                  {appliesToLabels[k]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Input específico por kind — UI condicional. free_enrollment no
          tiene input numérico (su valor es implícito: omitir la cuota). */}
      {kind === "percent" && (
        <div className="space-y-2">
          <Label htmlFor="promo-value">{t.form.valuePercent}</Label>
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              value={parseFloat(valueStr) || 0}
              onChange={(e) => setValueStr(e.target.value)}
              className="flex-1"
              aria-label={t.form.valuePercent}
            />
            <div className="relative w-20">
              <Input
                id="promo-value"
                value={valueStr}
                onChange={(e) => setValueStr(e.target.value.replace(/[^\d.]/g, ""))}
                inputMode="decimal"
                className="pr-7 h-9"
              />
              <span className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                %
              </span>
            </div>
          </div>
        </div>
      )}

      {kind === "fixed_amount" && (
        <div className="space-y-2">
          <Label htmlFor="promo-value">{t.form.valueFixed}</Label>
          <div className="relative w-full sm:w-48">
            <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground">
              $
            </span>
            <Input
              id="promo-value"
              value={valueStr}
              onChange={(e) => setValueStr(e.target.value.replace(/[^\d.]/g, ""))}
              inputMode="decimal"
              className="pl-7"
              placeholder="100"
            />
          </div>
        </div>
      )}

      {kind === "extra_days" && (
        <div className="space-y-2">
          <Label htmlFor="promo-value">{t.form.valueExtraDays}</Label>
          <Input
            id="promo-value"
            type="number"
            min={1}
            max={365}
            value={valueStr}
            onChange={(e) => setValueStr(e.target.value)}
            className="w-32"
          />
        </div>
      )}

      {kind === "companion_memberships" && (
        <div className="space-y-2">
          <Label htmlFor="promo-companion">{t.form.companionCount}</Label>
          <Input
            id="promo-companion"
            type="number"
            min={1}
            max={10}
            value={companionCountStr}
            onChange={(e) => setCompanionCountStr(e.target.value)}
            className="w-32"
          />
        </div>
      )}

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="promo-code">{t.form.code}</Label>
          <Input
            id="promo-code"
            value={code ?? ""}
            onChange={(e) => setCode(e.target.value)}
            placeholder={t.form.codePlaceholder}
            maxLength={50}
          />
          <p className="text-[11px] text-muted-foreground">{t.form.codeHint}</p>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <div className="space-y-2">
            <Label htmlFor="promo-from">{t.form.validFrom}</Label>
            <Input
              id="promo-from"
              type="date"
              value={validFrom ?? ""}
              onChange={(e) => setValidFrom(e.target.value)}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="promo-until">{t.form.validUntil}</Label>
            <Input
              id="promo-until"
              type="date"
              value={validUntil ?? ""}
              onChange={(e) => setValidUntil(e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid sm:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="promo-max-total">{t.form.maxUsesTotal}</Label>
          <Input
            id="promo-max-total"
            type="number"
            min={1}
            value={maxTotal}
            onChange={(e) => setMaxTotal(e.target.value)}
            placeholder="∞"
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="promo-max-member">{t.form.maxUsesPerMember}</Label>
          <Input
            id="promo-max-member"
            type="number"
            min={1}
            value={maxPerMember}
            onChange={(e) => setMaxPerMember(e.target.value)}
            placeholder="∞"
          />
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button type="button" variant="ghost" onClick={onCancel} disabled={submitting}>
          {t.form.cancel}
        </Button>
        <Button type="submit" disabled={submitting}>
          {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
          {t.form.save}
        </Button>
      </div>
    </form>
  );
}
