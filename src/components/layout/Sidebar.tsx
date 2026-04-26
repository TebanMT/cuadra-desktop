import { NavLink } from "react-router-dom";
import {
  BarChart3,
  Bell,
  CreditCard,
  LayoutDashboard,
  LogIn as Door,
  Package,
  Settings,
  ShoppingCart,
  Users,
  ChevronsLeft,
  ChevronsRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useUIStore } from "@/stores/useUIStore";
import { shell } from "@/strings/shell";
import { Button } from "@/components/ui/button";

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
  const collapsed = useUIStore((s) => s.sidebarCollapsed);
  const toggle = useUIStore((s) => s.toggleSidebar);

  return (
    <aside
      className={cn(
        "flex flex-col border-r bg-background transition-all duration-200",
        collapsed ? "w-16" : "w-60"
      )}
    >
      <div className={cn("flex items-center h-16 px-4 border-b", collapsed && "justify-center px-0")}>
        {!collapsed ? (
          <div className="font-bold text-xl text-primary">Cuadra</div>
        ) : (
          <div className="font-bold text-xl text-primary">C</div>
        )}
      </div>

      <nav className="flex-1 p-2 space-y-1 overflow-y-auto">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              cn(
                "flex items-center gap-3 rounded-md px-3 py-2.5 text-sm font-medium transition-colors",
                "hover:bg-accent hover:text-accent-foreground",
                isActive && "bg-primary/10 text-primary",
                collapsed && "justify-center px-2"
              )
            }
            title={collapsed ? item.label : undefined}
          >
            <item.icon className="h-5 w-5 shrink-0" />
            {!collapsed && <span>{item.label}</span>}
          </NavLink>
        ))}
      </nav>

      <div className="border-t p-2">
        <Button variant="ghost" size="sm" className="w-full justify-center" onClick={toggle}>
          {collapsed ? <ChevronsRight className="h-4 w-4" /> : <ChevronsLeft className="h-4 w-4" />}
        </Button>
      </div>
    </aside>
  );
}
