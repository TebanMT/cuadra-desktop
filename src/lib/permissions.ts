import { useAuthStore, type Role } from "@/stores/useAuthStore";

// ---------------------------------------------------------------------------
// can() — helper central de capacidades por rol (plan Reports-improve
// transversal §5). Decisión explícita: NO es un sistema de permisos
// (ABAC/matriz); dos roles hoy no ameritan más. El día que exista el rol
// intermedio ("encargado"), se agrega UNA fila aquí — no una cacería de
// `role === "owner"` regados por el código.
//
// Principio: el P&L es del dueño; la operación es del operador. Rol se
// OCULTA (no se vende nada al operador); Plus se ENCANDADA (el candado es
// un vendedor). El enforcement real vive en el BE (RequireOwner + wire
// role-aware); esto sólo decide qué pinta el FE.
// ---------------------------------------------------------------------------

export type Capability =
  /** Página de Reportes completa (rango + exports + género). */
  | "view_reports"
  /** KPIs de dinero del MES en Inicio (ingresos, egresos, ganancia). */
  | "view_money_kpis"
  /** Márgenes en Productos (costo promedio, ganancia potencial). */
  | "view_product_margins";

const OWNER_ONLY: ReadonlySet<Capability> = new Set([
  "view_reports",
  "view_money_kpis",
  "view_product_margins",
]);

export function can(role: Role | undefined, capability: Capability): boolean {
  if (!OWNER_ONLY.has(capability)) return true;
  return role === "owner";
}

/** Hook: capacidad del usuario logueado. */
export function useCan(capability: Capability): boolean {
  const role = useAuthStore((s) => s.user?.role);
  return can(role, capability);
}
