import { useEffect, useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Calculator,
  CreditCard,
  LayoutDashboard,
  LogIn as Door,
  LogOut,
  Lock,
  Package,
  Receipt,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import { LogoIcon } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";
import { getAppVersion } from "@/lib/tauri-bridge";
import { getAvatarPalette, getInitials } from "@/lib/avatar";
import { shell } from "@/strings/shell";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLogout } from "@/hooks/useAuth";
import { canAccessPlusFeatures } from "@/hooks/useSubscription";

// Sidebar agrupado por frecuencia de uso. Los items diarios (Inicio,
// Check-in, Ingresos, Venta rápida, Socios) van arriba en "Operación".
// El catálogo
// (planes, productos) es de set-up y revisión puntual. Programas
// (Retos) es opcional según el gym. Reportes y Ajustes quedan abajo
// porque son admin / mensual.
// En estado colapsado (sidebar hover-off) los headers de grupo
// desaparecen y queda sólo una línea divisoria para preservar la
// jerarquía visual sin invadir el ancho de 70px.
interface NavItem {
  to: string;
  icon: typeof CreditCard;
  label: string;
  end?: boolean;
  // kbd: atajo global de una letra (useHotkeys en TopBar) que este item
  // publicita — chip sutil expandido, "(X)" en el title colapsado.
  kbd?: string;
  // plusOnly: el item se muestra con CANDADO cuando el gym no es Plus
  // (decisión ago-2026: el candado es el vendedor de Plus); el click
  // aterriza en el PlusFeatureLock de la página.
  plusOnly?: boolean;
  // ownerOnly: el item se OCULTA para operadores (plan Reports-improve:
  // "rol se oculta, Plus se encandada" — al operador no se le vende nada).
  // La ruta además vive bajo OwnerOnlyRoute y el BE la gatea con
  // RequireOwner; esto sólo limpia el sidebar.
  ownerOnly?: boolean;
}
interface NavGroup {
  label: string;
  items: NavItem[];
}
const NAV_GROUPS: NavGroup[] = [
  {
    label: shell.navGroups.operation,
    items: [
      { to: "/", icon: LayoutDashboard, label: shell.nav.dashboard, end: true, kbd: "I" },
      { to: "/checkin", icon: Door, label: shell.nav.checkin },
      { to: "/billing", icon: CreditCard, label: shell.nav.billing },
      { to: "/reports/cash-close", icon: Calculator, label: shell.nav.cashClose },
      { to: "/sales", icon: ShoppingCart, label: shell.nav.sales },
      { to: "/members", icon: Users, label: shell.nav.members },
    ],
  },
  {
    label: shell.navGroups.catalog,
    items: [
      // Promovido desde Configuración: el dueño consulta sus planes y
      // productos varias veces durante la setup-week y el catálogo de
      // ventas, no merece estar enterrado.
      { to: "/settings/membership-types", icon: CreditCard, label: shell.nav.membershipTypes },
      { to: "/products", icon: Package, label: shell.nav.products },
      // Gastos básicos son Standard; recurrencias y análisis conservan gate Plus.
      { to: "/expenses", icon: Receipt, label: shell.nav.expenses, ownerOnly: true },
    ],
  },
  {
    label: shell.navGroups.reports,
    items: [
      { to: "/reports", icon: BarChart3, label: shell.nav.reports, ownerOnly: true, end: true },
      // Corte de caja es tarea de cierre del OPERADOR — entrada propia
      // porque el único acceso anterior era un link dentro de /reports,
      // que ahora es owner-only. Grupo Reportes (no Operación) para
      // respetar el cap de ≤6 items por grupo.
    ],
  },
  {
    label: shell.navGroups.settings,
    items: [{ to: "/settings", icon: Settings, label: shell.nav.settings, end: true }],
  },
];

export function Sidebar() {
  const [hovered, setHovered] = useState(false);
  const [version, setVersion] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);
  const isPlus = canAccessPlusFeatures(gym?.subscription_plan);
  const logout = useLogout();
  const navigate = useNavigate();

  // Decisión ago-2026 (Esteban): los items Plus se MUESTRAN con candado en
  // lugar de ocultarse — el candado es el vendedor de Plus. Al hacer click
  // la página aterriza en su PlusFeatureLock (el upsell). El acceso real
  // sigue gateado por canAccessPlusFeatures + PlanGate del backend.
  // Los items ownerOnly en cambio se OCULTAN para operadores (rol se
  // oculta, Plus se encandada); los grupos que quedan vacíos desaparecen.
  const isOwner = user?.role === "owner";
  const visibleGroups = NAV_GROUPS.map((g) => ({
    ...g,
    items: g.items.filter((i) => !i.ownerOnly || isOwner),
  })).filter((g) => g.items.length > 0);

  useEffect(() => {
    getAppVersion().then(setVersion).catch(() => undefined);
  }, []);

  const initials = getInitials(user?.full_name);
  const palette = getAvatarPalette(user?.full_name);

  return (
    <aside
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out",
        hovered ? "w-[260px]" : "w-[70px]"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div className="flex h-16 items-center gap-3 border-b border-sidebar-border px-4">
          <LogoIcon size={40} />
          <div
            className={cn(
              "flex flex-col overflow-hidden transition-opacity duration-200",
              hovered ? "opacity-100" : "opacity-0"
            )}
          >
            <span
              className="font-display text-xl font-semibold leading-none text-sidebar-foreground tracking-tight whitespace-nowrap"
              style={{ letterSpacing: "-0.025em" }}
            >
              Tinta
            </span>
            {gym?.name && (
              <span className="text-[11px] text-sidebar-muted leading-none mt-1.5 truncate">
                {gym.name}
              </span>
            )}
          </div>
        </div>

        {/* Navigation */}
        <nav className="flex-1 overflow-y-auto p-2 space-y-1">
          {visibleGroups.map((group, gi) => (
            <div key={group.label} className="space-y-0.5">
              {/* Header de grupo: visible sólo cuando el sidebar está
                  expandido. En modo colapsado mostramos una línea
                  divisoria muy sutil para preservar la jerarquía. */}
              {gi > 0 && !hovered && (
                <div className="my-2 mx-3 border-t border-sidebar-border/40" />
              )}
              {hovered && (
                <div className="px-3 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-[0.08em] text-sidebar-muted">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const locked = !isPlus && item.plusOnly;
                return (
                  <NavLink
                    key={item.to}
                    to={item.to}
                    end={item.end}
                    title={
                      !hovered
                        ? locked
                          ? `${item.label} · Plus`
                          : item.kbd
                            ? `${item.label} (${item.kbd})`
                            : item.label
                        : undefined
                    }
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors h-10",
                        isActive
                          ? "bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]"
                          : "text-ink-500 hover:bg-paper-200 hover:text-ink-700 dark:text-ink-300 dark:hover:bg-ink-700 dark:hover:text-paper-50",
                        locked && "opacity-60"
                      )
                    }
                  >
                    <item.icon
                      className={cn("h-5 w-5 shrink-0", !hovered && "mx-auto")}
                      strokeWidth={2}
                    />
                    <span
                      className={cn(
                        "whitespace-nowrap transition-opacity duration-200 flex-1",
                        hovered ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
                      )}
                    >
                      {item.label}
                    </span>
                    {locked && hovered && (
                      <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-muted" strokeWidth={2} />
                    )}
                    {!locked && item.kbd && hovered && (
                      <kbd className="ml-auto shrink-0 inline-flex h-4 min-w-[1rem] items-center justify-center rounded px-1 text-[10px] font-mono bg-paper-200 text-ink-500 dark:bg-ink-700 dark:text-ink-300">
                        {item.kbd}
                      </kbd>
                    )}
                  </NavLink>
                );
              })}
            </div>
          ))}
        </nav>

        {/* User profile — el avatar + nombre son CTA hacia /profile. Antes
            eran sólo display y la única forma de llegar a "Mi perfil" era
            el dropdown del top-bar, que un dueño no-técnico no descubre
            (síntoma: "no puedo asignar mi PIN"). El botón de logout queda
            como ícono aparte para no robar clicks accidentales. */}
        <div className="border-t border-sidebar-border p-2">
          <div className="flex items-center gap-3 rounded-md p-2">
            <button
              type="button"
              onClick={() => navigate("/profile")}
              title={shell.user.profile}
              aria-label={shell.user.profile}
              className="flex flex-1 min-w-0 items-center gap-3 rounded-md text-left hover:bg-[hsl(var(--sidebar-hover))] transition-colors"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold"
                style={{ backgroundColor: palette.bg, color: palette.text }}
              >
                {initials}
              </div>
              <div
                className={cn(
                  "flex-1 overflow-hidden min-w-0 transition-opacity duration-200",
                  hovered ? "opacity-100" : "opacity-0 w-0"
                )}
              >
                <p className="text-sm font-medium text-sidebar-foreground leading-tight truncate">
                  {user?.full_name ?? "—"}
                </p>
                <p className="text-[11px] text-sidebar-muted capitalize leading-tight mt-0.5">
                  {user?.role ?? ""}
                </p>
              </div>
            </button>
            <button
              onClick={() => logout.mutate()}
              title={shell.user.logout}
              aria-label={shell.user.logout}
              className={cn(
                "h-8 w-8 shrink-0 inline-flex items-center justify-center rounded-md text-sidebar-muted hover:bg-[hsl(var(--sidebar-hover))] hover:text-sidebar-foreground transition-all duration-200",
                hovered ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
              )}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          {hovered && version && (
            <p className="px-2 pb-0.5 text-[10px] leading-none text-sidebar-muted tabular-nums">
              {version === "dev" ? "dev" : `v${version}`}
            </p>
          )}
        </div>
      </div>
    </aside>
  );
}
