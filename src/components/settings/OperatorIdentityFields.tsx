import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PhoneInput } from "@/components/shared/PhoneInput";
import { settings as t } from "@/strings/settings";
import type { OperatorFieldErrors, OperatorIdentity } from "@/components/settings/operatorForm";

interface Props {
  idPrefix: string;
  value: OperatorIdentity;
  errors: OperatorFieldErrors;
  onChange(next: OperatorIdentity): void;
  phoneHint?: string;
  disabled?: boolean;
  autoFocus?: boolean;
}

function FieldError({ id, message, live }: { id: string; message?: string; live?: boolean }) {
  if (!message) return null;
  return (
    <p id={id} role={live ? "alert" : undefined} className="text-sm font-medium text-destructive-text">
      {message}
    </p>
  );
}

/** Name, phone and optional email: the same fields to create and to edit. */
export function OperatorIdentityFields({ idPrefix, value, errors, onChange, phoneHint, disabled, autoFocus }: Props) {
  const set = (patch: Partial<OperatorIdentity>) => onChange({ ...value, ...patch });
  const ids = {
    name: `${idPrefix}-name`,
    phone: `${idPrefix}-phone`,
    email: `${idPrefix}-email`,
  };
  return (
    <div className="space-y-4">
      <div className="space-y-1.5">
        <Label htmlFor={ids.name}>{t.operators.fields.fullName}</Label>
        <Input
          id={ids.name}
          value={value.fullName}
          onChange={(e) => set({ fullName: e.target.value })}
          aria-invalid={errors.name ? true : undefined}
          aria-describedby={errors.name ? `${ids.name}-error` : undefined}
          autoComplete="off"
          disabled={disabled}
          autoFocus={autoFocus}
        />
        <FieldError id={`${ids.name}-error`} message={errors.name} />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={ids.phone}>{t.operators.fields.phone}</Label>
        <PhoneInput
          id={ids.phone}
          dialCode={value.dialCode}
          number={value.phoneNumber}
          onDialCodeChange={(dialCode) => set({ dialCode })}
          onNumberChange={(phoneNumber) => set({ phoneNumber })}
          disabled={disabled}
        />
        {/* PhoneInput no expone aria-describedby: el error se anuncia solo. */}
        <FieldError id={`${ids.phone}-error`} message={errors.phone} live />
        {phoneHint && <p className="text-sm text-muted-foreground">{phoneHint}</p>}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor={ids.email}>{t.operators.fields.emailOptional}</Label>
        <Input
          id={ids.email}
          type="email"
          value={value.email}
          onChange={(e) => set({ email: e.target.value })}
          aria-invalid={errors.email ? true : undefined}
          aria-describedby={errors.email ? `${ids.email}-error` : undefined}
          placeholder="opcional@correo.com"
          disabled={disabled}
        />
        <FieldError id={`${ids.email}-error`} message={errors.email} />
      </div>
    </div>
  );
}
