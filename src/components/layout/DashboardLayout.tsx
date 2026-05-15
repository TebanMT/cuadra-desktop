import { useEffect } from "react";
import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { TopBar } from "./TopBar";
import { openKioskWindow } from "@/lib/kioskWindow";

export function DashboardLayout() {
  // Atajo global (in-app): Ctrl+Alt+K abre el kiosko desde cualquier
  // pantalla del dashboard sin tener que pasar por /checkin. Distinto del
  // Ctrl+Shift+K que SALE del kiosko (vive en KioskPage) — labels
  // distintos así que no compiten, pero usamos modificador diferente
  // para evitar memoria muscular cruzada.
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.ctrlKey && e.altKey && !e.shiftKey && e.key.toLowerCase() === "k") {
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
    <div className="h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex h-full flex-col pl-[70px]">
        <SubscriptionBanner />
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
