import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { TopBar } from "./TopBar";

export function DashboardLayout() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-background">
      <Sidebar />
      <div className="flex flex-1 flex-col overflow-hidden">
        <TopBar />
        <main className="flex-1 overflow-auto">
          <Outlet />
        </main>
        <footer className="h-8 border-t flex items-center justify-end px-4 text-xs text-muted-foreground">
          Cuadra v0.1.0
        </footer>
      </div>
    </div>
  );
}
