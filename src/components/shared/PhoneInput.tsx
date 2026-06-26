import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";

// Country dial codes acotados a Latinoamérica + US/Canada + España. Si en
// el futuro el segmento crece a otra región se agregan acá sin tocar el
// componente. Orden: México primero (default), resto alfabético.
// US/Canadá/Rep. Dominicana comparten +1 → una sola fila (la E.164
// resultante es la misma para los tres).
export const COUNTRY_DIAL_CODES = [
  { code: "52",  name: "México" },
  { code: "54",  name: "Argentina" },
  { code: "591", name: "Bolivia" },
  { code: "56",  name: "Chile" },
  { code: "57",  name: "Colombia" },
  { code: "506", name: "Costa Rica" },
  { code: "593", name: "Ecuador" },
  { code: "503", name: "El Salvador" },
  { code: "34",  name: "España" },
  { code: "1",   name: "Estados Unidos / Canadá" },
  { code: "502", name: "Guatemala" },
  { code: "504", name: "Honduras" },
  { code: "505", name: "Nicaragua" },
  { code: "507", name: "Panamá" },
  { code: "595", name: "Paraguay" },
  { code: "51",  name: "Perú" },
  { code: "598", name: "Uruguay" },
  { code: "58",  name: "Venezuela" },
] as const;

export const DEFAULT_DIAL_CODE = "52";

interface Props {
  /** El número local SIN código de país (digits only, espacios opcionales). */
  number: string;
  /** El código de país sin el "+". */
  dialCode: string;
  onNumberChange(v: string): void;
  onDialCodeChange(v: string): void;
  id?: string;
  disabled?: boolean;
  placeholder?: string;
}

// PhoneInput parte el celular en dos: el dial code (select) y el número
// nacional (text). Para la API/DB se concatenan vía `formatE164()` —
// nunca se persisten los dos campos por separado.
export function PhoneInput({
  number,
  dialCode,
  onNumberChange,
  onDialCodeChange,
  id,
  disabled,
  placeholder,
}: Props) {
  const known = COUNTRY_DIAL_CODES.some((c) => c.code === dialCode);
  const safeValue = known ? dialCode : DEFAULT_DIAL_CODE;

  return (
    <div className="flex gap-2">
      <Select
        value={safeValue}
        onValueChange={onDialCodeChange}
        disabled={disabled}
      >
        {/* El trigger muestra sólo "+52" (compacto). El dropdown
            despliega "+52 · México" para que el usuario pueda elegir. */}
        <SelectTrigger className="w-[88px] shrink-0 tabular">
          <span>+{safeValue}</span>
        </SelectTrigger>
        <SelectContent>
          {COUNTRY_DIAL_CODES.map((c) => (
            <SelectItem key={c.code} value={c.code}>
              +{c.code} · {c.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      <Input
        id={id}
        type="tel"
        inputMode="tel"
        autoComplete="tel-national"
        value={number}
        // Sólo dígitos: filtramos en cada tecla para que nunca entren
        // espacios/guiones/letras al estado (el usuario "únicamente puede
        // teclear números"). formatE164 igual limpia al submit como red.
        onChange={(e) => onNumberChange(e.target.value.replace(/\D/g, ""))}
        disabled={disabled}
        placeholder={placeholder ?? "5512345678"}
        className="flex-1"
      />
    </div>
  );
}

// formatE164 — pega dial code + número nacional, quita cualquier
// separador (espacios, guiones, paréntesis, puntos) y antepone "+".
// Devuelve "" cuando el número nacional está vacío para que el caller
// pueda enviar undefined en campos opcionales.
export function formatE164(dialCode: string, number: string): string {
  const ccDigits = dialCode.replace(/\D/g, "");
  const numDigits = number.replace(/\D/g, "");
  if (!numDigits) return "";
  return `+${ccDigits}${numDigits}`;
}

// phoneNumberValid — chequeo client-side mínimo: el número nacional
// suma al menos 7 dígitos (E.164 permite hasta 15 totales contando el
// código de país). El BE valida también con ValidatePhone (lax).
export function phoneNumberValid(dialCode: string, number: string): boolean {
  const ccDigits = dialCode.replace(/\D/g, "");
  const numDigits = number.replace(/\D/g, "");
  if (numDigits.length < 7) return false;
  if (ccDigits.length + numDigits.length > 15) return false;
  return true;
}

// splitE164 — inverso de formatE164: dado un string E.164 guardado
// (o uno parcialmente formateado tipo "+52 "), recupera el dial code
// y el número nacional. Se usa para hidratar formularios que persisten
// la versión concatenada (wire) y muestran los dos campos separados.
//
// Si no matchea ningún dial code conocido, asume el default (México)
// y deja todos los dígitos como número nacional — comportamiento seguro
// para valores legacy o user-typed raros.
export function splitE164(raw: string): { dialCode: string; number: string } {
  const digits = (raw || "").replace(/\D/g, "");
  if (!digits) return { dialCode: DEFAULT_DIAL_CODE, number: "" };

  // Ordena códigos por largo desc para que "+593" gane a "+5" si
  // hubiera ambigüedad. Como los códigos del catálogo no se solapan
  // por prefijo (52, 54, 56, 57, 58 son distintos), basta con startsWith.
  const candidates = [...COUNTRY_DIAL_CODES]
    .map((c) => c.code)
    .sort((a, b) => b.length - a.length);
  for (const code of candidates) {
    if (digits.startsWith(code)) {
      return { dialCode: code, number: digits.slice(code.length) };
    }
  }
  return { dialCode: DEFAULT_DIAL_CODE, number: digits };
}
