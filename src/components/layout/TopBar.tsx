import { useEffect, useMemo, useState } from "react";
import { useLocation, useNavigate, Link } from "react-router-dom";
import {
  Bell,
  ChevronRight,
  DollarSign,
  Eye,
  EyeOff,
  Fingerprint,
  LogIn as Door,
  LogOut,
  Moon,
  Settings,
  ShoppingCart,
  Sun,
  User,
  UserPlus,
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
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTheme } from "@/hooks/useTheme";
import { useAttentionRequired } from "@/hooks/useReports";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { countAttentionItems } from "@/lib/attention";
import { openKioskWindow } from "@/lib/kioskWindow";
import { QuickPayModal } from "@/components/billing/QuickPayModal";
import { Badge } from "@/components/ui/badge";
import { getAvatarPalette, getInitials } from "@/lib/avatar";
import { cn } from "@/lib/utils";
import { shell } from "@/strings/shell";
import { checkin as ct } from "@/strings/checkin";
import { SyncIndicator } from "./SyncIndicator";
import { GlobalSearch } from "./GlobalSearch";

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
  "membership-types": "Membresías y promociones",
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
  const money = useMoneyVisibility();
  const readerDisconnected = bio.data?.available === true && !bio.data?.connected;

  const [payOpen, setPayOpen] = useState(false);

  const initials = getInitials(user?.full_name);
  const palette = getAvatarPalette(user?.full_name);

  const breadcrumbs = buildBreadcrumbs(location.pathname);

  // Mismo conteo que usa la página: socios deduplicados por member_id +
  // productos con stock bajo. Sin dedup la campanita decía "5" cuando la
  // página mostraba 3 socios (uno con tres issues).
  const attentionCount = countAttentionItems(attention.data);

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

  // Atajos globales de la toolbar (P/C/V/N). Viven en el TopBar porque
  // el TopBar se monta una sola vez en DashboardLayout y aquí están los
  // handlers (modal de pago, abrir kiosko, navegación). Así los atajos
  // funcionan en todas las rutas — igual que los botones que los
  // publicitan con el badge en la esquina.
  const hotkeys = useMemo(
    () => ({
      p: () => setPayOpen(true),
      c: () => {
        openKioskWindow();
      },
      v: () => navigate("/sales"),
      n: () => navigate("/members/new"),
    }),
    [navigate]
  );
  useHotkeys(hotkeys);

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
        {/* Quick actions — siempre accesibles desde cualquier pantalla.
            Icon-only para no robar ancho; tooltip muestra label + kbd. */}
        <div className="hidden md:flex items-center gap-1 mr-1 pr-2 border-r border-border">
          <QuickActionButton
            onClick={() => setPayOpen(true)}
            icon={DollarSign}
            label="Cobrar"
            kbd="P"
            tone="brand"
          />
          <QuickActionButton
            onClick={() => openKioskWindow()}
            icon={Door}
            label="Abrir kiosko"
            kbd="C"
          />
          <QuickActionButton
            onClick={() => navigate("/sales")}
            icon={ShoppingCart}
            label="Venta rápida"
            kbd="V"
          />
          <QuickActionButton
            onClick={() => navigate("/members/new")}
            icon={UserPlus}
            label="Nuevo socio"
            kbd="N"
          />
        </div>

        {/* Global search — combobox con dropdown live (socios + productos).
            Mantiene id="global-search" para que Cmd/Ctrl+K siga enfocando. */}
        <GlobalSearch />

        {/* Money visibility toggle — global, persistido. Mismo estado para
            dashboard, /reports, /cash-close, /billing, etc. Cuando está
            "oculto" pintamos el icono en brick + un punto indicador para
            que el operador note que está activo (antes pasaba inadvertido
            en muted gris y la gente olvidaba que tenía los montos
            escondidos). */}
        <button
          type="button"
          onClick={money.toggle}
          aria-label={money.hidden ? "Mostrar montos" : "Ocultar montos"}
          title={money.hidden ? "Mostrar montos" : "Ocultar montos"}
          className={cn(
            "relative inline-flex items-center justify-center h-9 w-9 rounded-md transition-colors",
            money.hidden
              ? "bg-brick-100 text-brick-500 hover:bg-brick-200 dark:bg-brick-500/20 dark:text-brick-300"
              : "text-muted-foreground hover:bg-muted hover:text-foreground"
          )}
        >
          {money.hidden ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
          {money.hidden && (
            <span
              aria-hidden="true"
              className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-brick-500"
            />
          )}
        </button>

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

      <QuickPayModal open={payOpen} onOpenChange={setPayOpen} />
    </header>
  );
}

// QuickActionButton — botón cuadrado icon-only para la toolbar global del
// TopBar. La kbd se publicita con un mini-badge en la esquina inferior
// derecha (no duplica el ancho del botón) y se mantiene en title +
// aria-label como fallback para screen readers. El "tone='brand'" se
// usa para la acción primaria de cobrar — la más frecuente y la que el
// operador quiere encontrar primero.
function QuickActionButton({
  onClick,
  icon: Icon,
  label,
  kbd,
  tone = "neutral",
}: {
  onClick: () => void;
  icon: typeof DollarSign;
  label: string;
  kbd: string;
  tone?: "neutral" | "brand";
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={`${label} (${kbd})`}
      className={cn(
        "relative inline-flex items-center justify-center h-9 w-9 rounded-md transition-colors",
        tone === "brand"
          ? "bg-brick-100 text-brick-500 hover:bg-brick-200 dark:bg-brick-500/20 dark:text-brick-300"
          : "text-muted-foreground hover:bg-muted hover:text-foreground"
      )}
    >
      <Icon className="h-4 w-4" strokeWidth={2.25} />
      <span
        aria-hidden="true"
        className="pointer-events-none absolute bottom-0.5 right-1 font-mono text-[9px] font-semibold leading-none tracking-tight opacity-60"
      >
        {kbd}
      </span>
    </button>
  );
}
