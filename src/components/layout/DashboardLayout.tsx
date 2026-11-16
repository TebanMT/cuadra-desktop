import { useNavigationLayout } from "@/hooks/useNavigationLayout";
import { useEffect, useRef } from "react";
import { Outlet, useLocation } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { TopBar } from "./TopBar";
import { openKioskWindow } from "@/lib/kioskWindow";
import { GlobalCheckinScanner } from "@/components/checkin/GlobalCheckinScanner";

export function DashboardLayout() {
  const { collapsed } = useNavigationLayout();
  const mainRef = useRef<HTMLElement>(null);
  const { pathname } = useLocation();
  // Cada pantalla empieza arriba: el área de trabajo conservaba el
  // desplazamiento de la ruta anterior y cortaba el título.
  useEffect(() => {
    mainRef.current?.scrollTo({ top: 0 });
  }, [pathname]);
  // Atajo global (in-app): Ctrl+Alt+K abre el kiosko desde cualquier
  // pantalla del dashboard sin tener que pasar por /checkin. Distinto del
  // Ctrl+Shift+K que SALE del kiosko (vive en KioskPage) — labels
  // distintos así que no compiten, pero usamos modificador diferente
  // para evitar memoria muscular cruzada.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      // En Mac, Option cambia e.key («˚»); e.code identifica la tecla física.
      if (e.ctrlKey && e.altKey && !e.shiftKey && (e.code === "KeyK" || e.key.toLowerCase() === "k")) {
        const target = e.target as HTMLElement | null;
        if (target) {
          const tag = target.tagName.toLowerCase();
          if (tag === "input" || tag === "textarea" || target.isContentEditable) return;
        }
        e.preventDefault();
        openKioskWindow();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <div className="h-screen w-full overflow-hidden bg-background" style={{ "--sidebar-width": collapsed ? "70px" : "220px" } as React.CSSProperties}>
      <a
        href="#contenido"
        onClick={(e) => { e.preventDefault(); mainRef.current?.focus(); }}
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-3 focus:text-sm focus:font-semibold focus:text-primary-foreground"
      >
        Saltar al contenido
      </a>
      <Sidebar />
      <div className={`flex h-full min-w-0 flex-col ${collapsed ? "pl-[70px]" : "pl-[220px]"}`}>
        <SubscriptionBanner />
        <TopBar />
        <main id="contenido" ref={mainRef} tabIndex={-1} className="flex-1 overflow-auto focus:outline-none">
          <Outlet />
        </main>
      </div>
      {/* Scanner global de huella en background. Lee siempre en la main
          window y muestra el resultado como toast. Se pausa
          automáticamente cuando alguien claima el lector (alta de socio,
          registro de huella) — no hay que detectar la ruta manualmente. */}
      <GlobalCheckinScanner />
    </div>
  );
}
