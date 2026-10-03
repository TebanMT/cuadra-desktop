/** Presentation only: codes, details and the original message stay on ApiError. */
export function apiErrorMessage(status: number, code: string, message: string): string {
  const diagnostic = `${code} ${message}`;
  if (/idempotenc|idempotency/i.test(diagnostic)) {
    return /conflict|usad|reutiliz/i.test(diagnostic)
      ? "Este intento ya se registró con otros datos. Revisa el registro antes de repetirlo."
      : "No se pudo preparar la operación. Actualiza Tinta y vuelve a intentarlo.";
  }
  if (/uq_gyms_whatsapp/i.test(diagnostic)) return "Este número de WhatsApp ya está registrado en otro gimnasio.";
  if (/version_conflict|versión (?:no coincide|desactualizada)|expected_version/i.test(diagnostic)) {
    return "El registro cambió en otro dispositivo. Vuelve a abrirlo antes de guardar.";
  }
  if (/SQLSTATE|constraint failed|database is locked|no such (?:table|column)|panic:|runtime error|invalid memory|stack trace|cannot (?:unmarshal|scan)|json:|idempotency_key|foreign key|unique constraint/i.test(diagnostic)) {
    return "No se pudo completar la operación. Si continúa, contacta a soporte.";
  }
  if (status >= 500) return "No se pudo confirmar la operación. Revisa el registro antes de intentar de nuevo.";
  if (!message || /^(?:Internal Server Error|Bad Request|Forbidden|Unauthorized|Not Found|Conflict|Service Unavailable|Unprocessable Entity)$/i.test(message)) {
    if (status === 401) return "Inicia sesión de nuevo para continuar.";
    if (status === 403) return "Tu cuenta no tiene permiso para esta acción.";
    if (status === 404) return "No se encontró el registro. Actualiza la pantalla.";
    if (status === 409) return "El registro cambió. Vuelve a abrirlo antes de guardar.";
    if (status === 400 || status === 422) return "Revisa los datos e intenta de nuevo.";
    return "No se pudo completar la operación. Vuelve a intentar.";
  }
  return message;
}
