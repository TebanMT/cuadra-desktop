import { Input } from "@/components/ui/input";

interface Props {
  value: string;
  onChange(value: string): void;
  id?: string;
}

export function WhatsappInput({ value, onChange, id }: Props) {
  function format(raw: string): string {
    const digits = raw.replace(/\D/g, "").slice(0, 12);
    let cc = "52";
    let rest = digits;
    if (digits.startsWith("52")) {
      rest = digits.slice(2);
    } else if (digits.length > 10) {
      cc = digits.slice(0, digits.length - 10);
      rest = digits.slice(-10);
    }
    rest = rest.slice(0, 10);
    const groups: string[] = [];
    if (rest.length > 0) groups.push(rest.slice(0, 3));
    if (rest.length > 3) groups.push(rest.slice(3, 6));
    if (rest.length > 6) groups.push(rest.slice(6, 10));
    return `+${cc} ${groups.join(" ")}`.trimEnd();
  }

  return (
    <Input
      id={id}
      inputMode="tel"
      value={value}
      onChange={(e) => onChange(format(e.target.value))}
      placeholder="+52 442 123 4567"
    />
  );
}

export function whatsappValid(value: string): boolean {
  const digits = value.replace(/\D/g, "");
  return digits.length >= 12 && digits.length <= 13;
}

// Strip the human-friendly spaces before sending to the backend, which
// validates against ^\+?[1-9]\d{9,14}$ (no whitespace allowed).
export function whatsappNormalize(value: string): string {
  const digits = value.replace(/\D/g, "");
  return `+${digits}`;
}
