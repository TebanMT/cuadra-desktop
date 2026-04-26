import { create } from "zustand";

export type Role = "owner" | "operator";

export interface AuthUser {
  user_id: string;
  full_name: string;
  email: string;
  role: Role;
}

export interface AuthGym {
  gym_id: string;
  name: string | null;
  setup_completed: boolean;
  trial_ends_at: string | null;
  subscription_plan: string;
}

interface AuthState {
  user: AuthUser | null;
  gym: AuthGym | null;
  hydrated: boolean;
  readOnly: boolean;
  setSession(user: AuthUser, gym: AuthGym): void;
  setGym(gym: AuthGym): void;
  setReadOnly(value: boolean): void;
  clear(): void;
  markHydrated(): void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  gym: null,
  hydrated: false,
  readOnly: false,
  setSession: (user, gym) => set({ user, gym }),
  setGym: (gym) => set({ gym }),
  setReadOnly: (value) => set({ readOnly: value }),
  clear: () => set({ user: null, gym: null, readOnly: false }),
  markHydrated: () => set({ hydrated: true }),
}));

export const isAuthenticated = () => useAuthStore.getState().user !== null;
