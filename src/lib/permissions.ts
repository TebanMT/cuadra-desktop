import { useAuthStore, type AuthUser, type Role } from "@/stores/useAuthStore";

// ---------------------------------------------------------------------------
// Two separate things live here:
//
// 1. can(): what the FE paints by ROLE (reports, money KPIs, margins). The
//    P&L belongs to the owner; operations belong to reception. The role
//    HIDES (nothing is sold to the operator); Plus LOCKS.
//
// 2. Per-operator permissions: actions the owner turns on or off for
//    each reception employee (Ajustes → Operadores). The owner always has
//    all of them. The backend enforces them (middleware + use cases and a
//    403 with the reason); here we only hide the controls so the operator
//    doesn't fill a form that is going to be rejected.
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

export type Permission =
  | "discounts"
  | "credit"
  | "cash_out"
  | "view_totals"
  | "checkin_override"
  | "products"
  | "inventory"
  | "member_status";

export interface PermissionInfo {
  key: Permission;
  title: string;
  description: string;
}

export const PERMISSIONS: readonly PermissionInfo[] = [
  {
    key: "discounts",
    title: "Descuentos y montos",
    description: "Dar descuentos, cambiar inscripción o mantenimiento y registrar cobros con fecha atrasada.",
  },
  {
    key: "credit",
    title: "Fiar",
    description: "Cobrar una membresía a medias o vender a crédito a un socio.",
  },
  {
    key: "cash_out",
    title: "Sacar dinero de caja",
    description: "Retiros de efectivo y gastos pagados con dinero de la caja.",
  },
  {
    key: "view_totals",
    title: "Ver totales de dinero",
    description: "Ver el total cobrado, el efectivo del día y cobros o cortes de otros días.",
  },
  {
    key: "checkin_override",
    title: "Dejar pasar vencidos",
    description: "Permitir la entrada a un socio con membresía vencida o adeudo.",
  },
  {
    key: "products",
    title: "Productos y precios",
    description: "Crear, editar, cambiar precio o desactivar productos.",
  },
  {
    key: "inventory",
    title: "Ajustar inventario",
    description: "Conteos y ajustes manuales de existencias.",
  },
  {
    key: "member_status",
    title: "Dar de baja socios",
    description: "Desactivar a un socio o marcarlo como perdido.",
  },
];

export interface PermissionGroup {
  key: "money" | "members" | "products";
  title: string;
  permissions: readonly Permission[];
}

/**
 * How the owner reads the catalog when assigning permissions. Only for
 * display: payloads keep the PERMISSIONS order.
 */
export const PERMISSION_GROUPS: readonly PermissionGroup[] = [
  { key: "money", title: "Dinero", permissions: ["discounts", "credit", "cash_out", "view_totals"] },
  { key: "members", title: "Socios", permissions: ["checkin_override", "member_status"] },
  { key: "products", title: "Productos", permissions: ["products", "inventory"] },
];

/**
 * Legacy generic line. Prefer permissionHint(key) or <RestrictedNote>, which
 * name the permission so the operator knows exactly what to ask for.
 */
export const PERMISSION_HINT = "Pídele al dueño que te lo active.";

export function permissionTitle(permission: Permission): string {
  return PERMISSIONS.find((p) => p.key === permission)?.title ?? permission;
}

/** «Requiere el permiso «Fiar». Pídeselo al dueño.» */
export function permissionHint(permission: Permission): string {
  return `Requiere el permiso «${permissionTitle(permission)}». Pídeselo al dueño.`;
}

type PermissionHolder = Pick<AuthUser, "role" | "permissions"> | null | undefined;

/**
 * The owner always can. A session without `permissions` comes from a build
 * before permissions existed (persisted login): show the control and let
 * the backend decide, instead of hiding features the operator still has.
 */
export function hasPermission(user: PermissionHolder, permission: Permission): boolean {
  if (!user) return false;
  if (user.role === "owner") return true;
  if (!user.permissions) return true;
  return user.permissions.includes(permission);
}

/** Hook: permission of the signed-in user. */
export function usePermission(permission: Permission): boolean {
  return useAuthStore((s) => hasPermission(s.user, permission));
}
