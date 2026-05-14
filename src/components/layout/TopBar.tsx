import { useEffect, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  Fingerprint,
  LogOut,
  Moon,
  Search,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useLogout } from "@/hooks/useAuth";
import { useBiometricStatus } from "@/hooks/useBiometric";
import { useTheme } from "@/hooks/useTheme";
import { useAttentionRequired } from "@/hooks/useReports";
import { Badge } from "@/components/ui/badge";
import { getAvatarPalette, getInitials } from "@/lib/avatar";
import { shell } from "@/strings/shell";
import { checkin as ct } from "@/strings/checkin";
import { SyncIndicator } from "./SyncIndicator";

const ROUTE_LABELS: Record<string, string> = {
  "": "Dashboard",
  "attention-required": "Atención",
  members: "Socios",
  billing: "Cobros",
  sales: "Venta rápida",
  products: "Productos",
  checkin: "Check-in",
  reports: "Reportes",
  "cash-close": "Caja del día",
  settings: "Configuración",
  profile: "Mi perfil",
  gym: "Perfil del gym",
  "membership-types": "Membresías",
  operators: "Operadores",
  whatsapp: "WhatsApp",
  templates: "Plantillas",
  alerts: "Alertas",
  audit: "Auditoría",
  "audit-log": "Auditoría",
  admin: "Administración",
  messaging: "Mensajería",
  broadcast: "Broadcast",
};

function buildBreadcrumbs(pathname: string): { label: string; href?: string }[] {
  const parts = pathname.split("/").filter(Boolean);
  if (parts.length === 0) return [{ label: "Dashboard" }];
  const crumbs: { label: string; href?: string }[] = [];
  let acc = "";
  for (let i = 0; i < parts.length; i++) {
    acc += `/${parts[i]}`;
    const label = ROUTE_LABELS[parts[i]] ?? parts[i];
    crumbs.push({ label, href: i < parts.length - 1 ? acc : undefined });
  }
  return crumbs;
}

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const readOnly = useAuthStore((s) => s.readOnly);
  const logout = useLogout();
  const bio = useBiometricStatus();
  const { resolved, toggle } = useTheme();
  const attention = useAttentionRequired();
  const readerDisconnected = bio.data?.available === true && !bio.data?.connected;

  const [searchValue, setSearchValue] = useState("");

  const initials = getInitials(user?.full_name);
  const palette = getAvatarPalette(user?.full_name);

  const breadcrumbs = buildBreadcrumbs(location.pathname);

  const attentionCount =
    (attention.data?.expiring_soon?.length ?? 0) +
    (attention.data?.expired_recoverable?.length ?? 0) +
    (attention.data?.low_stock?.length ?? 0) +
    (attention.data?.pending_balance?.length ?? 0);

  // Cmd/Ctrl+K to focus the search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        const el = document.getElementById("global-search");
        el?.focus();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  function handleSearchSubmit(e: React.FormEvent) {
    e.preventDefault();
    const v = searchValue.trim();
    if (!v) return;
    navigate(`/members?q=${encodeURIComponent(v)}`);
  }

  return (
    <header className="sticky top-0 z-30 flex h-16 items-center justify-between gap-4 border-b border-border bg-background/85 backdrop-blur-sm px-6">
      {/* Breadcrumbs */}
      <nav className="flex items-center gap-2 text-sm min-w-0">
        {breadcrumbs.map((crumb, idx) => (
          <div key={idx} className="flex items-center gap-2 min-w-0">
            {idx > 0 && (
              <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            {crumb.href ? (
              <Link
                to={crumb.href}
                className="text-muted-foreground hover:text-foreground transition-colors truncate"
              >
                {crumb.label}
              </Link>
            ) : (
              <span className="font-medium text-foreground truncate">{crumb.label}</span>
            )}
          </div>
        ))}
        {readOnly && (
          <Badge variant="warning" className="ml-2">
            Solo lectura
          </Badge>
        )}
        {readerDisconnected && (
          <Badge variant="warning" className="gap-1.5 ml-2" title={ct.reader.disconnectedBanner}>
            <Fingerprint className="h-3.5 w-3.5" />
            <span className="hidden lg:inline">Lector desconectado</span>
          </Badge>
        )}
      </nav>

      {/* Right cluster */}
      <div className="flex items-center gap-2">
        {/* Global search */}
        <form onSubmit={handleSearchSubmit} className="relative hidden md:block w-72 lg:w-80">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
          <input
            id="global-search"
            type="search"
            placeholder="Buscar socio, producto…"
            value={searchValue}
            onChange={(e) => setSearchValue(e.target.value)}
            className="w-full h-9 rounded-md border border-input bg-background pl-9 pr-14 text-sm placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-0 transition-shadow"
          />
          <kbd className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none inline-flex h-5 select-none items-center gap-1 rounded border border-border bg-muted px-1.5 font-mono text-[10px] font-medium text-muted-foreground">
            ⌘K
          </kbd>
        </form>

        {/* Sync indicator (compact) */}
        <SyncIndicator />

        {/* Attention bell */}
        <Link
          to="/attention-required"
          className="relative inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
          title="Atención requerida"
          aria-label="Atención requerida"
        >
          <Bell className="h-4 w-4" />
          {attentionCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 inline-flex items-center justify-center h-4 min-w-[16px] px-1 rounded-full bg-destructive text-destructive-foreground text-[10px] font-semibold tabular leading-none">
              {attentionCount > 99 ? "99+" : attentionCount}
            </span>
          )}
        </Link>

        {/* Theme toggle */}
        <button
          type="button"
          onClick={toggle}
          aria-label={shell.theme.toggle}
          title={resolved === "dark" ? shell.theme.light : shell.theme.dark}
          className="inline-flex items-center justify-center h-9 w-9 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
        >
          {resolved === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
        </button>

        {/* User menu */}
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button className="relative ml-1 h-9 w-9 rounded-full hover:ring-2 hover:ring-ring hover:ring-offset-2 hover:ring-offset-background transition-shadow">
              <Avatar className="h-9 w-9">
                <AvatarFallback
                  className="text-xs font-semibold"
                  style={{ backgroundColor: palette.bg, color: palette.text }}
                >
                  {initials}
                </AvatarFallback>
              </Avatar>
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="font-normal">
              <div className="flex flex-col gap-0.5">
                <p className="text-sm font-medium leading-none text-foreground">
                  {user?.full_name}
                </p>
                <p className="text-xs leading-none text-muted-foreground">{user?.email}</p>
              </div>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/profile")}>
              <User className="h-4 w-4" />
              {shell.user.profile}
            </DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/settings")}>
              <Settings className="h-4 w-4" />
              {shell.nav.settings}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() => logout.mutate()}
              className="text-destructive focus:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              {shell.user.logout}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
    </header>
  );
}
