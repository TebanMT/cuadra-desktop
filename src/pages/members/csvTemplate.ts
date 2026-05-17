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
    'Ana López García,5512345678,ana@gmail.com,1990-03-15,Promo enero,Mensual,2026-04-01,2026-05-01',
    'Pedro Hernández,5598765432,,1985-07-22,,,,',
    'María Sánchez,5555551122,maria.s@hotmail.com,,,,,',
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
