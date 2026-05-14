import { useEffect, useRef } from "react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/lib/api";
import { drainLegacyChargeSettings } from "@/lib/gymCharges";

// GymChargeSettings — el shape autoritativo a nivel gym de los cobros
// extra (inscripción + mantenimiento). Vive en `gyms.charge_settings`
// (JSONB) y se sincroniza entre equipos del mismo gym vía el pipeline
// de sync existente. Reemplaza el localStorage previo, que era volátil
// y per-device.
export interface GymChargeSettings {
  charges_enrollment?: boolean;
  charges_maintenance?: boolean;
  enrollment_amount?: number;
  maintenance_amount?: number;
  maintenance_frequency?: string;
}

export const GYM_CHARGE_SETTINGS_KEY = ["gyms", "me", "charge-settings"] as const;

async function fetchSettings(): Promise<GymChargeSettings> {
  return api.get<GymChargeSettings>("/api/v1/gyms/me/charge-settings");
}

async function patchSettings(input: Partial<GymChargeSettings>): Promise<GymChargeSettings> {
  return api.patch<GymChargeSettings>("/api/v1/gyms/me/charge-settings", input);
}

// useGymChargeSettings — fuente de verdad para los flags + montos del
// gym. Hace migración suave del localStorage previo en el primer fetch:
// si el backend devuelve {} y hay valores legacy en LS, los sube al
// backend y borra el LS. Cero pérdida de datos para gyms ya configurados
// antes de este cambio.
export function useGymChargeSettings() {
  const qc = useQueryClient();
  const migratedRef = useRef(false);
  const query = useQuery<GymChargeSettings>({
    queryKey: GYM_CHARGE_SETTINGS_KEY,
    queryFn: fetchSettings,
    staleTime: 60_000,
  });

  useEffect(() => {
    if (migratedRef.current) return;
    if (!query.data) return;
    // Sólo migramos cuando el backend reportó valores vacíos. Si ya hay
    // algo configurado, la fuente de verdad es backend y el LS legacy
    // se descarta sin subirlo (evita pisar config buena con basura
    // vieja).
    const empty =
      query.data.charges_enrollment === undefined &&
      query.data.charges_maintenance === undefined &&
      query.data.enrollment_amount === undefined &&
      query.data.maintenance_amount === undefined &&
      query.data.maintenance_frequency === undefined;
    if (!empty) {
      migratedRef.current = true;
      drainLegacyChargeSettings();
      return;
    }
    const legacy = drainLegacyChargeSettings();
    if (!legacy) {
      migratedRef.current = true;
      return;
    }
    migratedRef.current = true;
    patchSettings(legacy)
      .then((data) => qc.setQueryData(GYM_CHARGE_SETTINGS_KEY, data))
      .catch(() => {
        // Si el PATCH falla (offline, permisos, etc.), no perdemos los
        // datos: drainLegacyChargeSettings ya nos los devolvió en
        // memoria. El operador puede re-guardar manualmente desde
        // Ajustes y los valores vuelven a aplicarse.
      });
  }, [query.data, qc]);

  return query;
}

export function useUpdateGymChargeSettings() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: patchSettings,
    onSuccess: (data) => qc.setQueryData(GYM_CHARGE_SETTINGS_KEY, data),
  });
}
