import { daysFromToday, fmtDayMonth } from "@/lib/dates";
import type { AccessStatus } from "@/hooks/useMembers";

// Vigencia: la respuesta a «¿puede pasar?» en una sola forma para toda la
// app (búsqueda, lista, ficha, cobro, entradas). Se deriva de access_status
// —la decisión del backend— y de la fecha de vencimiento; nunca del
// `membership.status` crudo, que puede seguir en «active» con la fecha ya
// pasada.

export type VigenciaTone = "success" | "warning" | "destructive" | "neutral";

export interface Vigencia {
  tone: VigenciaTone;
  /** Palabra principal: «Vigente», «Por vencer», «Vencido»… */
  label: string;
  /** Precisión con fecha o plazo: «hasta 3 dic», «hace 39 días». */
  detail: string;
  /** El acceso está permitido hoy. */
  canEnter: boolean;
  /** La acción natural es cobrar (vencido o sin primer pago). */
  needsPayment: boolean;
}

export interface VigenciaInput {
  accessStatus?: AccessStatus | null;
  expiryDate?: string | null;
}

function plural(n: number, one: string, many: string) {
  return n === 1 ? one : many;
}

export function vigenciaFrom({ accessStatus, expiryDate }: VigenciaInput): Vigencia {
  const days = expiryDate ? daysFromToday(expiryDate) : null;
  switch (accessStatus) {
    case "allowed_active":
      return {
        tone: "success",
        label: "Vigente",
        detail: expiryDate ? `hasta ${fmtDayMonth(expiryDate)}` : "",
        canEnter: true,
        needsPayment: false,
      };
    case "allowed_expiring_soon": {
      const n = Math.max(0, days ?? 0);
      return {
        tone: "warning",
        label: "Por vencer",
        detail: n === 0 ? "vence hoy" : n === 1 ? "vence mañana" : `vence en ${n} días`,
        canEnter: true,
        needsPayment: false,
      };
    }
    case "denied_expired": {
      const n = Math.abs(Math.min(0, days ?? 0));
      return {
        tone: "destructive",
        label: "Vencido",
        detail: n === 0 ? "venció hoy" : n === 1 ? "venció ayer" : `hace ${n} ${plural(n, "día", "días")}`,
        canEnter: false,
        needsPayment: true,
      };
    }
    case "denied_unpaid_enrollment":
      return { tone: "destructive", label: "Sin primer pago", detail: "cobra para activar", canEnter: false, needsPayment: true };
    case "denied_no_membership":
      return { tone: "neutral", label: "Sin membresía", detail: "", canEnter: false, needsPayment: false };
    case "denied_inactive":
      return { tone: "neutral", label: "Inactivo", detail: "dado de baja", canEnter: false, needsPayment: false };
    default: {
      // Sin decisión del backend (datos viejos): inferir sólo por fecha.
      if (days == null) return { tone: "neutral", label: "Sin membresía", detail: "", canEnter: false, needsPayment: false };
      if (days < 0) return vigenciaFrom({ accessStatus: "denied_expired", expiryDate });
      if (days <= 7) return vigenciaFrom({ accessStatus: "allowed_expiring_soon", expiryDate });
      return vigenciaFrom({ accessStatus: "allowed_active", expiryDate });
    }
  }
}

/** Texto plano para lectores de pantalla y títulos: «Vencido, hace 39 días». */
export function vigenciaText(v: Vigencia): string {
  return v.detail ? `${v.label}, ${v.detail}` : v.label;
}
