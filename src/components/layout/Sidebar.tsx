import { useUIStore } from "@/stores/useUIStore";
import { useNavigationLayout } from "@/hooks/useNavigationLayout";
import { PanelLeftClose, PanelLeftOpen } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  BarChart3,
  Calculator,
  CreditCard,
  IdCard,
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
import { LogoSymbol, TintaWordmark } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";
import { getAppVersion } from "@/lib/tauri-bridge";
import { getInitials } from "@/lib/avatar";
import { shell } from "@/strings/shell";
import { useAuthStore } from "@/stores/useAuthStore";
import { useCashAwareLogout } from "@/hooks/useCashAwareLogout";
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
      { to: "/checkin", icon: Door, label: shell.nav.checkin, kbd: "C" },
      { to: "/billing", icon: CreditCard, label: shell.nav.billing },
      { to: "/reports/cash-close", icon: Calculator, label: shell.nav.cashClose },
      { to: "/sales", icon: ShoppingCart, label: shell.nav.sales, kbd: "V" },
      { to: "/members", icon: Users, label: shell.nav.members },
    ],
  },
  {
    label: shell.navGroups.catalog,
    items: [
      // Promovido desde Configuración: el dueño consulta sus planes y
      // productos varias veces durante la setup-week y el catálogo de
      // ventas, no merece estar enterrado.
      { to: "/settings/membership-types", icon: IdCard, label: shell.nav.membershipTypes },
      { to: "/products", icon: Package, label: shell.nav.products },
      // Gastos básicos son Standard; recurrencias y análisis conservan gate Plus.
      { to: "/expenses", icon: Receipt, label: shell.nav.expenses, ownerOnly: true },
    ],
  },
  {
    // Un solo grupo para lo administrativo: dos encabezados de un solo
    // elemento repetían su propia etiqueta y empujaban la navegación bajo
    // el pliegue a 1280×800.
    label: "Administración",
    items: [
      { to: "/reports", icon: BarChart3, label: shell.nav.reports, ownerOnly: true, end: true },
      { to: "/settings", icon: Settings, label: shell.nav.settings, end: true },
    ],
  },
];

export function Sidebar() {
  const [pointerInside, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const navRef = useRef<HTMLElement>(null);
  const [moreBelow, setMoreBelow] = useState(false);
  const sidebarRef = useRef<HTMLElement>(null);
  const keyboardInteraction = useRef(true);

  useEffect(() => {
    const onPointerDown = () => {
      keyboardInteraction.current = false;
      setFocused(false);
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      keyboardInteraction.current = true;
      if (sidebarRef.current?.contains(document.activeElement)) setFocused(true);
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    document.addEventListener("keydown", onKeyDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.removeEventListener("keydown", onKeyDown, true);
    };
  }, []);
  const { collapsed, compact } = useNavigationLayout();
  const [overlayPinned, setOverlayPinned] = useState(false);
  const toggleSidebar = useUIStore(s => s.toggleSidebar);
  const pinned = compact ? overlayPinned : !collapsed;
  const hovered = pinned || pointerInside || focused;
  useEffect(() => {
    const nav = navRef.current;
    if (!nav) return;
    const measure = () => setMoreBelow(nav.scrollHeight - nav.clientHeight - nav.scrollTop > 4);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(nav);
    if (nav.firstElementChild) observer.observe(nav.firstElementChild);
    nav.addEventListener("scroll", measure);
    return () => { observer.disconnect(); nav.removeEventListener("scroll", measure); };
  }, [hovered]);
  // En ventanas bajas (1024×640) la lista no cabe: al cambiar de ruta
  // traemos a la vista el ítem activo para que la ubicación nunca quede
  // escondida bajo el borde.
  const { pathname } = useLocation();
  useEffect(() => {
    navRef.current?.querySelector('[aria-current="page"]')?.scrollIntoView({ block: "nearest" });
  }, [pathname, hovered]);
  const [version, setVersion] = useState<string | null>(null);
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);
  const isPlus = canAccessPlusFeatures(gym);
  const logout = useCashAwareLogout();
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

  return (
    <aside
      ref={sidebarRef}
      aria-label="Navegación principal"
      onFocusCapture={() => setFocused(keyboardInteraction.current)}
      onBlurCapture={(e) => { if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setFocused(false); }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      className={cn(
        "fixed left-0 top-0 z-40 h-screen border-r border-sidebar-border bg-sidebar transition-[width] duration-200 ease-out",
        hovered ? "w-[220px]" : "w-[70px]"
      )}
    >
      <div className="flex h-full flex-col">
        {/* Brand */}
        <div className="flex h-16 shrink-0 items-center gap-2.5 border-b border-sidebar-border pl-[19px] pr-2">
          <LogoSymbol size={32} tone="white" />
          <div
            className={cn(
              "flex min-w-0 flex-1 flex-col overflow-hidden transition-opacity duration-200",
              hovered ? "opacity-100" : "opacity-0"
            )}
          >
            <TintaWordmark className="w-[72px]" tone="white" />
            {gym?.name && (
              <span className="text-[11px] text-sidebar-muted leading-none mt-1.5 truncate">
                {gym.name}
              </span>
            )}
          </div>
          <button type="button" onClick={() => compact ? setOverlayPinned((value) => !value) : toggleSidebar()} aria-pressed={pinned}
            aria-label={pinned ? "Contraer navegación" : "Fijar navegación"}
            title={pinned ? "Contraer navegación" : "Fijar navegación"}
            className={cn(
              "flex h-11 w-11 shrink-0 items-center justify-center rounded-md text-sidebar-muted transition-colors hover:bg-[hsl(var(--sidebar-hover))] hover:text-sidebar-foreground",
              !hovered && "pointer-events-none opacity-0"
            )}
            tabIndex={hovered ? 0 : -1}>
            {pinned ? <PanelLeftClose className="h-5 w-5" aria-hidden /> : <PanelLeftOpen className="h-5 w-5" aria-hidden />}
          </button>
        </div>
        {/* Navigation */}
        {/* Si hay más ítems abajo, el borde inferior se desvanece: indica
            que la lista sigue sin ocupar un renglón ni tapar el último ítem
            con un botón. */}
        <nav
          ref={navRef}
          className="tinta-sidebar-scroll flex-1 overflow-y-auto p-2 space-y-1 [@media(max-height:760px)]:space-y-0 [@media(max-height:760px)]:py-1"
          style={moreBelow ? { maskImage: "linear-gradient(to bottom, #000 calc(100% - 2.25rem), transparent)", WebkitMaskImage: "linear-gradient(to bottom, #000 calc(100% - 2.25rem), transparent)" } : undefined}
        >
          {visibleGroups.map((group, gi) => (
            <div key={group.label} className="space-y-0.5 [@media(max-height:760px)]:space-y-0">
              {/* Header de grupo: visible sólo cuando el sidebar está
                  expandido. En modo colapsado mostramos una línea
                  divisoria muy sutil para preservar la jerarquía. */}
              {gi > 0 && !hovered && (
                <div className="my-2 mx-3 border-t border-sidebar-border" />
              )}
              {hovered && (
                <div className="px-3 pt-3 pb-1 text-xs font-medium text-sidebar-muted [@media(max-height:760px)]:pt-1">
                  {group.label}
                </div>
              )}
              {group.items.map((item) => {
                const locked = !isPlus && item.plusOnly;
                return (
                  <NavLink
                    key={item.to}
                    onClick={() => setOverlayPinned(false)}
                    to={item.to}
                    end={item.end}
                    aria-keyshortcuts={item.kbd}
                    title={
                      !hovered
                        ? locked
                          ? `${item.label} · Acceso no habilitado`
                          : item.kbd
                            ? `${item.label} (${item.kbd})`
                            : item.label
                        : undefined
                    }
                    className={({ isActive }) =>
                      cn(
                        "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors min-h-11",
                        isActive
                          ? "bg-[hsl(var(--sidebar-active))] font-semibold text-[hsl(var(--sidebar-active-foreground))]"
                          : "text-sidebar-muted hover:bg-[hsl(var(--sidebar-hover))] hover:text-sidebar-foreground",
                        locked && "opacity-60"
                      )
                    }
                  >
                    <item.icon
                      aria-hidden
                      className={cn(
                        "h-5 w-5 shrink-0 group-aria-[current=page]:text-[hsl(var(--sidebar-marker))]",
                        !hovered && "mx-auto"
                      )}
                      strokeWidth={2}
                    />
                    <span
                      className={cn(
                        "min-w-0 transition-opacity duration-200 flex-1",
                        hovered ? "opacity-100 whitespace-normal leading-snug" : "opacity-0 w-0 overflow-hidden"
                      )}
                    >
                      {item.label}
                    </span>
                    {locked && hovered && (
                      <Lock className="ml-auto h-3.5 w-3.5 shrink-0 text-sidebar-muted" strokeWidth={2} />
                    )}
                    {!locked && item.kbd && hovered && (
                      <kbd aria-hidden className="ml-auto inline-flex h-5 min-w-[1.25rem] shrink-0 items-center justify-center rounded border border-sidebar-border px-1 font-sans text-[11px] font-medium text-sidebar-muted">
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
                aria-hidden
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-sidebar-border bg-[hsl(var(--sidebar-hover))] text-xs font-semibold text-sidebar-foreground"
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
                  {user?.role ? shell.roles[user.role] : ""}
                </p>
              </div>
            </button>
            <button
              onClick={() => void logout.requestLogout()}
              disabled={logout.isPending}
              title={shell.user.logout}
              aria-label={shell.user.logout}
              className={cn(
                "h-11 w-11 shrink-0 inline-flex items-center justify-center rounded-md text-sidebar-muted hover:bg-[hsl(var(--sidebar-hover))] hover:text-sidebar-foreground transition-all duration-200",
                hovered ? "opacity-100 whitespace-normal leading-snug" : "opacity-0 w-0 overflow-hidden"
              )}
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
          {hovered && version && (
            <p className="px-2 pb-0.5 text-[11px] leading-none text-sidebar-muted tabular-nums [@media(max-height:760px)]:hidden">
              {version === "dev" ? "dev" : `v${version}`}
            </p>
          )}
        </div>
      </div>
      {logout.dialog}
    </aside>
  );
}
