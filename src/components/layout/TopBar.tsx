import { READ_ONLY_MESSAGE } from "@/lib/writeAccess";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  CircleHelp,
  ChevronDown,
  DollarSign,
  Search,
  Eye,
  EyeOff,
  Fingerprint,
  LogIn as Door,
  LogOut,
  Moon,
  PictureInPicture2,
  Settings,
  Sun,
  User,
} from "lucide-react";
import { useAuthStore } from "@/stores/useAuthStore";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useCashAwareLogout } from "@/hooks/useCashAwareLogout";
import { useReaderMissing } from "@/hooks/useBiometric";
import { useHotkeys } from "@/hooks/useHotkeys";
import { useTheme } from "@/hooks/useTheme";
import { useMoneyVisibility } from "@/hooks/useMoneyVisibility";
import { openKioskWindow } from "@/lib/kioskWindow";
import { openExternalUrl } from "@/lib/openExternal";
import { BILLING_URL } from "@/lib/billing";
import { openCheckinFloatWindow } from "@/lib/floatWindow";
import { useWindowPresence } from "@/hooks/useWindowPresence";
import { CHECKIN_FLOAT_WINDOW_LABEL, KIOSK_WINDOW_LABEL } from "@/lib/windowLabels";
import { QuickPayModal } from "@/components/billing/QuickPayModal";
import { useMember } from "@/hooks/useMembers";
import { shell } from "@/strings/shell";
import { checkin as ct } from "@/strings/checkin";
import { SyncIndicator } from "./SyncIndicator";
import { GlobalSearch } from "./GlobalSearch";

export function TopBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const user = useAuthStore((s) => s.user);
  const readOnly = useAuthStore((s) => s.readOnly);
  const logout = useCashAwareLogout();
  const { resolved, toggle } = useTheme();
  const money = useMoneyVisibility();
  // Aviso gateado por "esta PC ya tuvo lector": un gym que opera por
  // número no ve un badge ámbar eterno. Ver useReaderMissing.
  const readerDisconnected = useReaderMissing();

  // Exclusión mutua kiosco ↔ ventana de entradas: son modos para
  // configuraciones físicas distintas (pantalla dedicada vs compartida) y
  // ambos corren stream biométrico + registran check-ins. Con uno abierto,
  // el launcher del otro se deshabilita; los open* de lib también lo
  // guardan (para el atajo K y botones de otras páginas) con un toast.
  const kioskOpen = useWindowPresence(KIOSK_WINDOW_LABEL);
  const floatOpen = useWindowPresence(CHECKIN_FLOAT_WINDOW_LABEL);

  const [payOpen, setPayOpen] = useState(false);

  const [readOnlyInfo, setReadOnlyInfo] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTrigger = useRef<HTMLButtonElement>(null);
  const searchReturnFocus = useRef<HTMLElement | null>(null);
  const openSearch = useCallback((origin?: HTMLElement | null) => {
    const focused = origin ?? document.activeElement;
    searchReturnFocus.current = focused instanceof HTMLElement && focused !== document.body ? focused : searchTrigger.current;
    setSearchOpen(true);
  }, []);
  // En la ficha de un socio, «Cobrar» le cobra a ese socio (mismo cobro que
  // abre su P). La consulta comparte caché con la ficha: no hay petición extra.
  const memberContextId = location.pathname.match(/^\/members\/(?!new$|import$)([^/]+)\/?$/)?.[1] ?? null;
  const memberContext = memberContextId !== null;
  const openMember = useMember(memberContextId).data?.member;
  const openMemberChargeable = memberContext && openMember?.status === "active";
  const charge = useCallback(() => {
    if (readOnly) return;
    if (memberContextId && openMemberChargeable) {
      navigate({ pathname: location.pathname, search: "?action=pay" }, { replace: true, state: location.state });
      return;
    }
    setPayOpen(true);
  }, [readOnly, memberContextId, openMemberChargeable, navigate, location.pathname, location.state]);

  // Cmd/Ctrl+K to focus the search
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (e.defaultPrevented || document.querySelector('[role="dialog"][data-state="open"], [role="alertdialog"][data-state="open"]')) return;
        e.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [openSearch]);

  // Atajos globales de la toolbar, uno por letra en toda la app:
  // P Cobrar · C Entradas · K Abrir kiosco · V Venta rápida · N Nuevo socio
  // · I Inicio (Ctrl/⌘+K es Buscar; Ctrl+Alt+K vive en DashboardLayout).
  // Viven en el TopBar porque se monta una sola vez en DashboardLayout y
  // aquí están los handlers. En la ficha de un socio, P y C pertenecen a
  // la ficha (cobrar a este socio / preparar su entrada).
  const hotkeys = useMemo(
    () => ({
      ...(!memberContext ? {
        p: () => { if (!readOnly) setPayOpen(true); },
        c: () => navigate("/checkin"),
      } : {}),
      k: () => { void openKioskWindow(); },
      v: () => navigate("/sales"),
      n: () => { if (!readOnly) navigate("/members/new"); },
      // I de "Inicio" — regreso al dashboard desde cualquier pantalla.
      i: () => navigate("/"),
    }),
    [navigate, readOnly, memberContext]
  );
  useHotkeys(hotkeys);

  return (
    <header className="sticky top-0 z-30 shrink-0 border-b border-border bg-background">
      <nav aria-label="Herramientas de recepción" className="flex min-h-16 flex-wrap items-center gap-1 px-4 py-2">
        <Button ref={searchTrigger} variant="ghost" onClick={() => openSearch(searchTrigger.current)} title="Buscar socios y productos (Ctrl o ⌘ + K)">
          <Search aria-hidden="true" />Buscar
        </Button>
        {/* Primario suave: la herramienta más visible de la barra sin competir
            con el único botón relleno de cada página (p. ej. la ficha). */}
        <Button requiresWrite onClick={charge} className="border border-primary/20 bg-primary-soft font-semibold text-primary hover:bg-primary/15" title={openMemberChargeable && openMember ? `Cobrar a ${openMember.full_name} (P)` : "Cobrar (P)"}>
          <DollarSign aria-hidden="true" />Cobrar
        </Button>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" aria-label="Pantallas de entrada" title="Kiosco (K) y ventana de entradas"><PictureInPicture2 aria-hidden="true" />Pantallas<ChevronDown aria-hidden="true" /></Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="w-72">
            <DropdownMenuLabel>Pantallas de entrada</DropdownMenuLabel>
            <DropdownMenuItem disabled={floatOpen} onSelect={() => void openKioskWindow()}>
              <Door aria-hidden="true" />{floatOpen ? ct.float.kioskBlockedByFloat : "Abrir kiosco · K"}
            </DropdownMenuItem>
            <DropdownMenuItem disabled={kioskOpen} onSelect={() => void openCheckinFloatWindow()}>
              <PictureInPicture2 aria-hidden="true" />{kioskOpen ? ct.float.blockedByKiosk : ct.float.launcher}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
        <div role="group" aria-label="Preferencias y ayuda" className="ml-auto flex items-center gap-1 border-l border-border pl-2">
          <Button variant={money.hidden ? "secondary" : "ghost"} className="min-w-14 flex-col gap-0.5 px-2 py-1 text-xs" onClick={money.toggle} aria-pressed={money.hidden} aria-label={money.hidden ? "Mostrar montos" : "Ocultar montos"} title={money.hidden ? "Montos ocultos: mostrar montos" : "Ocultar montos"}>
            {money.hidden ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}<span>Montos</span>
          </Button>
          <Button variant="ghost" className="min-w-14 flex-col gap-0.5 px-2 py-1 text-xs" onClick={toggle} aria-label={resolved === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"} title={resolved === "dark" ? "Cambiar a tema claro" : "Cambiar a tema oscuro"}>
            {resolved === "dark" ? <Moon aria-hidden="true" /> : <Sun aria-hidden="true" />}<span>Tema</span>
          </Button>
          <Button variant="ghost" className="min-w-14 flex-col gap-0.5 px-2 py-1 text-xs" onClick={() => navigate("/help")} aria-label="Ayuda para recepción">
            <CircleHelp aria-hidden="true" /><span>Ayuda</span>
          </Button>
        </div>
        <SyncIndicator compact />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            {/* En 1024–1279px la barra no cabe en un renglón con la palabra:
                queda el icono de persona (con nombre accesible y title). */}
            <Button variant="ghost" aria-label="Cuenta" title="Cuenta" className="gap-1 px-2">
              <User aria-hidden="true" /><span className="hidden xl:inline">Cuenta</span><ChevronDown aria-hidden="true" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuLabel className="font-normal">
              <p className="text-sm font-medium">{user?.full_name}</p>
              <p className="text-xs text-muted-foreground">{user?.role ? shell.roles[user.role] : ""}</p>
            </DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onSelect={() => navigate("/profile")}><User aria-hidden="true" />{shell.user.profile}</DropdownMenuItem>
            <DropdownMenuItem onSelect={() => navigate("/settings")}><Settings aria-hidden="true" />{shell.nav.settings}</DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem disabled={logout.isPending} onSelect={() => void logout.requestLogout()} className="text-destructive focus:text-destructive"><LogOut aria-hidden="true" />{shell.user.logout}</DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </nav>
      {(readOnly || readerDisconnected) && <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border-t px-4 py-1 text-sm">
        {readOnly && <Button variant="ghost" className="text-warning" onClick={() => setReadOnlyInfo(true)} aria-label="Solo lectura: ver explicación"><CircleHelp aria-hidden="true" />Solo lectura · Ver explicación</Button>}
        {readerDisconnected && <span className="flex items-center gap-2 text-warning"><Fingerprint aria-hidden="true" className="h-4 w-4" />Lector desconectado · Usa número o búsqueda</span>}
      </div>}
      <Dialog open={readOnlyInfo} onOpenChange={setReadOnlyInfo}>
        <DialogContent><DialogHeader><DialogTitle>Recepción en solo lectura</DialogTitle><DialogDescription>{READ_ONLY_MESSAGE}</DialogDescription></DialogHeader>
          <p className="text-sm">Puedes consultar fichas, historiales y comprobantes, y registrar entradas. Cobrar, dar de alta, editar y "Permitir de todos modos" vuelven en cuanto se active el plan.</p>
          {user?.role === "owner"
            ? <Button onClick={() => { setReadOnlyInfo(false); void openExternalUrl(BILLING_URL); }}>Activar mi plan</Button>
            : <p className="text-sm text-muted-foreground">Avísale al dueño del gimnasio para que active el plan.</p>}
          <Button variant="outline" onClick={() => { setReadOnlyInfo(false); navigate("/help"); }}>Ver ayuda para recepción</Button>
        </DialogContent>
      </Dialog>
      <QuickPayModal open={payOpen} onOpenChange={setPayOpen} inactiveOpenMember={memberContext && openMember && openMember.status !== "active" ? openMember : null} />
      <Dialog open={searchOpen} onOpenChange={setSearchOpen}>
        <DialogContent onCloseAutoFocus={event => {
          event.preventDefault();
          (searchReturnFocus.current?.isConnected ? searchReturnFocus.current : searchTrigger.current)?.focus();
        }}>
          <DialogHeader><DialogTitle>Buscar en Tinta</DialogTitle><DialogDescription>Consulta socios y productos sin registrar una entrada.</DialogDescription></DialogHeader>
          <GlobalSearch className="w-full" inFlow autoFocus id="dialog-global-search" onSelect={() => setSearchOpen(false)} />
        </DialogContent>
      </Dialog>
      {logout.dialog}
    </header>
  );
}
