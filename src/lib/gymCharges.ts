// Legado: hasta el cambio a `gyms.charge_settings` en backend, la config
// de cobros del gym vivía sólo en localStorage. Este archivo queda como
// puente de migración: drainLegacyChargeSettings() lee los valores que
// pudieran existir en LS, los devuelve para subirlos al backend y luego
// los borra. Cualquier código nuevo debe usar useGymChargeSettings (que
// pega al endpoint `/api/v1/gyms/me/charge-settings`).
//
// Mantener este archivo durante un par de releases mientras quede
// chance de que algún operador esté actualizando desde una versión
// pre-backend. Eliminarlo cuando todos los gyms hayan migrado (verificar
// con telemetry / cuando ya no llegue ningún PATCH con datos legacy).

const LS_KEY_ENROLLMENT = "tinta.gym.charge_enrollment";
const LS_KEY_MAINTENANCE = "tinta.gym.charge_maintenance";
const LS_KEY_ENROLLMENT_AMOUNT = "tinta.gym.enrollment_amount";
const LS_KEY_MAINTENANCE_AMOUNT = "tinta.gym.maintenance_amount";
const LS_KEY_MAINT_FREQ = "tinta.gym.maintenance_frequency";

const ALL_KEYS = [
  LS_KEY_ENROLLMENT,
  LS_KEY_MAINTENANCE,
  LS_KEY_ENROLLMENT_AMOUNT,
  LS_KEY_MAINTENANCE_AMOUNT,
  LS_KEY_MAINT_FREQ,
] as const;

export interface LegacyChargeSettings {
  charges_enrollment?: boolean;
  charges_maintenance?: boolean;
  enrollment_amount?: number;
  maintenance_amount?: number;
  maintenance_frequency?: string;
}

function safeRead(key: string): string | null {
  try {
    return localStorage.getItem(key);
  } catch {
    return null;
  }
}

function safeRemove(key: string) {
  try {
    localStorage.removeItem(key);
  } catch {
    /* ignore */
  }
}

// drainLegacyChargeSettings devuelve los valores LS si existían (al
// menos uno setteado) y los borra. Si no había nada, devuelve null
// — el caller puede saltarse el PATCH.
export function drainLegacyChargeSettings(): LegacyChargeSettings | null {
  const enrollmentFlag = safeRead(LS_KEY_ENROLLMENT);
  const maintenanceFlag = safeRead(LS_KEY_MAINTENANCE);
  const enrollmentAmt = safeRead(LS_KEY_ENROLLMENT_AMOUNT);
  const maintenanceAmt = safeRead(LS_KEY_MAINTENANCE_AMOUNT);
  const freq = safeRead(LS_KEY_MAINT_FREQ);

  if (
    enrollmentFlag === null &&
    maintenanceFlag === null &&
    enrollmentAmt === null &&
    maintenanceAmt === null &&
    freq === null
  ) {
    return null;
  }

  const out: LegacyChargeSettings = {};
  if (enrollmentFlag !== null) out.charges_enrollment = enrollmentFlag === "1";
  if (maintenanceFlag !== null) out.charges_maintenance = maintenanceFlag === "1";
  if (enrollmentAmt !== null) {
    const n = parseFloat(enrollmentAmt);
    if (Number.isFinite(n) && n >= 0) out.enrollment_amount = n;
  }
  if (maintenanceAmt !== null) {
    const n = parseFloat(maintenanceAmt);
    if (Number.isFinite(n) && n >= 0) out.maintenance_amount = n;
  }
  if (freq !== null && freq !== "") out.maintenance_frequency = freq;

  // Borramos siempre — incluso si los valores eran inválidos, no queremos
  // que vuelvan a subir en el próximo arranque.
  ALL_KEYS.forEach(safeRemove);
  return out;
}
