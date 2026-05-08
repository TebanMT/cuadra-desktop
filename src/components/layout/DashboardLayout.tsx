import { Outlet } from "react-router-dom";
import { Sidebar } from "./Sidebar";
import { SubscriptionBanner } from "./SubscriptionBanner";
import { TopBar } from "./TopBar";

export function DashboardLayout() {
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
