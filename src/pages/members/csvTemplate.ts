// Genera la plantilla CSV que el dueño descarga desde el wizard. Tiene los
// 8 headers exactos que espera el BE + 3 filas de ejemplo (una con plan
// asignado, otra sin plan, otra sólo con campos obligatorios).
//
// Devolvemos string crudo en lugar de Blob para que el componente pueda
// previsualizar en testing. El componente envuelve en Blob al descargar.
export function buildMembersCSVTemplate(): string {
  const header = [
    "full_name",
    "phone",
    "email",
    "birthdate",
    "notes",
    "membership_type_name",
    "membership_start_date",
    "membership_expiry_date",
  ].join(",");
  const rows = [
    'Ana López García,5512345678,ana@example.com,1990-03-15,Promo enero,Mensual,2026-04-01,2026-05-01',
    'Pedro Hernández,5598765432,,1985-07-22,,,,',
    'María Sánchez,5555551122,maria@example.com,,,,,',
  ];
  return [header, ...rows].join("\n") + "\n";
}

// Parser CSV mínimo, suficiente para preview en el FE. NO valida — eso lo
// hace el BE en la importación real. Devuelve filas como array de strings.
// Soporta:
//   - separador coma
//   - celdas entre comillas dobles con comas internas
//   - "" como comilla escapada dentro de celda quoted
//   - CRLF / LF
//   - BOM al inicio (Excel "CSV UTF-8")
//
// Lo dejamos inline para no agregar dep a papaparse — un CSV de gym tiene
// pocos cientos de filas y este parser cabe en <50 líneas.
export function parseCSVForPreview(text: string): string[][] {
  // Excel "CSV UTF-8" mete BOM al inicio del archivo.
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inQuotes) {
      if (ch === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        field += ch;
      }
      continue;
    }
    if (ch === '"') {
      inQuotes = true;
      continue;
    }
    if (ch === ",") {
      cur.push(field);
      field = "";
      continue;
    }
    if (ch === "\n" || ch === "\r") {
      // \r\n: saltamos el \n siguiente sin generar fila extra.
      if (ch === "\r" && text[i + 1] === "\n") i++;
      cur.push(field);
      field = "";
      rows.push(cur);
      cur = [];
      continue;
    }
    field += ch;
  }
  // Última fila sin newline al final.
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  // Drop trailing empty rows (Excel suele agregar uno).
  while (rows.length && rows[rows.length - 1].every((c) => c.trim() === "")) {
    rows.pop();
  }
  return rows;
}

// normalizePhoneForCompare replica la sanitización del BE para que el dup
// check client-side sea consistente: espacios, guiones, parens fuera.
export function normalizePhoneForCompare(raw: string): string {
  return raw.replace(/[\s\-()]/g, "").trim();
}

export const MEMBER_CSV_FIELDS = [
  { key: "full_name", label: "Nombre completo", aliases: ["nombre", "nombre completo"] },
  { key: "phone", label: "Teléfono", aliases: ["telefono", "celular"] },
  { key: "email", label: "Correo (opcional)", aliases: ["correo", "correo electronico"] },
  { key: "birthdate", label: "Nacimiento (opcional)", aliases: ["nacimiento", "fecha de nacimiento"] },
  { key: "notes", label: "Notas (opcional)", aliases: ["notas"] },
  { key: "membership_type_name", label: "Plan de membresía (opcional)", aliases: ["plan", "membresia"] },
  { key: "membership_start_date", label: "Inicio de membresía (opcional)", aliases: ["inicio", "fecha de inicio"] },
  { key: "membership_expiry_date", label: "Vencimiento (opcional)", aliases: ["vencimiento", "fecha de vencimiento"] },
];

export function inferMemberColumns(headers: string[]): number[] {
  const normalize = (value: string) => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").trim().toLowerCase();
  return MEMBER_CSV_FIELDS.map(field => headers.findIndex(header => [field.key, ...field.aliases].includes(normalize(header))));
}

export function mapMemberCSV(rows: string[][], columns: number[]): string {
  const quote = (value: string) => `"${value.replace(/"/g, '""')}"`;
  return [MEMBER_CSV_FIELDS.map(field => field.key), ...rows.slice(1).map(row => columns.map(index => index < 0 ? "" : row[index] ?? ""))]
    .map(row => row.map(quote).join(",")).join("\r\n") + "\r\n";
}

export function summarizeMemberImport(rows: string[][], duplicateIndexes: number[], allowDuplicates: boolean) {
  const incomplete = rows.flatMap((row, index) => !row[0]?.trim() || !row[1]?.trim() ? [index] : []);
  const invalid = new Set(incomplete);
  const skipped = allowDuplicates ? [] : [...new Set(duplicateIndexes)].filter(index => !invalid.has(index));
  return { incomplete, skipped, candidates: rows.length - incomplete.length - skipped.length };
}
