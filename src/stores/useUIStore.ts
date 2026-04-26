import { create } from "zustand";

interface UIState {
  sidebarCollapsed: boolean;
  theme: "light" | "dark";
  toggleSidebar(): void;
  setTheme(theme: "light" | "dark"): void;
}

export const useUIStore = create<UIState>((set) => ({
  sidebarCollapsed: false,
  theme: "light",
  toggleSidebar: () => set((s) => ({ sidebarCollapsed: !s.sidebarCollapsed })),
  setTheme: (theme) => set({ theme }),
}));
