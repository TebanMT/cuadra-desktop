import { create } from "zustand";
import { persist } from "zustand/middleware";

interface UIState {
  sidebarCollapsed: boolean;
  theme: "light" | "dark";
  toggleSidebar(): void;
  setTheme(theme: "light" | "dark"): void;
}

export const useUIStore = create<UIState>()(persist((set) => ({
  sidebarCollapsed: false,
  theme: "light",
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTheme: (theme) => set({ theme }),
}), { name: "tinta.navigation", partialize: (state) => ({ sidebarCollapsed: state.sidebarCollapsed }) }));
