import type { GymChargeSettings } from "@/hooks/useGymChargeSettings";

/** An empty, confirmed configuration is valid. Missing data is never zero fees.
 * Cached local data remains usable while offline or during a failed refresh. */
export function chargeSettingsReady(data: GymChargeSettings | null | undefined) {
  return data != null;
}

export const CHARGE_SETTINGS_REQUIRED = "Confirma las cuotas del gimnasio antes de cobrar.";

