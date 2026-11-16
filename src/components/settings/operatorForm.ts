import { useEffect, useState } from "react";
import { phoneNumberValid } from "@/components/shared/PhoneInput";
import { ApiError } from "@/lib/api";
import { PERMISSIONS, type Permission } from "@/lib/permissions";
import { settings as t } from "@/strings/settings";

// Form logic shared by the operator create and edit dialogs.

export type OperatorField = "name" | "phone" | "email";
export type OperatorFieldErrors = Partial<Record<OperatorField, string>>;

export interface OperatorIdentity {
  fullName: string;
  dialCode: string;
  phoneNumber: string;
  email: string;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** First invalid field, in the order the form shows them. */
export function validateOperatorIdentity(v: OperatorIdentity): { field: OperatorField; message: string } | null {
  if (v.fullName.trim().length < 3) return { field: "name", message: t.operators.errors.nameShort };
  if (!phoneNumberValid(v.dialCode, v.phoneNumber)) return { field: "phone", message: t.operators.errors.phoneRequired };
  // Email opcional: sólo se valida cuando viene poblado.
  const email = v.email.trim();
  if (email && !EMAIL_RE.test(email)) return { field: "email", message: t.operators.errors.emailInvalid };
  return null;
}

/**
 * A save error next to the field it belongs to when it has one (duplicated
 * phone or email); otherwise a form-level message for the footer.
 */
export function operatorSaveError(err: unknown): { field?: OperatorField; message: string } {
  if (!(err instanceof ApiError)) return { message: t.operators.errors.generic };
  const text = `${err.code} ${err.diagnosticMessage}`;
  if (err.code === "phone_taken_in_gym" || /tel[eé]fono ya est[aá] registrado/i.test(text)) {
    return { field: "phone", message: t.operators.errors.phoneDuplicated };
  }
  if (err.code === "email_already_in_use" || /correo ya (?:tiene una cuenta|est[aá] en uso)/i.test(text)) {
    return { field: "email", message: t.operators.errors.emailDuplicated };
  }
  return { message: err.message };
}

/**
 * Focus a field so the scrolling body brings it (and its error) into view.
 * Waits while the form is sending: a disabled input cannot take focus.
 */
export function useOperatorFieldFocus(idPrefix: string, blocked: boolean) {
  const [target, setTarget] = useState<OperatorField | null>(null);
  useEffect(() => {
    if (!target || blocked) return;
    document.getElementById(`${idPrefix}-${target}`)?.focus();
    setTarget(null);
  }, [target, blocked, idPrefix]);
  return setTarget;
}

/** Footer line: what the operator will be able to do with these permissions. */
export function permissionsSummary(value: readonly Permission[]): string {
  return t.operators.permissions.summary(value.length, PERMISSIONS.length);
}
