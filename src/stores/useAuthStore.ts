import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";

export type Role = "owner" | "operator";

export interface AuthUser {
  user_id: string;
  full_name: string;
  email: string;
  phone: string | null;
  role: Role;
  // has_pin: derived server-side from users.pin_hash. Drives the
  // "Crear PIN" vs "Cambiar PIN" toggle on the profile page. Defaults
  // to false on older responses that haven't been redeployed yet.
  has_pin: boolean;
}

export type SubscriptionStatus = "active" | "past_due" | "cancelled";

export interface AuthGym {
  gym_id: string;
  name: string | null;
  setup_completed: boolean;
  trial_ends_at: string | null;
  subscription_plan: string;
  subscription_status: SubscriptionStatus;
  subscription_ends_at: string | null;
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

// Persisting user + gym keeps the operator signed in across reloads even
// when the sidecar is briefly unreachable: the route guards see the cached
// session immediately, useHydrateAuth refreshes it in the background.
// Only `clear()` (explicit logout) wipes the persisted entry.
export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      user: null,
      gym: null,
      hydrated: false,
      readOnly: false,
      setSession: (user, gym) => set({ user, gym }),
      setGym: (gym) => set({ gym }),
      setReadOnly: (value) => set({ readOnly: value }),
      clear: () => set({ user: null, gym: null, readOnly: false }),
      markHydrated: () => set({ hydrated: true }),
    }),
    {
      name: "tinta.session",
      storage: createJSONStorage(() => localStorage),
      partialize: (s) => ({ user: s.user, gym: s.gym }),
    }
  )
);

export const isAuthenticated = () => useAuthStore.getState().user !== null;

/**
 * isSubscriptionBlocked refleja la decisión de IsAccessHardBlocked del
 * dominio BE (gym.go). El sidecar también devuelve 402 cuando esto es
 * true; tener el cómputo en FE permite al ProtectedRoute redirigir al
 * usuario a la pantalla de bloqueo sin esperar a que un endpoint falle.
 *
 * Reglas:
 *   - status != cancelled       → no bloqueado (trial activo, past_due, paid)
 *   - status = cancelled        → bloqueado SALVO grace period vigente
 */
export function isSubscriptionBlocked(gym: AuthGym | null | undefined): boolean {
  if (!gym) return false;
  if (gym.subscription_status !== "cancelled") return false;
  if (!gym.subscription_ends_at) return true;
  return new Date(gym.subscription_ends_at).getTime() <= Date.now();
}
