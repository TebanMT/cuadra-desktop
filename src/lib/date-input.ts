import type { SyntheticEvent } from "react";
import { fmtIso, parseDate } from "@/lib/dates";

/** Numeric keyboards have no slash key. Insert separators as digits are typed. */
export function formatDateTyping(text: string): string {
  if (/^\d{3,8}$/.test(text)) {
    return [text.slice(0, 2), text.slice(2, 4), text.slice(4)].filter(Boolean).join("/");
  }
  const monthAndYear = /^(\d{2})\/(\d{3,6})$/.exec(text);
  if (monthAndYear) return `${monthAndYear[1]}/${monthAndYear[2].slice(0, 2)}/${monthAndYear[2].slice(2)}`;
  return text;
}

/** Date-only values never pass through UTC: the entered day is the stored day. */
export function parseDateInput(text: string): string | null {
  const trimmed = text.trim();
  if (!trimmed) return "";
  const local = /^(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})$/.exec(trimmed);
  const iso = local
    ? `${local[3]}-${local[2].padStart(2, "0")}-${local[1].padStart(2, "0")}`
    : trimmed;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(iso) || iso < "0001-01-01") return null;
  const parsed = parseDate(iso);
  return parsed && fmtIso(parsed) === iso ? iso : null;
}

export function displayDateInput(iso: string): string {
  return /^\d{4}-\d{2}-\d{2}$/.test(iso) ? iso.split("-").reverse().join("/") : iso;
}

export function dateInputError(text: string, min?: string, max?: string): string {
  const iso = parseDateInput(text);
  if (iso === null) return "Escribe una fecha válida: DD/MM/AAAA.";
  if (iso && min && iso < min) return `Elige el ${displayDateInput(min)} o una fecha posterior.`;
  if (iso && max && iso > max) return `Elige el ${displayDateInput(max)} o una fecha anterior.`;
  return "";
}

/** Also used by forms with noValidate and by actions outside a form. */
export function validateDateFields(event: SyntheticEvent<HTMLElement>): boolean {
  const scope = event.currentTarget.closest("form, [role='dialog'], [data-date-scope]") ?? event.currentTarget;
  const invalid = Array.from(scope.querySelectorAll<HTMLInputElement>("input[data-date-input]"))
    .find(input => !input.matches(":disabled") && !input.validity.valid);
  if (!invalid) return true;
  event.preventDefault();
  event.stopPropagation();
  invalid.focus();
  invalid.reportValidity();
  return false;
}

