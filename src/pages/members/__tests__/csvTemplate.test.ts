import { describe, expect, it } from "vitest";
import { inferMemberColumns, mapMemberCSV, parseCSVForPreview } from "../csvTemplate";

describe("importación de columnas", () => {
  it("asocia encabezados en español sin depender del orden y conserva comillas, comas y saltos", () => {
    const source = parseCSVForPreview('Teléfono,Notas,Nombre completo,Plan\n5512345678,"Dijo ""sí"",\nlunes",Ana,Mensual');
    const mapping = inferMemberColumns(source[0]);
    const result = parseCSVForPreview(mapMemberCSV(source, mapping));
    expect(result[1]).toEqual(["Ana", "5512345678", "", "", 'Dijo "sí",\nlunes', "Mensual", "", ""]);
  });
  it("mantiene los encabezados oficiales y deja explícitos los campos sin asociación", () => {
    const mapping = inferMemberColumns(["email", "full_name", "phone", "Otro"]);
    expect(mapping).toEqual([1, 2, 0, -1, -1, -1, -1, -1]);
  });
});

import { summarizeMemberImport } from "../csvTemplate";
it("cuenta todo el archivo, incluidas filas incompletas fuera de las veinte visibles", () => {
  const rows = Array.from({ length: 24 }, (_, i) => [`Persona ${i}`, `55500000${i}`]);
  rows[23][0] = "";
  expect(summarizeMemberImport(rows, [0, 0, 3], false)).toEqual({ incomplete: [23], skipped: [0, 3], candidates: 21 });
  expect(summarizeMemberImport(rows, [0, 3], true)).toEqual({ incomplete: [23], skipped: [], candidates: 23 });
});
it("no cuenta dos veces una fila incompleta y duplicada", () => {
  expect(summarizeMemberImport([["", "555"], ["Ana", "555"]], [0, 1], false)).toEqual({ incomplete: [0], skipped: [1], candidates: 0 });
});
