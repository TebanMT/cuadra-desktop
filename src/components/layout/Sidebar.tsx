import { useState } from "react";
import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Bell,
  CreditCard,
  LayoutDashboard,
  LogIn as Door,
  LogOut,
  Package,
  Settings,
  ShoppingCart,
  Users,
} from "lucide-react";
import { LogoIcon } from "@/components/shared/Logo";
import { cn } from "@/lib/utils";
import { getAvatarPalette, getInitials } from "@/lib/avatar";
import { shell } from "@/strings/shell";
import { useAuthStore } from "@/stores/useAuthStore";
import { useLogout } from "@/hooks/useAuth";

const NAV = [
  { to: "/", icon: LayoutDashboard, label: shell.nav.dashboard, end: true },
  { to: "/attention-required", icon: Bell, label: shell.nav.attention },
  { to: "/members", icon: Users, label: shell.nav.members },
  { to: "/billing", icon: CreditCard, label: shell.nav.billing },
  { to: "/sales", icon: ShoppingCart, label: shell.nav.sales },
  { to: "/products", icon: Package, label: shell.nav.products },
  { to: "/checkin", icon: Door, label: shell.nav.checkin },
  { to: "/reports", icon: BarChart3, label: shell.nav.reports },
  { to: "/settings", icon: Settings, label: shell.nav.settings },
];

export function Sidebar() {
  const [hovered, setHovered] = useState(false);
  const user = useAuthStore((s) => s.user);
  const gym = useAuthStore((s) => s.gym);
  const logout = useLogout();

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
        <nav className="flex-1 overflow-y-auto p-2 space-y-0.5">
          {NAV.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              title={!hovered ? item.label : undefined}
              className={({ isActive }) =>
                cn(
                  "group flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors h-10",
                  isActive
                    // Active = soft pill (brick-100 bg + brick-600 text)
                    // vía CSS vars --sidebar-active / -foreground que
                    // ya apuntan a los tokens correctos en globals.css.
                    ? "bg-[hsl(var(--sidebar-active))] text-[hsl(var(--sidebar-active-foreground))]"
                    // Inactive: ink-500 sobre transparente con hover
                    // paper-200. Explicit en lugar de heredar del
                    // sidebar-foreground (que sigue siendo ink-900,
                    // usado por el wordmark "Tinta"). Dark variants
                    // mantienen jerarquía sobre canvas oscuro.
                    : "text-ink-500 hover:bg-paper-200 hover:text-ink-700 dark:text-ink-300 dark:hover:bg-ink-700 dark:hover:text-paper-50"
                )
              }
            >
              <item.icon
                className={cn("h-5 w-5 shrink-0", !hovered && "mx-auto")}
                strokeWidth={2}
              />
              <span
                className={cn(
                  "whitespace-nowrap transition-opacity duration-200",
                  hovered ? "opacity-100" : "opacity-0 w-0 overflow-hidden"
                )}
              >
                {item.label}
              </span>
            </NavLink>
          ))}
        </nav>

        {/* User profile */}
        <div className="border-t border-sidebar-border p-2">
          <div className="flex items-center gap-3 rounded-md p-2">
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
        </div>
      </div>
    </aside>
  );
}
